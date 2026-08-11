<script lang="ts">
  /**
   * PrintOverlay — noyau overlay d'impression (printing.md §2.1).
   *
   * Composant GÉNÉRIQUE : il consomme le contrat type (`core/contract.ts`) et
   * rend toute la mécanique commune — machine à états, papier/orientation,
   * marges, multi-colonnes, entête/pied CDP, échelle, fond, boutons
   * preview/export. Le spécifique du type (choix de coquille pour md,
   * checkbox « avec/sans évaluation » + compteur pour colle) est rendu par le
   * snippet `extra`, et les fonctionnalités binaires (gabarit, wikilinks)
   * sont pilotées par `contract.features`.
   */
  import { Button, Overlay } from "@/components/primitives";
  import { Counter, Combo, Segmented, Slider, Switch, Text } from "@svar-ui/svelte-core";
  import type { Snippet } from "svelte";
  import { getT, language } from "@/lib/i18n";
  import { notifications } from "@/stores/notifications.svelte";
  import { getPrintTemplate } from "@/lib/print-templates";
  import {
    type PaperFormat,
    type PrintOrientation,
    type PrintRequest,
    type PrintTemplateId,
  } from "@/lib/print-request";
  import { createPrintOverlayCore } from "./overlay.svelte";
  import type { PrintTypeContract } from "./contract";

  /** Contexte passé au snippet `extra` (contrôles spécifiques du type). */
  export interface PrintOverlayExtra {
    req: PrintRequest;
    count: number;
    canExport: boolean;
    patch: (p: Partial<PrintRequest>) => void;
    patchMargins: (p: Partial<PrintRequest["margins"]>) => void;
  }

  let {
    open,
    contract,
    source = null,
    filePath = null,
    extra = undefined,
    onClose,
  }: {
    open: boolean;
    contract: PrintTypeContract;
    source?: string | null;
    filePath?: string | null;
    extra?: Snippet<[PrintOverlayExtra]>;
    onClose: () => void;
  } = $props();

  let t = $derived(getT($language));

  const core = createPrintOverlayCore(
    contract,
    {
      t: (key, vars) => t(key, vars),
      notify: (msg) => notifications.setInfo(msg),
      onClose: () => onClose(),
    },
    {
      open: () => open,
      source: () => source,
      filePath: () => filePath,
    },
  );

  const PAPER_OPTIONS = $derived([
    { id: "a4", label: "A4" },
    { id: "a5", label: "A5" },
    { id: "a3", label: "A3" },
    { id: "letter", label: t("print.paperLetter") },
    { id: "legal", label: t("print.paperLegal") },
    { id: "custom", label: t("print.paperCustom") },
  ]);

  const TEMPLATE_OPTIONS = $derived(
    contract.features.template
      ? (["simple", "course", "dense"] as const).map((id) => ({
          id,
          label: t(getPrintTemplate(id).labelKey),
        }))
      : [],
  );
</script>

<Overlay
  open={open}
  onClose={onClose}
  ariaLabel={t(contract.titleKey)}
  variant="modal"
  width="auto"
>
  <div class="print-overlay">
    <div class="print-overlay__head">
      <i class="wxi-printer" aria-hidden="true"></i>
      <h2 class="print-overlay__title">{t(contract.titleKey)}</h2>
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
      {#if core.state.machine.current === "loading"}
        <p class="print-overlay__status">{t("print.loading")}</p>
      {:else if core.state.machine.current === "previewing"}
        <p class="print-overlay__status">{t("print.previewing")}</p>
      {:else if core.state.machine.current === "exporting"}
        <p class="print-overlay__status">{t("print.exporting")}</p>
      {:else if core.state.machine.current === "error"}
        <p class="print-overlay__error">{core.state.error}</p>
      {:else if core.state.machine.current === "ready"}
        {#if extra}
          {@render extra({
            req: core.state.req,
            count: core.state.count,
            canExport: core.state.canExport,
            patch: core.patch,
            patchMargins: core.patchMargins,
          })}
        {/if}

        {#if contract.features.template}
          <!-- Gabarit de la coquille -->
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.template")}</span>
            <Combo
              value={core.state.req.template}
              options={TEMPLATE_OPTIONS}
              onchange={(ev) => core.patch({ template: ev.value as PrintTemplateId })}
            />
          </label>
        {/if}

        <!-- Papier + orientation -->
        <div class="print-overlay__grid">
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.paper")}</span>
            <Combo
              value={core.state.req.paper}
              options={PAPER_OPTIONS}
              onchange={(ev) => core.patch({ paper: ev.value as PaperFormat })}
            />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.orientation")}</span>
            <Segmented
              value={core.state.req.orientation}
              options={[
                { id: "portrait", label: t("print.portrait") },
                { id: "landscape", label: t("print.landscape") },
              ]}
              onchange={(ev) => core.patch({ orientation: ev.value as PrintOrientation })}
            />
          </label>
        </div>

        {#if core.state.req.paper === "custom"}
          <div class="print-overlay__grid">
            <label class="print-overlay__field">
              <span class="print-overlay__label">{t("print.paperWidthMm")}</span>
              <Counter
                value={core.state.req.customPaper?.width ?? 210}
                min={50}
                max={600}
                step={1}
                onchange={(ev) => core.patch({ customPaper: { ...(core.state.req.customPaper ?? { width: 210, height: 297 }), width: ev.value } })}
              />
            </label>
            <label class="print-overlay__field">
              <span class="print-overlay__label">{t("print.paperHeightMm")}</span>
              <Counter
                value={core.state.req.customPaper?.height ?? 297}
                min={50}
                max={600}
                step={1}
                onchange={(ev) => core.patch({ customPaper: { ...(core.state.req.customPaper ?? { width: 210, height: 297 }), height: ev.value } })}
              />
            </label>
          </div>
        {/if}

        <!-- Marges -->
        <div class="print-overlay__grid">
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.marginTop")}</span>
            <Counter value={core.state.req.margins.top} min={0} max={50} step={0.5} onchange={(ev) => core.patchMargins({ top: ev.value })} />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.marginBottom")}</span>
            <Counter value={core.state.req.margins.bottom} min={0} max={50} step={0.5} onchange={(ev) => core.patchMargins({ bottom: ev.value })} />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.marginLeft")}</span>
            <Counter value={core.state.req.margins.left} min={0} max={50} step={0.5} onchange={(ev) => core.patchMargins({ left: ev.value })} />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.marginRight")}</span>
            <Counter value={core.state.req.margins.right} min={0} max={50} step={0.5} onchange={(ev) => core.patchMargins({ right: ev.value })} />
          </label>
        </div>

        <!-- Multi-colonnes -->
        <div class="print-overlay__grid">
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.columns")}</span>
            <Combo
              value={String(core.state.req.columns)}
              options={[
                { id: "1", label: "1" },
                { id: "2", label: "2" },
                { id: "3", label: "3" },
              ]}
              onchange={(ev) => core.patch({ columns: Number(ev.value) as 1 | 2 | 3 })}
            />
          </label>
          <label class="print-overlay__field">
            <span class="print-overlay__label">{t("print.columnGap")}</span>
            <Counter value={core.state.req.columnGap} min={2} max={30} step={1} onchange={(ev) => core.patch({ columnGap: ev.value })} />
          </label>
        </div>

        <!-- Entête / pied -->
        <div class="print-overlay__field">
          <span class="print-overlay__label">{t("print.headerFooter")}</span>
          <div class="print-overlay__hf">
            <Text
              value={core.state.req.header}
              placeholder={t("print.headerPlaceholder")}
              onchange={(ev) => core.patch({ header: String(ev.value ?? "") })}
            />
            <Text
              value={core.state.req.footer}
              placeholder={t("print.footerPlaceholder")}
              onchange={(ev) => core.patch({ footer: String(ev.value ?? "") })}
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
              value={core.state.req.scale}
              onchange={(ev) => core.patch({ scale: ev.value })}
            />
            <span class="print-overlay__value">{Math.round(core.state.req.scale * 100)}%</span>
          </label>
          <label class="print-overlay__field print-overlay__switch">
            <span class="print-overlay__label">{t("print.printBackground")}</span>
            <Switch
              value={core.state.req.printBackground}
              onchange={(ev) => core.patch({ printBackground: ev.value })}
            />
          </label>
          {#if contract.features.expandLinks}
            <label class="print-overlay__field print-overlay__switch">
              <span class="print-overlay__label">{t("print.expandLinks")}</span>
              <Switch
                value={core.state.req.expandLinks}
                onchange={(ev) => core.patch({ expandLinks: ev.value })}
              />
            </label>
          {/if}
        </div>

        {#if contract.features.expandLinks && core.state.req.expandLinks}
          <p class="print-overlay__hint">{t("print.expandLinksHint")}</p>
        {/if}
        <p class="print-overlay__hint">{t("print.mathHint")}</p>
      {/if}
    </div>

    {#if core.state.machine.current === "ready" || core.state.machine.current === "error"}
      <div class="print-overlay__actions">
        <Button variant="ghost" onclick={onClose}>{t("common.cancel")}</Button>
        {#if core.state.canExport}
          <Button variant="outline" onclick={core.handlePreview}>{t("print.preview")}</Button>
          <Button variant="solid" onclick={core.handleExport}>{t("print.export")}</Button>
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
  }
  .print-overlay__head {
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
  .print-overlay__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
</style>
