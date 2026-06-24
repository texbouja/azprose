<script lang="ts">
import type { Snippet } from "svelte";

let {
  open,
  onClose,
  anchorRef,
  children,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: { current: HTMLElement | null };
  children: Snippet;
  align?: "left" | "right";
} = $props();

let ref = $state<HTMLDivElement | null>(null);

$effect(() => {
  if (!open) return;

  const onClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (ref?.contains(target)) return;
    if (anchorRef.current?.contains(target)) return;
    onClose();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  document.addEventListener("mousedown", onClick);
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("mousedown", onClick);
    document.removeEventListener("keydown", onKey);
  };
});
</script>

{#if open}
  <div bind:this={ref} class="mdv-popover mdv-popover--{align}" role="menu">
    {@render children()}
  </div>
{/if}
