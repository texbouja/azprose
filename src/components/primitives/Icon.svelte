<script lang="ts">
import type { IconData } from "@/lib/icons";

let {
  icon,
  size = 16,
  strokeWidth = 1.75,
  title,
}: {
  icon: IconData;
  size?: number;
  strokeWidth?: number;
  title?: string;
} = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-label={title}
  aria-hidden={title ? undefined : true}
>
  {@html icon}
</svg>
