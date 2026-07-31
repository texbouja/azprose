<script lang="ts">
  import { onMount } from "svelte";

  let {
    spreadsheetId = "",
  }: {
    spreadsheetId?: string;
  } = $props();

  let Comp: any = $state(null);
  onMount(() => {
    import("./SpreadsheetViewer.svelte").then((m) => (Comp = m.default));
  });
</script>

{#if Comp}
  <Comp {spreadsheetId} />
{/if}
