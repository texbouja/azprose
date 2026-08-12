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
  import { onDestroy } from "svelte";
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
  import { previewSettings } from "@/stores/markdown-settings.svelte";
  import { buildPreviewProseCss } from "@/lib/prose-style-css";
  import { rubriquesFor, sumMaxScore, sumNotes } from "@/colles";
  import type { CollePlanche } from "@/colles";
  import ColleNoteForm, { type ColleDraft } from "./ColleNoteForm.svelte";

  let {
    planche,
    filePath = null as string | null,
    zoom = 100,
    onEval,
  }: {
    planche: CollePlanche;
    filePath?: string | null;
    /** Zoom du TEXTE markdown (énoncé + observations) — état du viewer
     *  (CollePreview), appliqué uniquement aux `.colle-sec__zoom`, jamais aux
     *  cartes/métadonnées YAML. Largeur de la zone de texte inchangée. */
    zoom?: number;
    onEval?: (
      index: number,
      keys: {
        notes?: Record<string, number | string> | null;
        observations?: string | null;
        programme?: string | null;
        colleur?: string | null;
        creneau?: string | null;
        salle?: string | null;
      },
      propagateProgramme?: boolean,
    ) => void;
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

  // ── Polices « document » (réglages Preview) ──────────────────────────────
  // Le contenu markdown (Énoncé + observations rendues) utilise le MÊME CSS
  // typographique que MarkdownPreview : `buildPreviewProseCss` (shared) injecté
  // ici en `<style>` dédié (id distinct — en mode colle, MarkdownPreview n'est
  // pas monté et son `#mdv-preview-prose-css` n'existe pas). Les règles sont
  // scoped `.mdv-prose`, posé sur les conteneurs de contenu ci-dessous.
  $effect(() => {
    const css = buildPreviewProseCss(previewSettings.current);
    const el = document.createElement("style");
    el.id = "mdv-colle-prose-css";
    el.textContent = css;
    document.head.appendChild(el);
    return () => el.remove();
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

  // ── Mode preview de la section Métadonnées ────────────────────────────────
  // Comme la carte Évaluation : icône œil → affichage « rigide » (lecture
  // seule). Le champ Programme éditable (+ son bouton « Propager ») n'existe
  // qu'en mode form — en preview il est affiché en texte, le bouton disparaît.
  let metaMode = $state<"form" | "preview">("form");

  // Pliage des sections. Par défaut tout est déplié (comportement hérité).
  // Décision utilisateur : SEULES les cartes 1 (métadonnées) et 3 (évaluation)
  // sont pliables — la carte 2 (contenu) est TOUJOURS dépliée (elle absorbe
  // l'espace que les cartes 1 et 3 ne prennent pas).
  let metaCollapsed = $state(false);
  let formCollapsed = $state(false);

  // ── Programme ─────────────────────────────────────────────────────────────
  // Champ texte éditable dans la section Métadonnées de CHAQUE planche (chaque
  // planche a son propre `programme` YAML, alimenté vide à la génération).
  // État local initialisé au montage (le {#key} de CollePreview remonte la
  // carte à chaque navigation → relecture du YAML) ; write-back débouncé
  // 800 ms via le même canal `azprose:colle-eval` que le form (write-back
  // ciblé par index de planche). Le timer est purgé au repli de la section
  // (démontage) et au démontage de la carte.
  //
  // PROPAGATION VOLONTAIRE : le programme d'un même créneau étant en général
  // le même, le bouton « Propager » (à côté du champ, visible en mode form
  // uniquement) copie la valeur saisie vers les AUTRES planches du même
  // créneau (date + créneau identiques, via `sameCreneau` dans CollePreview).
  // La propagation est une ACTION UNIQUE déclenchée au clic — jamais
  // automatique. Le bouton est désactivé si la valeur est vide (un effacement
  // volontaire ne doit jamais vider les programmes des planches voisines).
  // svelte-ignore state_referenced_locally
  let programmeVal = $state(planche.meta.programme ?? "");
  let programmeDirty = $state(false);
  let programmeTimer: ReturnType<typeof setTimeout> | null = null;

  function flushProgramme() {
    if (programmeTimer) {
      clearTimeout(programmeTimer);
      programmeTimer = null;
    }
    if (!programmeDirty) return;
    programmeDirty = false;
    const value = programmeVal.trim();
    onEval?.(planche.index, { programme: value || null });
  }

  // Propagation AU CLIC : écrit le programme de la planche courante ET le
  // copie vers les autres planches du même créneau, en UN seul événement
  // (app.svelte chaîne les write-backs sur le même source → une sauvegarde).
  // Le timer de debounce en attente est purgé (la valeur vient d'être écrite ;
  // re-écrire la même chaîne est idempotent de toute façon).
  function handlePropagate() {
    const value = programmeVal.trim();
    if (!value) return;
    if (programmeTimer) {
      clearTimeout(programmeTimer);
      programmeTimer = null;
    }
    programmeDirty = false;
    onEval?.(planche.index, { programme: value }, true);
  }

  function handleProgrammeInput(value: string) {
    programmeVal = value;
    programmeDirty = true;
    if (programmeTimer) clearTimeout(programmeTimer);
    programmeTimer = setTimeout(flushProgramme, 800);
  }

  // ── Zoom du texte markdown ────────────────────────────────────────────────
  // Appliqué aux `.colle-sec__zoom` (énoncé + observations rendues). La
  // compensation `width: calc(100% / z)` annule l'élargissement du `zoom` CSS :
  // la zone de texte garde SA largeur (celle de la carte), seuls la taille du
  // texte et sa hauteur changent — le scroll interne de la section absorbe la
  // hauteur. Les métadonnées YAML et les cartes ne sont jamais zoomées.
  let zoomStyle = $derived(
    zoom !== 100 ? `zoom: ${zoom / 100}; width: calc(100% / ${zoom / 100});` : "",
  );

  // ── Métadonnées éditables (colleur / créneau / salle) ─────────────────────
  // Même pattern que le programme : état local init au montage (le `{#key}` de
  // CollePreview relit le YAML à chaque navigation), write-back débouncé
  // 800 ms via le même canal `azprose:colle-eval`, purge au repli (démontage)
  // et au démontage de la carte. Décision utilisateur : l'élève (titre de
  // carte) et la matière (badge, pilote les rubriques) restent FIXES ; la date
  // reste en lecture seule.
  interface MetaField {
    value: string;
    dirty: boolean;
    flush: () => void;
    handleInput: (value: string) => void;
  }

  function createMetaField(key: "colleur" | "creneau" | "salle") {
    // `creneau` : repli silencieux du legacy `creneaux` (tableau) en une chaîne
    // jointe — le write-back réécrit `creneau` seul (le legacy reste intact
    // tant que le champ n'est pas édité).
    const initial =
      key === "creneau"
        ? (planche.meta.creneau ?? (planche.meta.creneaux as string[] | undefined)?.join(", ") ?? "")
        : (planche.meta[key] ?? "");
    // `$state` ne peut PAS être placé dans un littéral d'objet (restriction
    // svelte 5) : variables de closure exposées via getters/setters.
    let value = $state(initial);
    let dirty = $state(false);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const field = {
      get value() {
        return value;
      },
      set value(v: string) {
        value = v;
      },
      get dirty() {
        return dirty;
      },
      set dirty(d: boolean) {
        dirty = d;
      },
      flush: () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (!dirty) return;
        dirty = false;
        const v = value.trim();
        onEval?.(planche.index, { [key]: v || null });
      },
      handleInput: (input: string) => {
        value = input;
        dirty = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(field.flush, 800);
      },
    } satisfies MetaField;
    return field;
  }

  const colleurField = createMetaField("colleur");
  const creneauField = createMetaField("creneau");
  const salleField = createMetaField("salle");

  // Purge du repli de la section Métadonnées + démontage de la carte : TOUS
  // les debounces en attente (programme + métadonnées) sont vidés avant que
  // les champs ne disparaissent (sinon saisie perdue).
  function flushAllMeta() {
    flushProgramme();
    colleurField.flush();
    creneauField.flush();
    salleField.flush();
  }

  onDestroy(() => {
    flushAllMeta();
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

  // Jumptoline dbl-clic — même contrat que MarkdownPreview, UNIQUEMENT sur le
  // TEXTE NON-YAML (le corps rendu de la section Contenu ; les métadonnées et
  // les observations viennent du YAML et sont exclues) :
  //   1. Bloc TRANSCLU (`[data-transcluded-from]`) → saut vers le FICHIER
  //      SOURCE à `data-transcluded-line` (offset 0-based déjà résolu par la
  //      synchro transclusion — app.svelte ouvre le .md d'origine, règle
  //      utilisateur, jamais un tab arbitraire).
  //   2. Texte SUR PLACE (`[data-sline]`) → `data-sline` est 0-based DANS le
  //      fragment `bodySource`, pas dans la daily note : la ligne réelle =
  //      `planche.bodyStart + sline` (bodyStart = index 0-based de la première
  //      ligne du corps dans le fichier complet).
  $effect(() => {
    const el = bodyEl;
    if (!el) return;
    const bodyOffset = planche.bodyStart;
    const onDblClick = (e: MouseEvent) => {
      const transcluded = (e.target as HTMLElement).closest<HTMLElement>("[data-transcluded-from]");
      if (transcluded) {
        const path = transcluded.dataset.transcludedFrom;
        const line = Number(transcluded.dataset.transcludedLine);
        if (path) {
          window.dispatchEvent(
            new CustomEvent("azprose:jump-to-line", {
              detail: { path, line: Number.isFinite(line) ? line : undefined },
            }),
          );
        }
        return;
      }
      const block = (e.target as HTMLElement).closest<HTMLElement>("[data-sline]");
      if (!block) return;
      const sline = Number(block.dataset.sline);
      if (Number.isFinite(sline)) {
        window.dispatchEvent(
          new CustomEvent("azprose:jump-to-line", {
            detail: { path: filePath ?? undefined, line: sline + bodyOffset },
          }),
        );
      }
    };
    el.addEventListener("dblclick", onDblClick);
    return () => el.removeEventListener("dblclick", onDblClick);
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
      <i class="colle-sec__icon wxi-student" aria-hidden="true"></i>
      <span class="colle-sec__title">{planche.meta.eleve || t("colle.noEleve")}</span>
      {#if planche.meta.matiere}
        <span class="colle-sec__badge">{planche.meta.matiere}</span>
      {/if}
      <div class="colle-sec__spacer"></div>
      <button
        type="button"
        class="colle-sec__btn"
        class:is-active={metaMode === "preview"}
        title={metaMode === "preview" ? t("colle.metaForm") : t("colle.metaPreview")}
        aria-label={metaMode === "preview" ? t("colle.metaForm") : t("colle.metaPreview")}
        aria-pressed={metaMode === "preview"}
        onclick={() => (metaMode = metaMode === "form" ? "preview" : "form")}
      >
        <i class="wxi-eye" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="colle-sec__btn"
        title={metaCollapsed ? t("colle.expand") : t("colle.collapse")}
        aria-label={metaCollapsed ? t("colle.expand") : t("colle.collapse")}
        aria-expanded={!metaCollapsed}
        aria-controls="colle-sec-meta"
        onclick={() => {
          // La section est DÉMONTÉE au repli : purger tous les debounces en
          // attente (programme + métadonnées) avant que les champs ne
          // disparaissent (sinon saisie perdue).
          flushAllMeta();
          metaCollapsed = !metaCollapsed;
        }}
      >
        <i class="colle-sec__chevron {metaCollapsed ? 'wxi-chevron-right' : 'wxi-chevron-down'}" aria-hidden="true"></i>
      </button>
    </div>
    {#if !metaCollapsed}
      <dl id="colle-sec-meta" class="colle-sec__meta">
        <div class="colle-sec__field colle-sec__field--programme">
          <dt>{t("colle.programme")}</dt>
          {#if metaMode === "preview"}
            <!-- Mode « rigide » (œil) : le programme s'affiche en TEXTE sur la
                 même ligne que le label (le champ éditable et le bouton
                 « Propager » disparaissent). Une seule ligne : ellipsis +
                 titre complet au survol. -->
            <dd
              class="colle-sec__programme-text"
              title={programmeVal.trim() || undefined}
            >{programmeVal.trim() || "—"}</dd>
          {:else}
            <dd>
              <div class="colle-sec__programme-row">
                <input
                  class="colle-sec__programme-input"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder={t("colle.programmePlaceholder")}
                  value={programmeVal}
                  oninput={(e) => handleProgrammeInput(e.currentTarget.value)}
                />
                <!-- Bouton d'action UNIQUE : propage la valeur saisie vers les
                     autres planches du même créneau, AU CLIC. Désactivé si la
                     valeur est vide (un effacement ne propage jamais). -->
                <button
                  type="button"
                  class="colle-sec__propagate"
                  disabled={!programmeVal.trim()}
                  title={t("colle.propagateHint")}
                  onclick={handlePropagate}
                >
                  {t("colle.propagate")}
                </button>
              </div>
            </dd>
          {/if}
        </div>
        <!-- Colleur / Créneau / Salle : éditables en mode form (inputs
             toujours visibles, write-back débouncé 800 ms), texte « rigide »
             sous l'œil. La date reste en lecture seule ; l'élève et la matière
             sont FIXES (titre + badge de carte). -->
        {#snippet metaFieldRow(field: MetaField, label: string, placeholder: string)}
          <div class="colle-sec__field colle-sec__field--meta">
            <dt>{label}</dt>
            {#if metaMode === "preview"}
              <dd class="colle-sec__meta-text" title={field.value.trim() || undefined}>
                {field.value.trim() || "—"}
              </dd>
            {:else}
              <dd>
                <input
                  class="colle-sec__meta-input"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder={placeholder}
                  value={field.value}
                  oninput={(e) => field.handleInput(e.currentTarget.value)}
                />
              </dd>
            {/if}
          </div>
        {/snippet}
        {@render metaFieldRow(colleurField, t("colle.colleur"), t("colle.colleurPlaceholder"))}
        {@render metaFieldRow(creneauField, t("colle.creneau"), t("colle.creneauPlaceholder"))}
        {@render metaFieldRow(salleField, t("colle.salle"), t("colle.sallePlaceholder"))}
        {#if planche.meta.date}
          <div class="colle-sec__field">
            <dt>{t("colle.date")}</dt>
            <dd>{formatDate(planche.meta.date)}</dd>
          </div>
        {/if}
      </dl>
    {/if}
  </section>

  <!-- ── 2. Contenu ─────────────────────────────────────────────── -->
  <!-- NON pliable (décision utilisateur) : le corps est toujours rendu et
       absorbe l'espace que les cartes 1 et 3 ne prennent pas. Pas de chevron. -->
  <section class="colle-sec">
    <div class="colle-sec__head">
      <i class="colle-sec__icon wxi-scroll-text" aria-hidden="true"></i>
      <span class="colle-sec__title">Énoncé</span>
      <div class="colle-sec__spacer"></div>
    </div>
    <div id="colle-sec-body" class="colle-sec__body">
      <!-- Zoom du TEXTE seul (`.colle-sec__zoom`) : la carte n'est jamais
           zoomée, la largeur est compensée par le style `width: calc(100%/z)`.
           `margin: 0` (SURCHARGE de `.mdv-prose` qui pose `margin: 0 auto`) :
           les marges auto seraient calculées à l'état non-zoomé PUIS
           multipliées par le zoom → « padding » du texte qui grandit avec le
           zoom (gap 12px → 191px à z=2, mesuré). Sans elles le padding reste
           celui du body (12px), constant quel que soit le zoom. -->
      <div class="colle-sec__zoom mdv-prose" style={zoomStyle} bind:this={bodyEl}></div>
    </div>
  </section>

  <!-- ── 3. Évaluation (titre + chevron portés par la carte) ───── -->
  <section class="colle-sec">
    <div class="colle-sec__head">
      <i class="colle-sec__icon wxi-book-open-check" aria-hidden="true"></i>
      <span class="colle-sec__title">{t("colle.evaluation")}</span>
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
      <!-- Note globale TOUJOURS visible, à droite du chevron (décision
           utilisateur) : somme des rubriques du draft LIVE (mode preview) —
           `—` tant qu'aucune rubrique n'est remplie. -->
      <span
        class="colle-sec__note-badge"
        class:colle-sec__note-badge--empty={previewNote === null}
        title={t("colle.noteGlobale")}
      >
        {previewNote !== null ? String(previewNote) : "—"} / {previewNoteMax}
      </span>
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
          <div class="colle-sec__zoom mdv-prose" style={zoomStyle} bind:this={previewEl}></div>
        {:else}
          <p class="colle-sec__preview-empty">{t("colle.noObservations")}</p>
        {/if}
      </div>
    {/if}
  </section>
</article>
