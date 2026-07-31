<script lang="ts">
import { onMount } from "svelte";
let Comp: any = $state(null);
onMount(() => {
  import("./SvarCalendarPanel.svelte").then(m => Comp = m.default);
});
</script>

{#if Comp}
  <Comp />
{/if}
