<script lang="ts">
// Pied de panneau de l'assistant : le canal d'INFRASTRUCTURE, séparé du fil
// de conversation. Ce composant ne décide rien — la durée de vie et la
// priorité vivent dans `canal-statut.ts`, module pur et testé. Ici : une
// ligne, une couleur, un lien, une croix.
//
// Contre l'accoutumance périphérique (retour utilisateur : « il m'arrive
// souvent de rater des reports importants dans la statusbar ») : animation
// d'entrée, et pour l'erreur bloquante un marqueur persistant dans l'en-tête
// du panneau (posé par AgentPanel, pas ici).

import type { MessageStatut } from "@/lib/agent/canal-statut";
import { getT, language } from "@/lib/i18n";
import { openUrl } from "@tauri-apps/plugin-opener";

interface Props {
  message: MessageStatut | null;
  /** Fermeture manuelle — proposée pour la seule erreur bloquante, dont la
   *  résolution n'est pas observable. */
  onFerme: () => void;
}

let { message, onFerme }: Props = $props();

let t = $derived(getT($language));
let bloquant = $derived(message?.niveau === "erreur");
</script>

{#if message}
  <!-- Clé sur le texte : un message qui en remplace un autre rejoue
       l'animation d'entrée, sinon la substitution passerait inaperçue. -->
  {#key message.texte}
    <div
      class="agent__statut"
      data-niveau={message.niveau}
      role={bloquant ? "alert" : "status"}
      aria-live={bloquant ? "assertive" : "polite"}
    >
      <i
        class={bloquant ? "wxi-alert-circle" : message.niveau === "avertissement" ? "wxi-alert-triangle" : "wxi-info"}
        aria-hidden="true"
      ></i>
      <!-- title = intégral au survol : la ligne tronque, le message de la
           passerelle (429 verbatim) est souvent plus long qu'elle. -->
      <span class="agent__statut-texte" title={message.texte}>{message.texte}</span>
      {#if message.url}
        <button
          type="button"
          class="agent__statut-lien"
          onclick={() => void openUrl(message.url!)}
        >{t("agent.statut.ouvrir")}</button>
      {/if}
      {#if bloquant}
        <button
          type="button"
          class="agent__statut-croix"
          aria-label={t("agent.statut.fermer")}
          data-tooltip={t("agent.statut.fermer")}
          onclick={onFerme}
        ><i class="wxi-close" aria-hidden="true"></i></button>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .agent__statut {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-top: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 12px;
    line-height: 1.35;
    background: color-mix(in srgb, var(--surface) 60%, transparent);
    animation: agent-statut-in 260ms cubic-bezier(0.2, 0.9, 0.25, 1.05);
  }

  /* Couleurs AUX TOKENS. Pas de token « warning » dans le thème : l'accent
     joue ce rôle partout ailleurs dans l'app (bordure des toasts d'erreur
     comprise), on ne crée pas un token pour un seul usage. */
  .agent__statut[data-niveau="info"] {
    color: var(--muted);
  }
  .agent__statut[data-niveau="avertissement"] {
    color: var(--accent);
    border-top-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .agent__statut[data-niveau="erreur"] {
    color: var(--color-error);
    border-top-color: color-mix(in srgb, var(--color-error) 55%, var(--border));
    background: color-mix(in srgb, var(--color-error) 10%, transparent);
    font-weight: 500;
  }

  .agent__statut i {
    flex-shrink: 0;
    font-size: 13px;
  }

  .agent__statut-texte {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agent__statut-lien,
  .agent__statut-croix {
    flex-shrink: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .agent__statut-lien {
    text-decoration: underline;
    font-size: 11px;
  }

  .agent__statut-lien:hover,
  .agent__statut-croix:hover {
    background: color-mix(in srgb, currentColor 14%, transparent);
  }

  @keyframes agent-statut-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .agent__statut { animation: none; }
  }
</style>
