<script lang="ts">
import type { Snippet } from "svelte";

let {
  children,
  class: className = "",
  ...rest
}: {
  children: Snippet;
  class?: string;
} = $props();

let classes = $derived(["mdv-kbd", className].filter(Boolean).join(" "));
</script>

<kbd class={classes} {...rest}>
  {@render children()}
</kbd>
