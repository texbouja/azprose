<script lang="ts">
  /**
   * CollePrintOverlay — module d'impression "colle" (planches PDF).
   *
   * Wrapper du noyau overlay : branche le contrat colle (persistance
   * `.azprose/print/colle.json`, builders planches-render, compteur de
   * planches, état vide bruyant) et fournit le snippet `extra` : checkbox
   * « avec/sans évaluation » (réglage du dernier rendu, poussée vers le
   * contrat à l'export/aperçu) + compteur de planches.
   */
  import { getT, language } from "@/lib/i18n";
  import PrintOverlay from "@/printing/core/PrintOverlay.svelte";
  import { collePrintContract } from "./contract";

  let {
    open,
    source = null,
    filePath = null,
    onClose,
  }: {
    open: boolean;
    source?: string | null;
    filePath?: string | null;
    onClose: () => void;
  } = $props();

  let t = $derived(getT($language));

  let includeEval = $state(false);

  // Pousse la checkbox vers le contrat (module statique) — les builders
  // planches la relisent au moment de l'aperçu/export.
  $effect(() => {
    collePrintContract.setIncludeEval(includeEval);
  });
</script>

<PrintOverlay
  {open}
  {source}
  {filePath}
  {onClose}
  contract={collePrintContract}
>
  {#snippet extra(ectx)}
    <!-- Planches : avec/sans évaluation + compteur -->
    <label class="print-overlay__checkbox">
      <input type="checkbox" bind:checked={includeEval} />
      <span class="print-overlay__checkbox-label">{t("colle.printIncludeEval")}</span>
    </label>
    <p class="print-overlay__hint">{t("colle.printHintEval")}</p>
    <p class="print-overlay__count">{t("colle.printCount", { count: ectx.count })}</p>
  {/snippet}
</PrintOverlay>

<style>
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
  .print-overlay__hint {
    margin: 0;
    color: var(--fg-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .print-overlay__count {
    margin: 0;
    color: var(--fg-muted);
  }
</style>
