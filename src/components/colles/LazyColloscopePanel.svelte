<script lang="ts">
import { onMount } from "svelte";
let Comp: any = $state(null);
onMount(() => {
  import("./ColloscopePanel.svelte").then(m => Comp = m.default);
});
</script>

{#if Comp}
  <Comp />
{/if}
