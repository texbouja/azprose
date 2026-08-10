<script lang="ts">
  /**
   * PrintOverlay — point d'entrée de l'overlay d'impression (Phase 3).
   *
   * Dispatcher mince entre les modules d'impression (printing.md §2.1) :
   *   - mode "markdown" → module md (MdPrintOverlay) : export md→PDF ;
   *   - mode "planches" → module colle (CollePrintOverlay) : planches de
   *     colles (hérité du dialogue CollePrintDialog — décision utilisateur).
   * Toute la mécanique commune (machine à états, papier/marges/colonnes,
   * entête/pied, preview/export, persistance) vit dans
   * `src/printing/core/` — consommée par les deux modules via leur contrat.
   */
  import MdPrintOverlay from "@/printing/md/MdPrintOverlay.svelte";
  import CollePrintOverlay from "@/printing/colle/CollePrintOverlay.svelte";

  let {
    open,
    mode = "markdown",
    source = null,
    filePath = null,
    onClose,
  }: {
    open: boolean;
    /** "markdown" = export md→PDF ; "planches" = planches de colles. */
    mode?: "markdown" | "planches";
    source?: string | null;
    filePath?: string | null;
    onClose: () => void;
  } = $props();
</script>

{#if mode === "planches"}
  <CollePrintOverlay {open} {source} {filePath} {onClose} />
{:else}
  <MdPrintOverlay {open} {source} {filePath} {onClose} />
{/if}
