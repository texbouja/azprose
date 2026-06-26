<script lang="ts">
let {
  value = "",
  filePath = null as string | null,
}: {
  value?: string;
  filePath?: string | null;
} = $props();

let Cmp = $state<typeof import("./MarkdownPreview.svelte").default | null>(null);
let loading = $state(true);

$effect(() => {
  let cancelled = false;
  import("./MarkdownPreview.svelte")
    .then((mod) => {
      if (cancelled) return;
      loading = false;
      Cmp = mod.default;
    })
    .catch((err) => {
      if (cancelled) return;
      console.error("azprose: failed to load MarkdownPreview", err);
    });
  return () => { cancelled = true; };
});
</script>

{#if loading}
  <div class="mdv-editor mdv-editor--loading">chargement de la prévisualisation…</div>
{:else if Cmp}
  <Cmp {value} {filePath} />
{/if}
