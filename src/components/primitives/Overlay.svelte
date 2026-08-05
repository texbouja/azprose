<script lang="ts">
import type { Snippet } from "svelte";

let {
  open,
  onClose,
  children,
  ariaLabel,
  variant = "palette",
  width = null as string | null,
}: {
  open: boolean;
  onClose: () => void;
  children: Snippet;
  ariaLabel: string;
  variant?: "palette" | "modal";
  /** Largeur du cadre (inline style — prioritaire sur la classe). `"auto"` = épouse le contenu. */
  width?: string | null;
} = $props();

$effect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});
</script>

{#if open}
  <div class="mdv-overlay__backdrop" onclick={onClose} aria-hidden="true"></div>
  <div
    class="mdv-overlay mdv-overlay--{variant}"
    style={width ? `width: ${width}` : undefined}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={ariaLabel}
    onclick={(e) => e.stopPropagation()}
  >
    {@render children()}
  </div>
{/if}
