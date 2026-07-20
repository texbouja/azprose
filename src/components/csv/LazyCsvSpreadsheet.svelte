<script lang="ts">
  import { onMount } from "svelte";

  let {
    value = "",
    filePath = "",
    onChange,
  }: {
    value?: string;
    filePath?: string;
    onChange?: (csv: string) => void;
  } = $props();

  let Component = $state<any>(null);

  onMount(async () => {
    const mod = await import("./CsvSpreadsheet.svelte");
    Component = mod.default;
  });
</script>

{#if Component}
  <Component {value} {filePath} {onChange} />
{/if}
