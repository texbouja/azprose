<script lang="ts">
let { value = "" }: { value?: string } = $props();

let Cmp = $state<typeof import("./MarpPreview.svelte").default | null>(null);

$effect(() => {
  let cancelled = false;
  import("./MarpPreview.svelte")
    .then((mod) => { if (!cancelled) Cmp = mod.default; })
    .catch((err) => console.error("azprose: failed to load MarpPreview", err));
  return () => { cancelled = true; };
});
</script>

{#if Cmp}
  <Cmp {value} />
{:else}
  <div class="mdv-editor mdv-editor--loading">chargement de la prévisualisation Marp…</div>
{/if}
