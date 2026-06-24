<script lang="ts">
import type { Component } from "svelte";

let {
  icon: Icon,
  size = 16,
  strokeWidth = 1.75,
  title,
}: {
  icon: Component;
  size?: number;
  strokeWidth?: number;
  title?: string;
} = $props();
</script>

<Icon
  {size}
  {strokeWidth}
  aria-label={title}
  aria-hidden={title ? undefined : true}
/>
