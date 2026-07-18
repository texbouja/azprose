<script lang="ts">
  let {
    filePath = "",
    onToggleFullscreen,
    onInverseSync,
  }: {
    filePath?: string;
    onToggleFullscreen?: () => void;
    onInverseSync?: (file: string, line: number) => void;
  } = $props();

  let Cmp = $state<typeof import("./TypstPreview.svelte").default | null>(null);
  let loading = $state(true);

  $effect(() => {
    let cancelled = false;
    import("./TypstPreview.svelte")
      .then((mod) => {
        if (cancelled) return;
        loading = false;
        Cmp = mod.default;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("azprose: failed to load TypstPreview", err);
      });
    return () => { cancelled = true; };
  });
</script>

{#if loading}
  <div class="typst-preview-lazy">Chargement…</div>
{:else if Cmp}
  <Cmp {filePath} {onToggleFullscreen} {onInverseSync} />
{/if}

<style>
  .typst-preview-lazy {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted, #888);
    font-size: 0.875rem;
  }
</style>
