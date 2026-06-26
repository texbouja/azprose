<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLButtonAttributes } from "svelte/elements";

let {
  variant = "ghost",
  size = "sm",
  icon,
  iconRight,
  children,
  class: className = "",
  ...rest
}: {
  variant?: "ghost" | "solid";
  size?: "sm" | "md";
  icon?: Snippet;
  iconRight?: Snippet;
  children?: Snippet;
  class?: string;
} & Omit<HTMLButtonAttributes, "class"> = $props();

let classes = $derived(
  ["mdv-btn", `mdv-btn--${variant}`, `mdv-btn--${size}`, className]
    .filter(Boolean)
    .join(" "),
);
</script>

<button class={classes} {...rest}>
  {#if icon}
    <span class="mdv-btn__icon">{@render icon()}</span>
  {/if}
  {#if children}
    <span class="mdv-btn__label">{@render children()}</span>
  {/if}
  {#if iconRight}
    <span class="mdv-btn__icon">{@render iconRight()}</span>
  {/if}
</button>
