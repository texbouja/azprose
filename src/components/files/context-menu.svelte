<script lang="ts">
import type { Component } from "svelte";
import Icon from "@/components/primitives/Icon.svelte";

export type ContextMenuItem =
  | {
      label: string;
      icon?: Component<any>;
      onSelect: () => void;
      disabled?: boolean;
      hint?: string;
      destructive?: boolean;
    }
  | "divider";

let {
  open,
  x,
  y,
  items,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
} = $props();

let ref: HTMLDivElement;
let pos = $state({ left: x, top: y });

$effect(() => {
  if (!open || !ref) return;
  const rect = ref.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - 8;
  const maxTop = window.innerHeight - rect.height - 8;
  pos = {
    left: Math.max(8, Math.min(maxLeft, x)),
    top: Math.max(8, Math.min(maxTop, y)),
  };
});

$effect(() => {
  if (!open) return;
  const onClick = (e: MouseEvent) => {
    if (ref?.contains(e.target as Node)) return;
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
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
  <div
    bind:this={ref}
    class="mdv-menu mdv-context-menu"
    role="menu"
    style="position:fixed;left:{pos.left}px;top:{pos.top}px"
  >
    {#each items as item, i}
      {#if item === "divider"}
        <div class="mdv-menu__divider" aria-hidden="true" />
      {:else}
        <button
          type="button"
          role="menuitem"
          class="mdv-menu__item{item.destructive ? ' mdv-menu__item--destructive' : ''}"
          disabled={item.disabled}
          onclick={() => {
            if (item.disabled) return;
            onClose();
            item.onSelect();
          }}
        >
          <span class="mdv-menu__item-icon">
            {#if item.icon}
              <Icon icon={item.icon} size={13} strokeWidth={1.5} />
            {:else}
              <span aria-hidden="true" />
            {/if}
          </span>
          <span class="mdv-menu__item-label">{item.label}</span>
          {#if item.hint}
            <span class="mdv-menu__item-hint">{item.hint}</span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}
