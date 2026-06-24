<script lang="ts">
import { displayKey } from "@/lib";
import Kbd from "./Kbd.svelte";

let {
  keys,
  separator,
}: {
  keys: string;
  separator?: string;
} = $props();

let segments = $derived(
  keys.split("+").map((s) => s.trim()).filter(Boolean),
);
</script>

{#each segments as seg, i}
  {#if i > 0 && separator}
    <span aria-hidden="true">{separator}</span>
  {/if}
  <Kbd>{displayKey(seg)}</Kbd>
{/each}
