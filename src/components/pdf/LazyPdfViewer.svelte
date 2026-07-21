<script lang="ts">
  import type { RectInfo } from "@/pdf/rect-select";

  let { path, rev = 0, page = null, onInverseSync, onRectSelected, onToggleFullscreen }:
    { path: string; rev?: number; page?: number | null; onInverseSync?: (file: string, line: number) => void; onRectSelected?: (info: RectInfo) => void; onToggleFullscreen?: () => void }
    = $props();

  let Cmp = $state<typeof import("./PdfViewer.svelte").default | null>(null);

  $effect(() => {
    let cancelled = false;
    import("./PdfViewer.svelte")
      .then((mod) => {
        if (cancelled) return;
        Cmp = mod.default;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("azprose: failed to load PDF viewer", err);
      });
    return () => { cancelled = true; };
  });
</script>

{#if Cmp}
  {#key rev}
    <Cmp {path} rev={rev} {page} {onInverseSync} {onRectSelected} {onToggleFullscreen} />
  {/key}
{:else}
  <div class="pdf-shell">
    <div class="pdf-overlay">
      <span class="pdf-loading-text">Loading PDF viewer…</span>
    </div>
  </div>
{/if}
