<script lang="ts">
  let { path }: { path: string } = $props();

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
  <Cmp {path} />
{:else}
  <div class="pdf-shell">
    <div class="pdf-overlay">
      <span class="pdf-loading-text">Loading PDF viewer…</span>
    </div>
  </div>
{/if}
