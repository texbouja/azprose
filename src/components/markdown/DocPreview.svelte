<script lang="ts">
import { onDestroy } from "svelte";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  renderMarkdown,
  decorateCodeBlocks,
  ensurePreviewReady,
  markTranscludedBlocks,
  makeCalloutsCollapsible,
  updateCalloutIcons,
  stripAutoCalloutTitles,
  postRenderDom,
  slugify,
} from "@/markdown";
import { calloutSettings } from "@/stores/callout-settings.svelte";
import { subscribeMode, type Theme } from "@/lib/theme";
import { typesetMath } from "@/lib/typeset-math";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { collectRenderDiagnostics, clearRenderDiagnostics } from "@/lib/render-diagnostics";
import { getRootPath } from "@/stores/root-path.svelte";
import { consumeScrollTarget } from "@/stores/scroll-target.svelte";
import { getHelpBundle, neighbors, helpRelativePath } from "@/help";
import { helpDir, helpFilePath, isHelpPath } from "@/lib/help-install";
import { getT, language } from "@/lib/i18n";

/**
 * Lecteur de la documentation intégrée (`.azprose/help/`).
 *
 * Dérivé du viewer Markdown, mais STRICTEMENT lecture seule :
 * - pas de `onJumpToLine` ni de double-clic (aucune édition dans l'app) ;
 * - Alt+clic ignoré : les wikilinks naviguent TOUJOURS en place, tab unique ;
 * - les liens internes à la doc (wikilinks, footer précédent/suivant)
 *   naviguent via `azprose:doc-navigate` — jamais l'éditeur ;
 * - la TOC de la sidebar reste ancrée sur `index.md` (géré par app.svelte).
 */
let {
  value = "",
  filePath = null as string | null,
}: {
  value?: string;
  filePath?: string | null;
} = $props();

let t = $derived(getT($language));

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Math cache: preserve MathJax SVGs across re-renders ──────────────────
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

// ── Callout state cache ───────────────────────────────────────────────────
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
    if (calloutStateCache.has(key)) d.open = calloutStateCache.get(key)!;
  }
}

$effect(() => {
  const p = mathJaxPreamble.current.trim();
  if (p !== lastPreamble) {
    lastPreamble = p;
    mathCache.clear();
  }
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

// ── Résolution doc-first des wikilinks du lecteur ─────────────────────────
// Le vault index exclut `.azprose/` (dot-dirs) : sans ce correctif, les liens
// du guide résoudraient vers les copies `docs/user/…` du vault (basename) et
// ouvriraient un onglet externe au lieu de rester dans le lecteur. On re-résout
// ici RELATIVEMENT au dossier d'aide — d'abord à côté de l'article, puis à la
// racine de la doc — en s'appuyant sur la liste EXACTE des fichiers embarqués
// (clés du bundle, pas d'I/O disque). Les liens hors doc gardent la résolution
// vault déjà posée par postRenderDom.
let docHelpRoot = "";
let docHelpFiles: Set<string> | null = null;
function resolveDocWikilinks(el: HTMLElement, rootPath: string, filePath: string): void {
  const rel = helpRelativePath(filePath, helpDir(rootPath));
  if (!rel) return;
  if (docHelpRoot !== rootPath || !docHelpFiles) {
    docHelpRoot = rootPath;
    docHelpFiles = new Set<string>();
    for (const key of Object.keys(getHelpBundle())) docHelpFiles.add(helpFilePath(rootPath, key));
  }
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  for (const a of el.querySelectorAll<HTMLAnchorElement>("a.wikilink")) {
    const target = a.getAttribute("data-wikilink-target");
    if (!target || /\.pdf$/i.test(target)) continue;
    const base = target.replace(/\.[^.]+$/, "") + ".md";
    const candidate = dir ? `${dir}/${base}` : base;
    if (docHelpFiles.has(helpFilePath(rootPath, candidate))) {
      a.setAttribute("data-wikilink-fullpath", helpFilePath(rootPath, candidate));
    }
  }
}

// ── Pied de page : article précédent / suivant (d'après le catalogue) ─────
function appendDocNav(el: HTMLElement): void {
  el.querySelector(".mdv-docnav")?.remove();
  const root = getRootPath();
  if (!root || !filePath) return;
  const rel = helpRelativePath(filePath, helpDir(root));
  if (!rel) return;
  const { prev, next } = neighbors(rel);
  if (!prev && !next) return;
  const nav = document.createElement("nav");
  nav.className = "mdv-docnav";
  if (prev) {
    const a = document.createElement("a");
    a.href = "#";
    a.dataset.docNav = helpFilePath(root, prev.path);
    a.className = "mdv-docnav__link mdv-docnav__link--prev";
    a.innerHTML = `<span class="mdv-docnav__dir">${t("doc.prev")}</span><span class="mdv-docnav__title">${escapeHtml(prev.title)}</span>`;
    nav.appendChild(a);
  }
  if (next) {
    const a = document.createElement("a");
    a.href = "#";
    a.dataset.docNav = helpFilePath(root, next.path);
    a.className = "mdv-docnav__link mdv-docnav__link--next";
    a.innerHTML = `<span class="mdv-docnav__title">${escapeHtml(next.title)}</span><span class="mdv-docnav__dir">${t("doc.next")}</span>`;
    nav.appendChild(a);
  }
  el.appendChild(nav);
}

$effect(() => {
  if (!ready) return;
  const src = value;
  const theme = currentTheme;
  let cancelled = false;
  let cleanupCode = () => {};

  let scrollPct = 0;
  if (articleEl) {
    extractMathFromDom(articleEl);
    extractCalloutState(articleEl);
    const scroller = articleEl.closest<HTMLElement>(".mdv-doc");
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      scrollPct = scroller.scrollTop / (scroller.scrollHeight - scroller.clientHeight);
    }
  }

  updateCalloutIcons(calloutSettings.current);

  void renderMarkdown(src, theme, filePath ?? undefined, getRootPath() ?? undefined).then(async (result) => {
    if (cancelled || !articleEl) return;

    const tmp = document.createElement("div");
    tmp.innerHTML = result.html;
    stripAutoCalloutTitles(tmp);
    makeCalloutsCollapsible(tmp);
    injectCachedMath(tmp);

    articleEl.innerHTML = tmp.innerHTML;
    restoreCalloutState(articleEl);
    appendDocNav(articleEl);

    cleanupCode();
    cleanupCode = decorateCodeBlocks(articleEl);
    const { brokenImages } = await postRenderDom(articleEl, { filePath, rootPath: getRootPath() ?? undefined });
    // Re-résolution doc-first des wikilinks (le lecteur reste dans la doc).
    const rp = getRootPath();
    if (rp && filePath) resolveDocWikilinks(articleEl, rp, filePath);
    await typesetMath(articleEl);
    if (!cancelled) collectRenderDiagnostics(articleEl, brokenImages);

    markTranscludedBlocks(articleEl, result.ranges);

    // Scroll to heading if navigated via a doc link / TOC click.
    const scrollHeading = consumeScrollTarget();
    if (scrollHeading && articleEl) {
      const id = scrollHeading.toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/ /g, "-")
        .replace(/^-|-$/g, "");
      const target = articleEl.querySelector(`#${CSS.escape(id)}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (scrollPct > 0) {
      const scroller = articleEl.closest<HTMLElement>(".mdv-doc");
      if (scroller) {
        requestAnimationFrame(() => {
          scroller.scrollTop = scrollPct * (scroller.scrollHeight - scroller.clientHeight);
        });
      }
    }
  });

  return () => {
    cancelled = true;
    cleanupCode();
  };
});

onDestroy(() => clearRenderDiagnostics());

// ── Jump ciblé (TOC / liens heading) sur le fichier affiché ──────────────
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter((s) => s !== ".").join("/");
}

$effect(() => {
  const fp = filePath;
  const el = articleEl;
  const onJump = (e: Event) => {
    const { path, heading } = (e as CustomEvent<{ path: string; heading?: string }>).detail;
    if (!path || !fp) return;
    if (normalizePath(fp) !== normalizePath(path)) return;
    if (!heading) return;
    const target = el?.querySelector(`#${CSS.escape(slugify(heading))}`) ?? null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  window.addEventListener("azprose:preview-jump-line", onJump);
  return () => window.removeEventListener("azprose:preview-jump-line", onJump);
});

// ── Clics : wikilinks doc (en place) / wikilinks externes / ancres / http ─
$effect(() => {
  if (!articleEl) return;
  const el = articleEl;
  const root = getRootPath();
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;

    // Footer précédent / suivant → navigation doc en place.
    const docNav = a.getAttribute("data-doc-nav");
    if (docNav) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("azprose:doc-navigate", { detail: { path: docNav } }));
      return;
    }

    // PDF rect link: ouvrir dans le viewer (rare dans la doc, mais sûr).
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

    // Wikilink : dans la doc → navigation doc en place (Alt ignoré : tab
    // unique) ; hors doc → le comportement habituel (navigation preview).
    // `ctrlKey` transporté dans le détail (fenêtre NAV, R4) — voir MarkdownPreview.
    if (a.classList.contains("wikilink")) {
      const fullpath = a.getAttribute("data-wikilink-fullpath");
      const heading = a.getAttribute("data-wikilink-heading");
      const ctrlKey = e.ctrlKey || e.metaKey;
      if (fullpath && isHelpPath(fullpath, root)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("azprose:doc-navigate", { detail: { path: fullpath, heading, ctrlKey } }));
        return;
      }
      e.preventDefault();
      const target = a.getAttribute("data-wikilink-target");
      // Décision figée : le lecteur doc = mode nav TACITE (les wikilinks de la
      // doc naviguent toujours en place dans le tab doc) — jamais la lecture
      // de `isPreviewNavMode()` par le reducer (cas 1 de la matrice).
      window.dispatchEvent(new CustomEvent("azprose:wikilink-navigate", {
        detail: { path: fullpath ?? undefined, target: target ?? undefined, heading, ctrlKey },
      }));
      return;
    }

    const href = a.getAttribute("href");
    if (!href) return;
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

<div class="mdv-doc" style={zoom !== 100 ? `zoom: ${zoom / 100}` : ""}>
  {#if !ready}
    <div class="mdv-doc__loading">chargement…</div>
  {:else if value.trim().length === 0}
    <div class="mdv-doc__empty">document vide</div>
  {:else}
    <article bind:this={articleEl} class="mdv-prose"></article>
  {/if}
</div>

<style>
  .mdv-doc {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    padding: 32px 48px 80px;
    box-sizing: border-box;
  }

  .mdv-doc__loading,
  .mdv-doc__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
