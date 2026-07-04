<script lang="ts">
  import LazyPdfViewer from "@/components/pdf/LazyPdfViewer.svelte";

  let {
    path, rev = 0, onToggleFullscreen,
  }: {
    path: string; rev?: number;
    onToggleFullscreen?: () => void;
  } = $props();
</script>

<LazyPdfViewer {path} {rev} {onToggleFullscreen} />
