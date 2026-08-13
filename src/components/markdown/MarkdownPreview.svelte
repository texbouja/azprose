<script lang="ts">
import { onDestroy } from "svelte";
import { openUrl } from "@tauri-apps/plugin-opener";
// Polices de DOCUMENT — PAS chargées au boot (vague 2, phase 2.4) : ce
// composant est LE pipeline de rendu markdown, monté par les deux fenêtres
// (aucun pipeline parallèle, cf. tête de browse-app.svelte) — c'est ici
// qu'elles sont réellement nécessaires, pas avant.
import "@/styles/fonts-doc.css";
// Pipeline de rendu (.mdv-prose/.azp-slide__content, callouts, transclusion,
// colles…) — contrat CSS du composant (vague 3, phase 3.1), partagé avec
// DocPreview.svelte et SlideDeck.svelte (mêmes classes) : chacun l'importe
// directement plutôt que de compter sur la fenêtre (app.css).
import "@/styles/markdown/preview.css";
import {
  renderMarkdown,
  decorateCodeBlocks,
  ensurePreviewReady,
  makeCalloutsCollapsible,
  updateCalloutIcons,
  stripAutoCalloutTitles,
  postRenderDom,
  slugify,
  type RenderResult,
} from "@/markdown";
import { calloutSettings, generateCalloutCss } from "@/stores/callout-settings.svelte";
import { subscribeMode, type Theme } from "@/lib/theme";
import { typesetMath } from "@/lib/typeset-math";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { previewSettings } from "@/stores/markdown-settings.svelte";
import { buildPreviewProseCss } from "@/lib/prose-style-css";
import { getRootPath } from "@/stores/root-path.svelte";
import { clearScrollTarget, consumeScrollTarget } from "@/stores/scroll-target.svelte";
import { getPreviewFocusStore } from "@/stores/preview-focus.svelte";

let {
  value = "",
  filePath = null as string | null,
  rev = 0,
  onTransclusion,
  onDiagnostics,
  onDiagnosticsClear,
  onConsumeSyncLine,
  onClearSyncLine,
}: {
  value?: string;
  filePath?: string | null;
  /** Version du CONTENU (phase 7, idée E) : le store bump la version du chemin
   *  à chaque load/persist — même si `value` n'a pas changé (string primitive),
   *  `rev` change → l'effet de rendu re-run. Remplace le listener
   *  `azprose:preview-force-rerender` (bouton « Recharger », reload externe). */
  rev?: number;
  /** Capacité « transclusion » (vague 3, phase 3.2) : marque les blocs transclus
   *  (data-transcluded-from/-line) pour que le double-clic ouvre le fichier
   *  source — sans objet sans éditeur pour recevoir le saut (NAV, R1 lecture
   *  seule). Callback injectée par l'appelant plutôt qu'importée ici :
   *  markTranscludedBlocks() (et son import de @/markdown) ne rejoint donc
   *  le bundle QUE des fenêtres qui la fournissent (PROJET). */
  onTransclusion?: (article: HTMLElement, ranges: RenderResult["ranges"]) => void;
  /** Capacité « diagnostics de rendu » (vague 3, phase 3.2) : publie les erreurs
   *  MathJax/images cassées vers la console Diagnostics — propre à PROJET
   *  (aucune console de ce genre dans NAV). Même schéma d'injection que
   *  onTransclusion : @/lib/render-diagnostics ne rejoint que le bundle PROJET. */
  onDiagnostics?: (article: HTMLElement, brokenImages: string[]) => void;
  /** Nettoyage au démontage — pendant du précédent, jamais appelé si absent. */
  onDiagnosticsClear?: () => void;
  /** Capacité « synchronisation de scroll éditeur » (vague 3, phase 3.2) :
   *  consomme la ligne de saut en attente (TOC/backlinks/tags/curseur après
   *  sauvegarde) posée par l'éditeur — sans objet sans éditeur (NAV, R1). À
   *  distinguer de consumeScrollTarget ci-dessus (scroll-target.svelte, saut
   *  vers un TITRE après navigation wikilink) : ce dernier reste utile à NAV
   *  (R4, navigation par wikilink) et n'est PAS mis en capacité ici. */
  onConsumeSyncLine?: (filePath?: string | null) => number | null;
  /** Appelée pour annuler un saut déjà honoré par l'écouteur d'événement
   *  (azprose:preview-jump-line) — pendant de setSyncLine(null). */
  onClearSyncLine?: () => void;
} = $props();

let articleEl: HTMLElement | undefined = $state();
let ready = $state(false);
let zoom = $state(100);

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

function zoomIn() {
  const i = ZOOM_STEPS.indexOf(zoom);
  zoom = i < 0 ? 100 : ZOOM_STEPS[Math.min(i + 1, ZOOM_STEPS.length - 1)];
}

function zoomOut() {
  const i = ZOOM_STEPS.indexOf(zoom);
  zoom = i < 0 ? 100 : ZOOM_STEPS[Math.max(i - 1, 0)];
}

$effect(() => {
  const css = buildPreviewProseCss(previewSettings.current);
  const el = document.createElement("style");
  el.id = "mdv-preview-prose-css";
  el.textContent = css;
  document.head.appendChild(el);
  return () => el.remove();
});

$effect(() => {
  const css = generateCalloutCss(calloutSettings.current);
  const el = document.createElement("style");
  el.id = "mdv-preview-callout-css";
  el.textContent = css;
  document.head.appendChild(el);
  return () => el.remove();
});

let currentTheme = $state<Theme>(
  (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte",
);

$effect(() => {
  return subscribeMode(() => {
    currentTheme = (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte";
  });
});

$effect(() => {
  let cancelled = false;
  void ensurePreviewReady().then(() => {
    if (!cancelled) ready = true;
  });
  return () => { cancelled = true; };
});

// ── Math cache: preserve MathJax SVGs across re-renders ──────────────────
// Maps data-math-source → outerHTML (MathJax-rendered <mjx-container>)
const mathCache = new Map<string, string>();
let lastPreamble = "";

function extractMathFromDom(el: HTMLElement): void {
  for (const node of el.querySelectorAll<HTMLElement>("[data-math-source]")) {
    const source = node.getAttribute("data-math-source");
    if (source && node.innerHTML.includes("mjx-container")) {
      mathCache.set(source, node.outerHTML);
    }
  }
}

function injectCachedMath(dom: HTMLElement): void {
  for (const node of dom.querySelectorAll<HTMLElement>("[data-math-source]")) {
    const source = node.getAttribute("data-math-source");
    if (!source) continue;
    const cached = mathCache.get(source);
    if (cached) node.outerHTML = cached;
  }
}

// ── Callout state cache: preserve open/closed across re-renders ───────────
const calloutStateCache = new Map<string, boolean>();

function extractCalloutState(el: HTMLElement): void {
  calloutStateCache.clear();
  const counters = new Map<string, number>();
  for (const d of el.querySelectorAll<HTMLDetailsElement>("details.callout")) {
    const type = d.dataset.callout ?? "";
    const idx = counters.get(type) ?? 0;
    counters.set(type, idx + 1);
    calloutStateCache.set(`${type}#${idx}`, d.open);
  }
}

function restoreCalloutState(el: HTMLElement): void {
  const counters = new Map<string, number>();
  for (const d of el.querySelectorAll<HTMLDetailsElement>("details.callout")) {
    const type = d.dataset.callout ?? "";
    const idx = counters.get(type) ?? 0;
    counters.set(type, idx + 1);
    const key = `${type}#${idx}`;
    if (calloutStateCache.has(key)) {
      d.open = calloutStateCache.get(key)!;
    }
  }
}

$effect(() => {
  const p = mathJaxPreamble.current.trim();
  if (p !== lastPreamble) {
    lastPreamble = p;
    mathCache.clear();
  }
});

// Re-rendu forcé : porté par la prop `rev` (version du chemin dans le store,
// phase 7 E) — plus de listener `azprose:preview-force-rerender`. L'effet de
// rendu lit `void rev` → il re-rend même si `value` n'a pas changé
// (transclusion ou réglages changés sur disque avec contenu hôte identique).

$effect(() => {
  if (!ready) return;
  const src = value;
  const theme = currentTheme;
  void rev; // dépendance : incrémenter force un re-rendu même si src est identique
  let cancelled = false;
  let cleanupCode = () => {};

  // Cache old math SVGs, callout state, and scroll position before re-rendering
  let scrollPct = 0;
  if (articleEl) {
    extractMathFromDom(articleEl);
    extractCalloutState(articleEl);
    const scroller = articleEl.closest<HTMLElement>(".mdv-preview");
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      scrollPct = scroller.scrollTop / (scroller.scrollHeight - scroller.clientHeight);
    }
  }

  // Update callout icons from current settings before rendering
  updateCalloutIcons(calloutSettings.current);

  void renderMarkdown(src, theme, filePath ?? undefined, getRootPath() ?? undefined).then(async (result) => {
    if (cancelled || !articleEl) return;

    // Process callouts immediately before first paint
    const tmp = document.createElement("div");
    tmp.innerHTML = result.html;
    stripAutoCalloutTitles(tmp);
    makeCalloutsCollapsible(tmp);

    // Re-inject cached MathJax SVGs for unchanged formulas
    injectCachedMath(tmp);

    articleEl.innerHTML = tmp.innerHTML;
    restoreCalloutState(articleEl);

    cleanupCode();
    cleanupCode = decorateCodeBlocks(articleEl);
    const { brokenImages } = await postRenderDom(articleEl, { filePath, rootPath: getRootPath() ?? undefined });
    await typesetMath(articleEl);
    if (!cancelled) onDiagnostics?.(articleEl, brokenImages);

    // Mark transcluded blocks so double-click opens the original source file
    onTransclusion?.(articleEl, result.ranges);

    // Scroll to heading if navigated via wikilink
    const scrollHeading = consumeScrollTarget();
    if (scrollHeading && articleEl) {
      const id = scrollHeading.toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/ /g, "-")
        .replace(/^-|-$/g, "");
      const target = articleEl.querySelector(`#${CSS.escape(id)}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (scrollPct > 0) {
      // Restore scroll position
      const scroller = articleEl.closest<HTMLElement>(".mdv-preview");
      if (scroller) {
        requestAnimationFrame(() => {
          scroller.scrollTop = scrollPct * (scroller.scrollHeight - scroller.clientHeight);
        });
      }
    }

    // Scroll to editor cursor position after save (line-bound pending jump —
    // guarded by file path so an unrelated render never consumes it).
    const syncLine = onConsumeSyncLine?.(filePath) ?? null;
    if (syncLine != null && articleEl) {
      const target = findLineTarget(articleEl, syncLine);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  return () => {
    cancelled = true;
    cleanupCode();
  };
});

onDestroy(() => onDiagnosticsClear?.());

// ── TOC jump: scroll to a source line on demand (sidebar TOC click) ───────
// The editor jump is handled by app.svelte (azprose:jump-to-file). This
// listener syncs the OPEN preview without waiting for a re-render (a TOC
// click does not change `value`, so the syncLine consumed in the render
// effect would never fire). Filtered by filePath so a preview of another
// file stays put. When the block already exists we scroll and clear the
// pending syncLine to avoid a double scroll at the next render.
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter((s) => s !== ".").join("/");
}

/**
 * Trouve le bloc rendu correspondant à une ligne source 0-based : le bloc qui
 * CONTIENT la ligne (data-sline <= line < data-eline — le curseur est souvent
 * au milieu d'un paragraphe, pas sur sa première ligne), sinon le bloc
 * précédent le plus proche (ligne vide, ou curseur dans un bloc transclus dont
 * le data-sline a été remplacé par data-transcluded-line). Les data-sline sont
 * croissants dans l'ordre du document (valeurs source dés-décalées) → break.
 */
function findLineTarget(el: HTMLElement, line: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const b of el.querySelectorAll<HTMLElement>("[data-sline]")) {
    const s = Number(b.dataset.sline);
    if (!Number.isFinite(s)) continue;
    if (s > line) break; // tout ce qui suit est sous le curseur
    const e = Number(b.dataset.eline);
    if (Number.isFinite(e) && e > line) return b; // le bloc contient la ligne
    best = b;
  }
  return best; // curseur après le dernier bloc (ou aucun bloc)
}

$effect(() => {
  // Read both runes synchronously so Svelte tracks them as dependencies —
  // the listener closure would otherwise keep stale values forever.
  const fp = filePath;
  const el = articleEl;
  const onJump = (e: Event) => {
    const { path, line, heading } = (e as CustomEvent<{ path: string; line?: number; heading?: string }>).detail;
    if (!path || !fp) return;
    if (normalizePath(fp) !== normalizePath(path)) return;
    // Prefer the heading id: immune to transclusion line shifts (data-sline of
    // blocks below a ![[…]] expansion is shifted). Fall back to the 0-based
    // data-sline for jumps without a heading (backlinks, tags, dbl-click).
    let target: HTMLElement | null = null;
    if (heading) {
      target = el?.querySelector(`#${CSS.escape(slugify(heading))}`) ?? null;
    }
    if (!target && line != null) {
      target = el ? findLineTarget(el, line) : null;
    }
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      // The event scrolled already — cancel the pending render-time syncs.
      onClearSyncLine?.();
      clearScrollTarget();
    }
  };
  window.addEventListener("azprose:preview-jump-line", onJump);
  return () => window.removeEventListener("azprose:preview-jump-line", onJump);
});

$effect(() => {
  if (!articleEl) return;
  const el = articleEl;
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;

    // PDF rect link: open PDF at page/rect (must check before wikilink since pdf-link has both classes)
    if (a.classList.contains("pdf-link") || a.classList.contains("pdf-rect-link")) {
      e.preventDefault();
      const pdfPath = a.getAttribute("data-pdf-path") || a.getAttribute("data-wikilink-fullpath") || a.getAttribute("data-wikilink-target");
      const pageNum = Number(a.getAttribute("data-pdf-page"));
      const rectStr = a.getAttribute("data-pdf-rect");
      if (pdfPath) {
        window.dispatchEvent(new CustomEvent("azprose:pdf-rect-navigate", {
          detail: { path: pdfPath, page: pageNum || undefined, rect: rectStr || undefined },
        }));
      }
      return;
    }

    // Wikilink : NOUVEAU tab viewer side avec dédup par contenu (jamais
    // l'éditeur main — il ne s'atteint que par double-clic / « Ouvrir dans
    // l'éditeur »). La lecture EN CHAÎNE se fait dans la fenêtre fille browser
    // (Phase F/G : plus de mode navigation dans les panneaux). `ctrlKey`
    // (ou cmd sur macOS) est transporté dans le détail : la fenêtre NAV
    // l'utilise pour ses conventions navigateur (R4 — clic = sur place,
    // ctrl+clic = nouvel onglet) ; le panneau projet l'ignore (règle atomique).
    if (a.classList.contains("wikilink")) {
      const fullpath = a.getAttribute("data-wikilink-fullpath");
      const heading = a.getAttribute("data-wikilink-heading");
      const ctrlKey = e.ctrlKey || e.metaKey;
      if (fullpath) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("azprose:wikilink-navigate", { detail: { path: fullpath, heading, ctrlKey } }));
        return;
      }
      // Fallback: dispatch with target name for app.svelte resolution
      const target = a.getAttribute("data-wikilink-target");
      if (target) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("azprose:wikilink-navigate", { detail: { target, heading, ctrlKey } }));
      }
      return;
    }

    if (href.startsWith("#")) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const target =
        el.querySelector(`[id="${CSS.escape(id)}"]`) ??
        el.querySelector(`[id="${id}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (/^https?:\/\//.test(href)) {
      e.preventDefault();
      void openUrl(href);
    }
  };
  el.addEventListener("click", onClick);
  return () => el.removeEventListener("click", onClick);
});

// ── Focus preview (règle non-état : ctrl+s au focus preview enregistre le
//    .md affiché, pas le tab main actif) ────────────────────────────────────
$effect(() => {
  const previewFocus = getPreviewFocusStore();
  const onFocusIn = () => {
    const active = document.activeElement as HTMLElement | null;
    const inside = active?.closest?.("[data-file-path]") as HTMLElement | null;
    previewFocus.setFocus(inside?.dataset.filePath ?? null);
  };
  document.addEventListener("focusin", onFocusIn);
  return () => document.removeEventListener("focusin", onFocusIn);
});

// ── Zoom commands from TabActions ───────────────────────────────

$effect(() => {
  const handler = (e: Event) => {
    const { cmd } = (e as CustomEvent).detail;
    if (cmd === "zoom-in") zoomIn();
    else if (cmd === "zoom-out") zoomOut();
    else if (cmd === "zoom-reset") zoom = 100;
  };
  window.addEventListener("azprose:viewer-command", handler);
  return () => window.removeEventListener("azprose:viewer-command", handler);
});
</script>

<div class="mdv-preview" style={zoom !== 100 ? `zoom: ${zoom / 100}` : ""}>
  {#if !ready}
    <div class="mdv-preview__loading">chargement…</div>
  {:else if value.trim().length === 0}
    <div class="mdv-preview__empty">document vide</div>
  {:else}
    <article
    bind:this={articleEl}
    class="mdv-prose"
    data-file-path={filePath ?? undefined}
    ondblclick={(e) => {
      // Transcluded block: jump to the original source file at the source
      // line — the .md source IS opened in the editor (forced open, user
      // rule), but always the TRANSCLUDED file, never an arbitrary active
      // tab. data-transcluded-line is a 0-based offset and
      // azprose:jump-to-line is 0-based too.
      const transcluded = (e.target as HTMLElement).closest<HTMLElement>("[data-transcluded-from]");
      if (transcluded) {
        const path = transcluded.dataset.transcludedFrom;
        const line = Number(transcluded.dataset.transcludedLine);
        if (path) {
          window.dispatchEvent(new CustomEvent("azprose:jump-to-line", {
            detail: { path, line: Number.isFinite(line) ? line : undefined },
          }));
        }
        return;
      }
      // Normal inverse search: jump to line in current file. The event carries
      // the path of the RENDERED file (this preview tab's path — re-associated
      // on every navigation) plus this tab's session id (phase 3 C) so the
      // reducer resolves the jump via the link table. app.svelte opens THAT
      // .md in the editor (forced open, user rule) — never the tab that
      // happens to be active.
      const block = (e.target as HTMLElement).closest<HTMLElement>("[data-sline]");
      if (!block) return;
      const line = Number(block.dataset.sline);
      if (Number.isFinite(line)) {
        window.dispatchEvent(new CustomEvent("azprose:jump-to-line", {
          detail: { path: filePath, line },
        }));
      }
    }}
  ></article>
  {/if}
</div>

<style>
  .mdv-preview {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    padding: 32px 48px 80px;
    box-sizing: border-box;
  }

  .mdv-preview__loading,
  .mdv-preview__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
