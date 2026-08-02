<script lang="ts">
  /**
   * Carte d'une planche de colle : en-tête de métadonnées (matière, colleur,
   * élève, date, créneaux, salle) + corps markdown rendu (pipeline complet :
   * callouts, code, transclusion, MathJax, wikilinks) + form d'évaluation.
   */
  import { openUrl } from "@tauri-apps/plugin-opener";
  import {
    renderMarkdown,
    decorateCodeBlocks,
    markTranscludedBlocks,
    makeCalloutsCollapsible,
    stripAutoCalloutTitles,
    postRenderDom,
  } from "@/markdown";
  import { getRootPath } from "@/stores/root-path.svelte";
  import { subscribeMode, type Theme } from "@/lib/theme";
  import { typesetMath } from "@/lib/typeset-math";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import type { CollePlanche } from "@/colles";
  import ColleNoteForm from "./ColleNoteForm.svelte";

  let {
    planche,
    filePath = null as string | null,
    onEval,
  }: {
    planche: CollePlanche;
    filePath?: string | null;
    onEval?: (index: number, keys: { note?: number | string | null; observations?: string | null }) => void;
  } = $props();

  let t = $derived(getT($language));

  let currentTheme = $state<Theme>(
    (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte",
  );

  $effect(() => {
    return subscribeMode(() => {
      currentTheme = (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte";
    });
  });

  let bodyEl = $state<HTMLElement | undefined>();
  let cleanupCode: () => void = () => {};

  $effect(() => {
    const el = bodyEl;
    if (!el) return;
    let cancelled = false;
    const fp = filePath ?? undefined;
    void renderMarkdown(planche.bodySource, currentTheme, fp, getRootPath() ?? undefined)
      .then(async (result) => {
        if (cancelled) return;
        const tmp = document.createElement("div");
        tmp.innerHTML = result.html;
        stripAutoCalloutTitles(tmp);
        makeCalloutsCollapsible(tmp);
        el.innerHTML = tmp.innerHTML;
        cleanupCode();
        cleanupCode = decorateCodeBlocks(el);
        await postRenderDom(el, { filePath, rootPath: getRootPath() ?? undefined });
        await typesetMath(el);
        if (!cancelled) markTranscludedBlocks(el, result.ranges);
      })
      .catch((err) => console.error("azprose: colle card render failed", err));
    return () => {
      cancelled = true;
      cleanupCode();
    };
  });

  // Navigation clics (wikilinks, PDF, ancres, http) — même contrat que MarkdownPreview
  $effect(() => {
    const el = bodyEl;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;

      if (a.classList.contains("pdf-link") || a.classList.contains("pdf-rect-link")) {
        e.preventDefault();
        const pdfPath =
          a.getAttribute("data-pdf-path") ||
          a.getAttribute("data-wikilink-fullpath") ||
          a.getAttribute("data-wikilink-target");
        if (pdfPath) {
          window.dispatchEvent(
            new CustomEvent("azprose:pdf-rect-navigate", {
              detail: {
                path: pdfPath,
                page: Number(a.getAttribute("data-pdf-page")) || undefined,
                rect: a.getAttribute("data-pdf-rect") || undefined,
              },
            }),
          );
        }
        return;
      }

      if (a.classList.contains("wikilink")) {
        const fullpath = a.getAttribute("data-wikilink-fullpath");
        const heading = a.getAttribute("data-wikilink-heading");
        if (fullpath) {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("azprose:wikilink-navigate", { detail: { path: fullpath, heading } }),
          );
          return;
        }
        const target = a.getAttribute("data-wikilink-target");
        if (target) {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("azprose:wikilink-navigate", { detail: { target, heading } }),
          );
        }
        return;
      }

      if (href.startsWith("#")) {
        e.preventDefault();
        const id = decodeURIComponent(href.slice(1));
        const target =
          el.querySelector(`[id="${CSS.escape(id)}"]`) ?? el.querySelector(`[id="${id}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (/^https?:\/\//.test(href)) {
        e.preventDefault();
        void openUrl(href);
      }
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  });

  function formatDate(d?: string): string {
    if (!d) return "—";
    const parsed = new Date(`${d}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return d;
    return parsed.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
</script>

<article class="colle-card">
  <header class="colle-card__head">
    <div class="colle-card__title">
      {#if planche.meta.matiere}
        <span class="colle-card__badge">{planche.meta.matiere}</span>
      {/if}
      <h3 class="colle-card__name">{planche.meta.eleve || t("colle.noEleve")}</h3>
    </div>
    <dl class="colle-card__meta">
      {#if planche.meta.colleur}
        <div class="colle-card__field">
          <dt>{t("colle.colleur")}</dt>
          <dd>{planche.meta.colleur}</dd>
        </div>
      {/if}
      {#if planche.meta.date}
        <div class="colle-card__field">
          <dt>{t("colle.date")}</dt>
          <dd>{formatDate(planche.meta.date)}</dd>
        </div>
      {/if}
      {#if planche.meta.creneaux?.length}
        <div class="colle-card__field">
          <dt>{t("colle.creneaux")}</dt>
          <dd>{planche.meta.creneaux.join(", ")}</dd>
        </div>
      {/if}
      {#if planche.meta.salle}
        <div class="colle-card__field">
          <dt>{t("colle.salle")}</dt>
          <dd>{planche.meta.salle}</dd>
        </div>
      {/if}
      {#if planche.meta.note !== undefined && planche.meta.note !== null}
        <div class="colle-card__field colle-card__field--note">
          <dt>{t("colle.note")}</dt>
          <dd>{planche.meta.note}</dd>
        </div>
      {/if}
    </dl>
  </header>

  <div class="colle-card__body" bind:this={bodyEl}></div>

  <footer class="colle-card__foot">
    <ColleNoteForm
      note={planche.meta.note ?? ""}
      observations={planche.meta.observations ?? ""}
      onChange={(keys) => onEval?.(planche.index, keys)}
    />
  </footer>
</article>
