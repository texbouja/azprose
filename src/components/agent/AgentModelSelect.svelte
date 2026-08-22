<script lang="ts">
import { mount, unmount } from "svelte";
import AgentModelPopup from "./AgentModelPopup.svelte";
import type { ModeleDisponible } from "@/lib/agent/config-options";
import type { FournisseurCatalogue } from "@/lib/agent/catalogue";

/**
 * Sélecteur de modèle de l'assistant — le chip de l'en-tête du panneau
 * (`.agent__header`), équivalent du `/models` TUI d'OpenCode. Même gabarit
 * que `TexDirectiveSelect` (28 px, chevron) et même mécanisme portal dans
 * `document.body` : un `<select>` natif serait peint par WebKitGTK hors
 * thème, et le header étroit recliperait un popup rendu en place.
 *
 * La liste vient du PARENT : options déclarées par l'agent via ACP
 * (`config-options.ts`) + catalogue complet des fournisseurs (`catalogue.ts`,
 * voie serveur headless). Ce composant ne connaît ni le binaire ni le
 * protocole. La sélection est ASYNCHRONE (le switch passe par l'agent et
 * peut être refusé) : `onSelect` renvoie null si appliqué, sinon un message
 * d'erreur que le popup affiche en place. Un modèle non connecté passe par
 * `onSelectCatalogue` → dialogue de connexion côté panneau.
 */
let {
  label = "",
  value = null as string | null,
  /** Modèle ÉPINGLÉ = le défaut persisté (null = suivre OpenCode). */
  pin = null as string | null,
  /** Modèles déclarés par la session courante ; null = pas de liste
   *  (agent sans configOptions) → le popup dégrade en saisie libre. */
  modeles = null as ModeleDisponible[] | null,
  /** Catalogue complet trié ; null = pas encore chargé (chargement au 1er ouvert). */
  catalogue = null as FournisseurCatalogue[] | null,
  catalogueIndisponible = false,
  /** Aucun fournisseur coché en réglages → note d'orientation, pas un
   *  « tous déjà connectés » qui serait faux. */
  aucunCoche = false,
  disabled = false,
  onSelect,
  onSelectCatalogue,
  /** Épingle un modèle comme défaut (persisté par le panneau). */
  onEpingler,
  /** Première ouverture du menu : charge paresseuse du catalogue (panneau). */
  onOuvre,
}: {
  label?: string;
  value?: string | null;
  pin?: string | null;
  modeles?: ModeleDisponible[] | null;
  catalogue?: FournisseurCatalogue[] | null;
  catalogueIndisponible?: boolean;
  aucunCoche?: boolean;
  disabled?: boolean;
  onSelect?: (id: string) => Promise<string | null>;
  onSelectCatalogue?: (id: string) => void;
  onEpingler?: (id: string) => void;
  onOuvre?: () => void;
} = $props();

let open = $state(false);
let triggerEl = $state<HTMLButtonElement | null>(null);

function toggle() {
  if (disabled) return;
  if (!open) onOuvre?.();
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
      pin,
      modeles,
      catalogue,
      catalogueIndisponible,
      aucunCoche,
      triggerEl,
      onSelect,
      onSelectCatalogue,
      onEpingler,
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
  <!-- Le chip montre l'ACTIF, jamais l'épinglé : l'écart entre les deux est
       une information (« j'essaie autre chose »), pas une incohérence. Le
       tiret ne dure que le temps du démarrage de la session. -->
  <span class="agent-model__value">{value ?? "—"}</span>
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
