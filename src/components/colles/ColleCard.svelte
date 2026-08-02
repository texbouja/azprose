<script lang="ts">
  /**
   * Carte d'une planche de colle — TROIS sections pliables, style du stack
   * DataFilter (barre `.dfg__head` : icône + titre + badge + spacer + bouton
   * chevron) :
   *   1. Métadonnées  (icône badge, titre = élève, badge matière)
   *   2. Contenu      (corps markdown rendu, pipeline complet : callouts, code,
   *                    transclusion, MathJax, wikilinks)
   *   3. Évaluation   (form SVAR HEADLESS — le titre et le chevron sont portés
   *                    par la carte, plus par la toolbar SVAR)
   * Chaque en-tête est une barre de carte HTML pure : le chevron remplace
   * l'icône « close » des cartes DataFilter (ici on plie/déplie, on ne retire
   * rien) et ne peut jamais être perdu dans un menu « … » d'overflow.
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
  import { collesSettings } from "@/stores/colles-settings.svelte";
  import { rubriquesFor, sumMaxScore, sumNotes } from "@/colles";
  import type { CollePlanche } from "@/colles";
  import ColleNoteForm, { type ColleDraft } from "./ColleNoteForm.svelte";

  let {
    planche,
    filePath = null as string | null,
    onEval,
  }: {
    planche: CollePlanche;
    filePath?: string | null;
    onEval?: (index: number, keys: { notes?: Record<string, number | string> | null; observations?: string | null }) => void;
  } = $props();

  let t = $derived(getT($language));

  // Rubriques configurées pour la matière de la planche (dénominateur de la
  // note globale, affichée dans le heading de la section Évaluation en mode
  // preview).
  let rubriques = $derived(rubriquesFor(planche.meta.matiere, collesSettings.current.rubriques));

  let currentTheme = $state<Theme>(
    (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte",
  );

  $effect(() => {
    return subscribeMode(() => {
      currentTheme = (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte";
    });
  });

  // ── Mode preview de l'évaluation ─────────────────────────────────────────
  // Deux modes dans la section Évaluation : le formulaire (défaut) et un mode
  // « preview » (icône œil) qui affiche la note globale LIVE + les observations
  // rendues en markdown. `draft` est l'état courant du form (reporté à chaque
  // frappe via onDraft) : le preview montre ce qui sera écrit, sans attendre le
  // debounce. Le form reste MONTÉ et masqué par CSS (décision round 3).
  let evalMode = $state<"form" | "preview">("form");
  // Init UNE fois au montage (le draft suit ensuite le form via onDraft) ; la
  // carte est remontée par planche ({#key} dans CollePreview).
  // svelte-ignore state_referenced_locally
  let draft = $state<ColleDraft>({
    notes: planche.meta.notes ?? null,
    observations: planche.meta.observations ?? "",
  });
  let previewNote = $derived(sumNotes(draft.notes));
  let previewNoteMax = $derived(sumMaxScore(rubriques));
  let previewEl = $state<HTMLElement | undefined>();

  $effect(() => {
    const el = previewEl;
    if (!el || evalMode !== "preview") return;
    let cancelled = false;
    const fp = filePath ?? undefined;
    void renderMarkdown(draft.observations || "", currentTheme, fp, getRootPath() ?? undefined)
      .then(async (result) => {
        if (cancelled) return;
        el.innerHTML = result.html;
        await postRenderDom(el, { filePath, rootPath: getRootPath() ?? undefined });
        await typesetMath(el);
      })
      .catch((err) => console.error("azprose: colle preview obs render failed", err));
    return () => {
      cancelled = true;
    };
  });

  // Pliage des trois sections. Par défaut tout est déplié (comportement hérité).
  let metaCollapsed = $state(false);
  let bodyCollapsed = $state(false);
  let formCollapsed = $state(false);

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
  <!-- ── 1. Métadonnées ─────────────────────────────────────────── -->
  <section class="colle-sec">
    <div class="colle-sec__head">
      <i class="colle-sec__icon wxi-user" aria-hidden="true"></i>
      <span class="colle-sec__title">{planche.meta.eleve || t("colle.noEleve")}</span>
      {#if planche.meta.matiere}
        <span class="colle-sec__badge">{planche.meta.matiere}</span>
      {/if}
      <div class="colle-sec__spacer"></div>
      <button
        type="button"
        class="colle-sec__btn"
        title={metaCollapsed ? t("colle.expand") : t("colle.collapse")}
        aria-label={metaCollapsed ? t("colle.expand") : t("colle.collapse")}
        aria-expanded={!metaCollapsed}
        aria-controls="colle-sec-meta"
        onclick={() => (metaCollapsed = !metaCollapsed)}
      >
        <i class="colle-sec__chevron {metaCollapsed ? 'wxi-chevron-right' : 'wxi-chevron-down'}" aria-hidden="true"></i>
      </button>
    </div>
    {#if !metaCollapsed}
      <dl id="colle-sec-meta" class="colle-sec__meta">
        {#if planche.meta.colleur}
          <div class="colle-sec__field">
            <dt>{t("colle.colleur")}</dt>
            <dd>{planche.meta.colleur}</dd>
          </div>
        {/if}
        {#if planche.meta.date}
          <div class="colle-sec__field">
            <dt>{t("colle.date")}</dt>
            <dd>{formatDate(planche.meta.date)}</dd>
          </div>
        {/if}
        {#if planche.meta.creneau || (planche.meta.creneaux as string[] | undefined)?.length}
          <div class="colle-sec__field">
            <dt>{t("colle.creneau")}</dt>
            <dd>{planche.meta.creneau || (planche.meta.creneaux as string[] | undefined)?.join(", ")}</dd>
          </div>
        {/if}
        {#if planche.meta.salle}
          <div class="colle-sec__field">
            <dt>{t("colle.salle")}</dt>
            <dd>{planche.meta.salle}</dd>
          </div>
        {/if}
      </dl>
    {/if}
  </section>

  <!-- ── 2. Contenu ─────────────────────────────────────────────── -->
  <section class="colle-sec">
    <div class="colle-sec__head">
      <i class="colle-sec__icon wxi-scroll-text" aria-hidden="true"></i>
      <span class="colle-sec__title">Énoncé</span>
      <div class="colle-sec__spacer"></div>
      <button
        type="button"
        class="colle-sec__btn"
        title={bodyCollapsed ? t("colle.expand") : t("colle.collapse")}
        aria-label={bodyCollapsed ? t("colle.expand") : t("colle.collapse")}
        aria-expanded={!bodyCollapsed}
        aria-controls="colle-sec-body"
        onclick={() => (bodyCollapsed = !bodyCollapsed)}
      >
        <i class="colle-sec__chevron {bodyCollapsed ? 'wxi-chevron-right' : 'wxi-chevron-down'}" aria-hidden="true"></i>
      </button>
    </div>
    {#if !bodyCollapsed}
      <div id="colle-sec-body" class="colle-sec__body" bind:this={bodyEl}></div>
    {/if}
  </section>

  <!-- ── 3. Évaluation (titre + chevron portés par la carte) ───── -->
  <section class="colle-sec">
    <div class="colle-sec__head">
      <i class="colle-sec__icon wxi-book-open-check" aria-hidden="true"></i>
      <span class="colle-sec__title">{t("colle.evaluation")}</span>
      {#if evalMode === "preview"}
        <span
          class="colle-sec__note-badge"
          class:colle-sec__note-badge--empty={previewNote === null}
          title={t("colle.noteGlobale")}
        >
          {previewNote !== null ? String(previewNote) : "—"} / {previewNoteMax}
        </span>
      {/if}
      <div class="colle-sec__spacer"></div>
      <button
        type="button"
        class="colle-sec__btn"
        class:is-active={evalMode === "preview"}
        title={evalMode === "preview" ? t("colle.form") : t("colle.preview")}
        aria-label={evalMode === "preview" ? t("colle.form") : t("colle.preview")}
        aria-pressed={evalMode === "preview"}
        onclick={() => (evalMode = evalMode === "form" ? "preview" : "form")}
      >
        <i class="wxi-eye" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="colle-sec__btn"
        title={formCollapsed ? t("colle.expand") : t("colle.collapse")}
        aria-label={formCollapsed ? t("colle.expand") : t("colle.collapse")}
        aria-expanded={!formCollapsed}
        aria-controls="colle-sec-form"
        onclick={() => (formCollapsed = !formCollapsed)}
      >
        <i class="colle-sec__chevron {formCollapsed ? 'wxi-chevron-right' : 'wxi-chevron-down'}" aria-hidden="true"></i>
      </button>
    </div>
    <!-- Le form reste MONTÉ (masqué par CSS) : saisie + debounce vivants au
         repli ET en mode preview. -->
    <div
      id="colle-sec-form"
      class="colle-sec__form"
      class:colle-sec__form--hidden={formCollapsed || evalMode === "preview"}
    >
      <ColleNoteForm
        matiere={planche.meta.matiere}
        notes={planche.meta.notes}
        observations={planche.meta.observations ?? ""}
        onChange={(keys) => onEval?.(planche.index, keys)}
        onDraft={(d) => (draft = d)}
      />
    </div>
    {#if evalMode === "preview" && !formCollapsed}
      <!-- La note globale vit dans le heading (colle-sec__note-badge) : le
           corps du preview ne contient QUE les observations rendues. -->
      <div id="colle-sec-preview" class="colle-sec__preview">
        {#if draft.observations.trim()}
          <div class="colle-sec__preview-obs" bind:this={previewEl}></div>
        {:else}
          <p class="colle-sec__preview-empty">{t("colle.noObservations")}</p>
        {/if}
      </div>
    {/if}
  </section>
</article>
