<script lang="ts">
  import type { Diagnostic } from "@/lib/diagnostics";

  interface ForwardTarget {
    page: number;
    x: number;
    y: number;
  }

  let {
    value = "",
    filePath = "",
    initialSvg = null as string | null,
    initialCompiledSource = null as string | null,
    onCompileResult,
    onToggleFullscreen,
    onInverseSync,
    forwardTo = null as ForwardTarget | null,
  }: {
    value?: string;
    filePath?: string;
    initialSvg?: string | null;
    initialCompiledSource?: string | null;
    onCompileResult?: (svg: string | null, diags: Diagnostic[], compiledSource: string) => void;
    onToggleFullscreen?: () => void;
    onInverseSync?: (file: string, line: number) => void;
    forwardTo?: ForwardTarget | null;
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
  <Cmp {value} {filePath} {initialSvg} {initialCompiledSource} {onCompileResult} {onToggleFullscreen} {onInverseSync} {forwardTo} />
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
