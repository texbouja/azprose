<script lang="ts">
  const { value = "" }: { value?: string } = $props();

  let Component = $state<typeof import("./CsvPreview.svelte").default | null>(null);

  $effect(() => {
    import("./CsvPreview.svelte").then((m) => { Component = m.default; });
  });
</script>

{#if Component}
  <Component {value} />
{/if}
