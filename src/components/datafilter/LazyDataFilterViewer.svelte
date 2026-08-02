<script lang="ts">
  import { onMount } from "svelte";

  let {
    datafilterIds = [],
  }: {
    datafilterIds?: string[];
  } = $props();

  let Comp: any = $state(null);
  onMount(() => {
    import("./DataFilterViewer.svelte").then((m: any) => (Comp = m.default));
  });
</script>

{#if Comp}
  <Comp {datafilterIds} />
{/if}
