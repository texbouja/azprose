<script lang="ts">
let {
  value = "",
  fullscreen = false,
  onExitFullscreen,
}: {
  value?: string;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
} = $props();

let Cmp = $state<typeof import("./MarpDeck.svelte").default | null>(null);

$effect(() => {
  let cancelled = false;
  import("./MarpDeck.svelte")
    .then((mod) => { if (!cancelled) Cmp = mod.default; })
    .catch((err) => console.error("azprose: failed to load MarpDeck", err));
  return () => { cancelled = true; };
});
</script>

{#if Cmp}
  <Cmp {value} {fullscreen} {onExitFullscreen} />
{:else}
  <div class="mdv-editor mdv-editor--loading">chargement de la présentation Marp…</div>
{/if}
