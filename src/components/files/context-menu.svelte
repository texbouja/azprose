<script lang="ts">
export type { ContextMenuItem } from "@/stores/context-menu.svelte";
import type { ContextMenuItem } from "@/stores/context-menu.svelte";

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
    {#each items as item}
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
              <i class={item.icon} style="font-size:13px;{item.iconStyle ?? ''}"></i>
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

<style>
  /* Contrat CSS propre au composant (vague 3, phase 3.1, R2/R3) — rapatrié
     depuis src/styles/files/sidebar.css, seul consommateur de .mdv-context-menu.
     .mdv-menu/.mdv-menu__* (base) restent dans styles/shared/menu.css :
     vocabulaire commun à tous les menus de l'app (palette, overlays…), pas
     propre à celui-ci. Mounted at app level (outside .mdv-sidebar), donc
     rebind --font-ui vers la police sidebar pour rester visuellement
     cohérent avec le menu contextuel de l'arbre qui l'a ouvert. */
  .mdv-context-menu {
    min-width: 168px;
    max-width: 240px;
    padding: 3px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow:
      0 1px 0 color-mix(in srgb, white 4%, transparent) inset,
      0 10px 28px rgba(var(--shadow-color), 0.22),
      0 2px 8px rgba(var(--shadow-color), 0.08);
    z-index: 950;
    gap: 0;
    --font-ui: var(--font-sidebar);
    font-family: var(--font-sidebar);
  }

  .mdv-context-menu .mdv-menu__item {
    width: 100%;
    padding: 4px 9px;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: 12.5px;
    gap: 8px;
  }

  /* Generic hover feedback — the shared .mdv-menu__item:hover (surface-hover)
     loses to the transparent background above (specificity 0-2-0 vs 0-1-1), so
     the context menu had NO visual response on hover. */
  .mdv-context-menu .mdv-menu__item:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }

  .mdv-context-menu .mdv-menu__item:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .mdv-context-menu .mdv-menu__item:disabled:hover {
    background: transparent;
  }

  .mdv-context-menu .mdv-menu__divider {
    margin: 2px 6px;
  }

  /* destructive action (delete) — accent red only on hover so it doesn't shout */
  .mdv-context-menu .mdv-menu__item--destructive:hover {
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
    color: var(--color-error);
  }

  .mdv-context-menu .mdv-menu__item-hint {
    margin-left: auto;
    padding: 0 6px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--fg) 4%, transparent);
    font-family: var(--font-ui);
    font-size: 8.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
</style>
