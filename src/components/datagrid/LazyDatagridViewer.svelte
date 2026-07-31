<script lang="ts">
  import { onMount } from "svelte";

  let {
    datagridId = "",
  }: {
    datagridId?: string;
  } = $props();

  let Comp: any = $state(null);
  onMount(() => {
    import("./DatagridViewer.svelte").then((m: any) => (Comp = m.default));
  });
</script>

{#if Comp}
  <Comp {datagridId} />
{/if}
