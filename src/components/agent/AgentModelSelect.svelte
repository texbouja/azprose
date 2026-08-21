<script lang="ts">
import { mount, unmount } from "svelte";
import AgentModelPopup from "./AgentModelPopup.svelte";

/**
 * Sélecteur de modèle de l'assistant — le chip de l'en-tête du panneau
 * (`.agent__header`), équivalent du `/models` TUI d'OpenCode. Même gabarit
 * que `TexDirectiveSelect` (28 px, chevron) et même mécanisme portal dans
 * `document.body` : un `<select>` natif serait peint par WebKitGTK hors
 * thème, et le header étroit recliperait un popup rendu en place.
 *
 * La sélection est ASYNCHRONE (le switch passe par l'agent et peut être
 * refusé) : `onSelect` renvoie null si appliqué, sinon un message d'erreur
 * que le popup affiche en place. `value === null` = « Défaut OpenCode ».
 */
let {
  label = "",
  value = null as string | null,
  labelDefaut = "",
  disabled = false,
  onSelect,
}: {
  label?: string;
  value?: string | null;
  labelDefaut?: string;
  disabled?: boolean;
  onSelect?: (id: string | null) => Promise<string | null>;
} = $props();

let open = $state(false);
let triggerEl = $state<HTMLButtonElement | null>(null);

function toggle() {
  if (disabled) return;
  open = !open;
}

function close() {
  open = false;
}

// Portal : tant que le menu est ouvert, il vit dans document.body pour
// échapper au clip des conteneurs ancêtres. Le cleanup démonte le popup ET
// retire son nœud hôte à la fermeture ou à la destruction.
$effect(() => {
  if (!open) return;
  const rect = triggerEl?.getBoundingClientRect() ?? null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const popup = mount(AgentModelPopup, {
    target: host,
    props: {
      rect,
      value,
      labelDefaut,
      triggerEl,
      onSelect,
      onClose: close,
    },
  });
  return () => {
    void unmount(popup);
    host.remove();
  };
});
</script>

<button
  type="button"
  class="agent-model"
  class:is-open={open}
  bind:this={triggerEl}
  onclick={toggle}
  aria-haspopup="listbox"
  aria-expanded={open}
  {disabled}
  title={label}
>
  <span class="agent-model__label">{label}</span>
  <span class="agent-model__value">{value ?? labelDefaut}</span>
  <i class="wxi-chevron-down agent-model__arrow" aria-hidden="true"></i>
</button>

<style>
  /* Même gabarit que TexDirectiveSelect : 28 px, rayon 5 px, fonte 12 px. */
  .agent-model {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    max-width: 220px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-preview, var(--font-ui, system-ui));
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .agent-model:hover:not(:disabled),
  .agent-model.is-open {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .agent-model:focus-visible {
    outline: none;
    border-color: var(--accent);
  }
  .agent-model:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .agent-model__label {
    color: var(--muted);
  }
  .agent-model__value {
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agent-model__arrow {
    width: 12px;
    height: 12px;
    font-size: 12px;
    color: var(--muted);
    flex-shrink: 0;
  }
</style>
