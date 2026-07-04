<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";

  let {
    path, rev = 0, forwardToPage = null, onInverseSync, onToggleFullscreen,
  }: {
    path: string; rev?: number; forwardToPage?: number | null;
    onInverseSync?: (file: string, line: number) => void;
    onToggleFullscreen?: () => void;
  } = $props();

  function handlePdfClick(page: number, x: number, y: number) {
    if (!onInverseSync) return;
    invoke<{ file: string; line: number }>("synctex_inverse", { pdfPath: path, page, x, y })
      .then((r) => onInverseSync!(r.file, r.line))
      .catch((err) => console.error("synctex inverse failed", err));
  }
</script>

<LazyPdfViewer
  {path} {rev}
  page={forwardToPage}
  onPdfClick={handlePdfClick}
  {onToggleFullscreen}
/>
