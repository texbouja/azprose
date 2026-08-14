<script lang="ts">
// Chargement paresseux du panneau agent — motif Lazy*.svelte du dépôt :
// le code de l'agent (client ACP, UI) ne doit pas alourdir le boot.
import { onMount } from "svelte";
let Comp: any = $state(null);
onMount(() => { import("./AgentPanel.svelte").then(m => Comp = m.default); });
</script>

{#if Comp}<Comp />{/if}
