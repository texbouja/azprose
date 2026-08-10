<script lang="ts">
  /**
   * MdPrintOverlay — module d'impression "md" (export md→PDF).
   *
   * Wrapper du noyau overlay : branche le contrat md (persistance
   * `.azprose/print/md.json`, builders pdf-export, features gabarit de
   * coquille + wikilinks) et rend l'overlay commun sans snippet
   * supplémentaire — tout le spécifique md est piloté par
   * `contract.features` dans le noyau.
   */
  import PrintOverlay from "@/printing/core/PrintOverlay.svelte";
  import { mdPrintContract } from "./contract";

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
</script>

<PrintOverlay
  {open}
  {source}
  {filePath}
  {onClose}
  contract={mdPrintContract}
/>
