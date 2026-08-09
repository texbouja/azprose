<script lang="ts">
  /**
   * PrintOverlay — interface complète d'impression (Phase 3, chantier 3).
   *
   * Paramètre TOUT le rendu avant export (ou aperçu — chantier 3b) :
   *   - gabarit (simple / cours / dense) via print-templates (PUR) ;
   *   - papier (A4/A5/A3/Letter/Legal/personnalisé en mm) ;
   *   - orientation portrait / paysage ;
   *   - marges (4 champs mm) → `@page` CSS (source de vérité) ;
   *   - multi-colonnes (1/2/3 + écart mm, CSS multicol) ;
   *   - entête / pied de page (templates CDP, placeholders {title}/{date}/{page}/{pages}) ;
   *   - échelle + fond (print_background).
   *
   * MODE « PLANCHES » (mode = "planches") : hérité du dialogue
   * CollePrintDialog (décision utilisateur) — l'impression des planches de
   * colles passe par CE overlay. Le gabarit (le rendu `.rp` est fixe) et
   * l'expansion des wikilinks sont masqués ; s'ajoutent la checkbox
   * « avec/sans évaluation » (`includeEval`, défaut SANS = feuille d'examen à
   * découper) et le compteur de planches. La mise en page historiquement
   * encodée en dur (A4 paysage 2 colonnes) devient des PARAMÈTRES — défauts
   * = configuration actuelle (`DEFAULT_PLANCHES_PRINT_REQUEST`), persistés
   * séparément (`print-planches.json`).
   *
   * Persistance : `.azprose/print.json` (md→PDF) / `.azprose/print-planches.json`
   * (planches) — derniers réglages utilisés, chargés à l'ouverture, écrits à
   * l'export.
   *
   * Machine à états (phase 5, idée D) : "idle" → "loading" (lecture du fichier
   * de réglages) → "ready" → "exporting" → "done" ; "error" sur échec (ou
   * aucune planche). Transitions par événements (`createPhaseMachine`) :
   * open / loaded / empty / preview / previewed / failed / export / exported /
   * cancelled — les événements hors alphabet sont ignorés.
   */
  import { Button, Overlay } from "@/components/primitives";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import { createPhaseMachine, type PhaseDef } from "@/lib/phase-machine";
  import { Counter, Combo, Segmented, Slider, Switch, Text } from "@svar-ui/svelte-core";
  import {
    DEFAULT_PRINT_REQUEST,
    type PrintRequest,
    type PaperFormat,
    type PrintTemplateId,
    type PrintOrientation,
  } from "@/lib/print-request";
  import { getPrintTemplate } from "@/lib/print-templates";
  import { exportMarkdownPdf, previewMarkdownPdf } from "@/lib/pdf-export";
  import {
    loadPrintRequest,
    savePrintRequest,
    loadPlanchesPrintRequest,
    savePlanchesPrintRequest,
  } from "@/stores/print-settings.svelte";
  import { notifications } from "@/stores/notifications.svelte";
  import { parsePlanches } from "@/colles";
  import { exportPlanchesPdf, previewPlanchesPdf } from "@/colles/pdf-planches-render";
  import type { CollePrintRequest } from "@/colles/pdf-planches-render";
  import { collesSettings } from "@/stores/colles-settings.svelte";
  import { userProfile } from "@/stores/user-profile.svelte";
  import { getRootPath } from "@/stores/root-path.svelte";

  let {
    open,
    mode = "markdown" as "markdown" | "planches",
    filePath = null as string | null,
    source = null as string | null,
    onClose,
  }: {
    open: boolean;
    /** "markdown" = export md→PDF ; "planches" = planches de colles. */
    mode?: "markdown" | "planches";
    filePath?: string | null;
    /** Source LIVE de la note active (lue par app.svelte). */
    source?: string | null;
    onClose: () => void;
  } = $props();

  let t = $derived(getT($language));

  type PrintPhase =
    | "idle"
    | "loading"
    | "ready"
    | "previewing"
    | "exporting"
    | "done"
    | "error";
  type PrintEvent =
    | "open"
    | "loaded"
    | "empty"
    | "preview"
    | "previewed"
    | "failed"
    | "export"
    | "exported"
    | "cancelled";

  // Machine à phases : chaque phase n'accepte que son alphabet (les
  // événements hors alphabet sont ignorés — plus d'état poubelle).
  const PRINT_PHASES: PhaseDef<PrintPhase, PrintEvent>[] = [
    { name: "idle", on: { open: "loading" } },
    { name: "loading", on: { loaded: "ready", empty: "error" } },
    { name: "ready", on: { preview: "previewing", export: "exporting" } },
    { name: "previewing", on: { previewed: "ready", failed: "error" } },
    { name: "exporting", on: { exported: "done", cancelled: "ready", failed: "error" } },
    { name: "done", on: {} },
    { name: "error", on: {} },
  ];

  let machine = $state(createPhaseMachine(PRINT_PHASES, { initial: "idle" }));
  let error = $state("");

  // Requête d'impression éditée par l'overlay (clone des défauts puis merge
  // avec les derniers réglages persistés du MODE actif).
  let req = $state<PrintRequest>(structuredClone(DEFAULT_PRINT_REQUEST));

  // Mode planches : checkbox « avec/sans évaluation » + compteur.
  let includeEval = $state(false);
  let planchesCount = $state(0);
  let planchesReady = $state(false);

  // Charge les derniers réglages à CHAQUE ouverture (selon le mode). Le
  // $effect ne lit que `open` et `mode` (jamais les états qu'il écrit — piège
  // boucle d'effet Svelte 5). Le parse planches est SYNCHRONE (pipeline
  // `parsePlanches` sans DOM) : pas de IIFE nécessaire.
  $effect(() => {
    if (!open) return;
    const isPlanches = mode === "planches";
    // Reset INCONDITIONNEL à chaque ouverture (cycle de vie) : le chargement
    // des réglages repart depuis n'importe quelle phase précédente.
    machine.reset("loading");
    error = "";
    includeEval = false;
    planchesCount = 0;
    planchesReady = false;
    let cancelled = false;
    const loader = isPlanches ? loadPlanchesPrintRequest() : loadPrintRequest();
    void loader.then((saved) => {
      if (cancelled) return;
      req = saved;
      if (isPlanches && source) {
        const n = parsePlanches(source).planches.length;
        planchesCount = n;
        planchesReady = n > 0;
        machine.send(n ? "loaded" : "empty");
        if (!n) error = t("colle.printEmpty");
      } else {
        machine.send("loaded");
      }
    });
    return () => {
      cancelled = true;
    };
  });

  const PAPER_OPTIONS = $derived([
    { id: "a4", label: "A4" },
    { id: "a5", label: "A5" },
    { id: "a3", label: "A3" },
    { id: "letter", label: t("print.paperLetter") },
    { id: "legal", label: t("print.paperLegal") },
    { id: "custom", label: t("print.paperCustom") },
  ]);

  const TEMPLATE_OPTIONS = $derived(
    (["simple", "course", "dense"] as const).map((id) => ({
      id,
      label: t(getPrintTemplate(id).labelKey),
    })),
  );

  function patch(p: Partial<PrintRequest>) {
    req = { ...req, ...p };
  }

  function patchMargins(p: Partial<PrintRequest["margins"]>) {
    req = { ...req, margins: { ...req.margins, ...p } };
  }

  /** Requête planches complète (mode "planches") à partir de l'overlay. */
  function buildColleReq(): CollePrintRequest {
    const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
    return {
      source: source ?? "",
      rubriques: collesSettings.current.rubriques,
      theme,
      filePath,
      rootPath: getRootPath() ?? null,
      colleur: userProfile.current.colleurName,
      includeEval,
      print: req,
    };
  }

  /**
   * Aperçu avant impression (chantier 3b, décision §3.4 de next_level.md) :
   * assemble le MÊME HTML que l'export puis l'ouvre dans une fenêtre Chromium
   * VISIBLE dédiée (commande Rust `preview_print` — browser non-headless).
   * Le HTML reste sur disque dans `.azprose/tmp/` ; la fenêtre reste ouverte.
   */
  async function handlePreview() {
    if (!source || !filePath) return;
    if (!machine.send("preview")) return; // hors alphabet (ex. déjà en cours)
    error = "";
    try {
      if (mode === "planches") {
        await previewPlanchesPdf(buildColleReq());
      } else {
        const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
        await previewMarkdownPdf(source, theme, filePath, req);
      }
      // L'aperçu reste ouvert — on revient à l'état prêt (les réglages
      // peuvent être ajustés et relancés).
      machine.send("previewed");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      machine.send("failed");
    }
  }

  async function handleExport() {
    if (!source || !filePath) return;
    if (!machine.send("export")) return; // hors alphabet (ex. déjà en cours)
    error = "";
    try {
      if (mode === "planches") {
        const out = await exportPlanchesPdf(buildColleReq());
        if (out === false) {
          error = t("colle.printEmpty");
          machine.send("failed");
          return;
        }
        if (out === null) {
          // Dialogue de destination annulé — on reste sur l'overlay.
          machine.send("cancelled");
          return;
        }
        await savePlanchesPrintRequest(req);
        notifications.setInfo(t("colle.printDone", { path: out }));
        machine.send("exported");
        onClose();
        return;
      }
      const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
      const out = await exportMarkdownPdf(source, theme, filePath, req);
      if (out === null) {
        // Dialogue de destination annulé — on reste sur l'overlay.
        machine.send("cancelled");
        return;
      }
      await savePrintRequest(req);
      notifications.setInfo(t("pdf.exported", { path: out }));
      machine.send("exported");
      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      machine.send("failed");
    }
  }
</script>

<Overlay
  open={open}
  onClose={onClose}
  ariaLabel={mode === "planches" ? t("colle.printTitle") : t("print.title")}
  variant="modal"
  width="auto"
>
  <div class="print-overlay">
    <div class="print-overlay__head">
      <i class="wxi-printer" aria-hidden="true"></i>
      <h2 class="print-overlay__title">{mode === "planches" ? t("colle.printTitle") : t("print.title")}</h2>
      <button
        type="button"
        class="print-overlay__close"
        onclick={onClose}
        aria-label={t("common.close")}
      >
        <i class="wxi-close" aria-hidden="true"></i>
      </button>
    </div>

    <div class="print-overlay__body">
      {#if machine.current === "loading"}
        <p class="print-overlay__status">{t("print.loading")}</p>
      {:else if machine.current === "previewing"}
        <p class="print-overlay__status">{t("print.previewing")}</p>
      {:else if machine.current === "exporting"}
        <p class="print-overlay__status">{t("print.exporting")}</p>
      {:else if machine.current === "error"}
        <p class="print-overlay__error">{error}</p>
      {:else if machine.current === "ready"}
        {#if mode === "planches"}
          <!-- Planches : avec/sans évaluation + compteur -->
          <label class="print-overlay__checkbox">
            <input type="checkbox" bind:checked={includeEval} />
            <span class="print-overlay__checkbox-label">{t("colle.printIncludeEval")}</span>
          </label>
          <p class="print-overlay__hint">{t("colle.printHintEval")}</p>
          <p class="print-overlay__count">
            {t("colle.printCount", { count: planchesCount })}
          </p>
        {/if}

        {#if mode === "markdown"}
          <!-- Gabarit -->
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.template")}</span>
            <Combo
              value={req.template}
              options={TEMPLATE_OPTIONS}
              onchange={(ev) => patch({ template: ev.value as PrintTemplateId })}
            />
          </label>
        {/if}

        <!-- Papier + orientation -->
        <div class="print-overlay__grid">
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.paper")}</span>
            <Combo
              value={req.paper}
              options={PAPER_OPTIONS}
              onchange={(ev) => patch({ paper: ev.value as PaperFormat })}
            />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.orientation")}</span>
            <Segmented
              value={req.orientation}
              options={[
                { id: "portrait", label: t("print.portrait") },
                { id: "landscape", label: t("print.landscape") },
              ]}
              onchange={(ev) => patch({ orientation: ev.value as PrintOrientation })}
            />
          </label>
        </div>

        {#if req.paper === "custom"}
          <div class="print-overlay__grid">
            <label class="print-overlay__field">
              <span class="print-overlay__label">{t("print.paperWidthMm")}</span>
              <Counter
                value={req.customPaper?.width ?? 210}
                min={50}
                max={600}
                step={1}
                onchange={(ev) => patch({ customPaper: { ...(req.customPaper ?? { width: 210, height: 297 }), width: ev.value } })}
              />
            </label>
            <label class="print-overlay__field">
              <span class="print-overlay__label">{t("print.paperHeightMm")}</span>
              <Counter
                value={req.customPaper?.height ?? 297}
                min={50}
                max={600}
                step={1}
                onchange={(ev) => patch({ customPaper: { ...(req.customPaper ?? { width: 210, height: 297 }), height: ev.value } })}
              />
            </label>
          </div>
        {/if}

        <!-- Marges -->
        <div class="print-overlay__grid">
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.marginTop")}</span>
            <Counter value={req.margins.top} min={0} max={50} step={0.5} onchange={(ev) => patchMargins({ top: ev.value })} />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.marginBottom")}</span>
            <Counter value={req.margins.bottom} min={0} max={50} step={0.5} onchange={(ev) => patchMargins({ bottom: ev.value })} />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.marginLeft")}</span>
            <Counter value={req.margins.left} min={0} max={50} step={0.5} onchange={(ev) => patchMargins({ left: ev.value })} />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.marginRight")}</span>
            <Counter value={req.margins.right} min={0} max={50} step={0.5} onchange={(ev) => patchMargins({ right: ev.value })} />
          </label>
        </div>

        <!-- Multi-colonnes -->
        <div class="print-overlay__grid">
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.columns")}</span>
            <Combo
              value={String(req.columns)}
              options={[
                { id: "1", label: "1" },
                { id: "2", label: "2" },
                { id: "3", label: "3" },
              ]}
              onchange={(ev) => patch({ columns: Number(ev.value) as 1 | 2 | 3 })}
            />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.columnGap")}</span>
            <Counter value={req.columnGap} min={2} max={30} step={1} onchange={(ev) => patch({ columnGap: ev.value })} />
          </label>
        </div>

        <!-- Entête / pied -->
        <div class="print-overlay__field">
          <span class="print-overlay__label">{t("print.headerFooter")}</span>
          <div class="print-overlay__hf">
            <Text
              value={req.header}
              placeholder={t("print.headerPlaceholder")}
              onchange={(ev) => patch({ header: String(ev.value ?? "") })}
            />
            <Text
              value={req.footer}
              placeholder={t("print.footerPlaceholder")}
              onchange={(ev) => patch({ footer: String(ev.value ?? "") })}
            />
          </div>
          <p class="print-overlay__hint">{t("print.hfPlaceholders")}</p>
        </div>

        <!-- Avancées -->
        <div class="print-overlay__grid">
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.scale")}</span>
            <Slider
              min={0.5}
              max={2}
              step={0.05}
              value={req.scale}
              onchange={(ev) => patch({ scale: ev.value })}
            />
            <span class="print-overlay__value">{Math.round(req.scale * 100)}%</span>
          </label>
          <label class="print-overlay__field print-overlay__switch">
            <span class="print-overlay__label">{t("print.printBackground")}</span>
            <Switch
              value={req.printBackground}
              onchange={(ev) => patch({ printBackground: ev.value })}
            />
          </label>
          {#if mode === "markdown"}
            <label class="print-overlay__field print-overlay__switch">
              <span class="print-overlay__label">{t("print.expandLinks")}</span>
              <Switch
                value={req.expandLinks}
                onchange={(ev) => patch({ expandLinks: ev.value })}
              />
            </label>
          {/if}
        </div>

        {#if mode === "markdown" && req.expandLinks}
          <p class="print-overlay__hint">{t("print.expandLinksHint")}</p>
        {/if}
        <p class="print-overlay__hint">{t("print.mathHint")}</p>
      {/if}
    </div>

    {#if machine.current === "ready" || machine.current === "error"}
      <div class="print-overlay__actions">
        <Button variant="ghost" onclick={onClose}>{t("common.cancel")}</Button>
        {#if machine.current === "ready" && (mode === "markdown" || planchesReady)}
          <Button variant="outline" onclick={handlePreview}>{t("print.preview")}</Button>
          <Button variant="solid" onclick={handleExport}>{t("print.export")}</Button>
        {/if}
      </div>
    {/if}
  </div>
</Overlay>

<style>
  .print-overlay {
    display: flex;
    flex-direction: column;
    width: min(460px, 92vw);
    /* Contrainte ≤ max-height du modal parent (`.mdv-overlay`: 76vh +
       overflow:hidden) : si le contenu dépasse, le conteneur est clampé ici
       (75vh < 76vh) et le body scroll en interne. Sans cette contrainte
       (l'ancien 86vh), la barre d'actions sortait de la fenêtre du modal
       et était coupée par l'overflow du parent. */
    max-height: 75vh;
    color: var(--fg);
  }  .print-overlay__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .print-overlay__head i {
    font-size: 17px;
    color: var(--accent);
  }
  .print-overlay__title {
    flex: 1;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .print-overlay__close {
    border: none;
    background: transparent;
    color: var(--muted);
    width: 24px;
    height: 24px;
    border-radius: 5px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .print-overlay__close:hover {
    background: var(--surface-hover);
    color: var(--fg);
  }
  .print-overlay__body {
    /* Pattern ColleSendDialog : PAS de `flex:1` ici — dans un conteneur à
       hauteur AUTO, un flex-basis 0 s'effondre à 0 (pas de free space).
       C'est le `max-height` du conteneur (75vh) qui contraint, et
       `overflow-y: auto` + flex-shrink par défaut qui font rétrécir le body
       et le font scroller en interne. */
    padding: 14px 16px;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }
  .print-overlay__status {
    margin: 0;
    color: var(--fg-muted);
  }
  .print-overlay__error {
    margin: 0;
    color: var(--color-error, #c62828);
    white-space: pre-wrap;
  }
  .print-overlay__field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .print-overlay__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 12px;
  }
  .print-overlay__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
    font-weight: 600;
  }
  .print-overlay__switch {
    justify-content: flex-end;
  }
  .print-overlay__switch :global(.wx-switch) {
    margin-top: 4px;
  }
  .print-overlay__hf {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .print-overlay__value {
    color: var(--fg-muted);
    font-size: 12px;
  }
  .print-overlay__hint {
    margin: 0;
    color: var(--fg-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .print-overlay__checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 500;
  }
  .print-overlay__checkbox input {
    accent-color: var(--accent);
    width: 15px;
    height: 15px;
    margin: 0;
  }
  .print-overlay__count {
    margin: 0;
    color: var(--fg-muted);
  }
  .print-overlay__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
</style>
