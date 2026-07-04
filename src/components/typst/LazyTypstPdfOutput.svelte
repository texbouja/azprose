<script lang="ts">
  let {
    path, rev = 0, onToggleFullscreen,
  }: {
    path: string; rev?: number;
    onToggleFullscreen?: () => void;
  } = $props();

  let Cmp = $state<typeof import("./TypstPdfOutput.svelte").default | null>(null);

  $effect(() => {
    let cancelled = false;
    import("./TypstPdfOutput.svelte")
      .then((mod) => {
        if (cancelled) return;
        Cmp = mod.default;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("azprose: failed to load Typst PDF output", err);
      });
    return () => { cancelled = true; };
  });
</script>

{#if Cmp}
  {#key rev}
    <Cmp {path} rev={rev} {onToggleFullscreen} />
  {/key}
{:else}
  <div class="pdf-shell">
    <div class="pdf-overlay">
      <span class="pdf-loading-text">Loading PDF viewer…</span>
    </div>
  </div>
{/if}
