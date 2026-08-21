<script lang="ts">
/**
 * Dialogue de connexion d'un fournisseur du catalogue (assistant IA).
 *
 * Voie DOCUMENTÉE du serveur headless OpenCode :
 *  - `GET /provider/auth` → méthodes déclarées par fournisseur
 *    ({type:"api"|"oauth", label}) ;
 *  - clé API → `PUT /auth/{id}` corps ApiAuth {type:"api", key} ;
 *  - OAuth → `POST /provider/{id}/oauth/authorize` {method, inputs} qui rend
 *    {url, method:"auto"|"code", instructions} ; on ouvre l'URL dans le
 *    NAVIGATEUR SYSTÈME (plugin-opener — jamais de webview embarquée : les
 *    fournisseurs bloquent les webviews) puis on interroge `/provider`
 *    jusqu'à voir le fournisseur dans `connected`.
 *
 * La méthode OAuth « code » (code à recopier) affiche les instructions mais
 * garde le même polling : hors périmètre v1 de saisir le code à la main.
 */
import { onDestroy, onMount } from "svelte";
import { getT, language } from "@/lib/i18n";
import { serveurCatalogue } from "@/lib/agent/serve";
import { resolveAgentBinary } from "@/lib/agent/client";
import type { FournisseurCatalogue } from "@/lib/agent/catalogue";
import { openUrl } from "@tauri-apps/plugin-opener";

let {
  fournisseur,
  onFerme,
  onConnecte,
}: {
  fournisseur: FournisseurCatalogue;
  /** Fermeture sans connexion (Échap, clic dehors, Annuler). */
  onFerme: () => void;
  /** Connexion confirmée par le serveur (présent dans `connected`). */
  onConnecte: () => Promise<void> | void;
} = $props();

let t = $derived(getT($language));

type MethodeAuth = { type?: string; label?: string };

/** null = méthodes en cours de récupération. */
let methodes = $state<MethodeAuth[] | null>(null);
let etat = $state<"methodes" | "cle" | "oauth">("methodes");
let cle = $state("");
let enVol = $state(false);
let erreur = $state("");
/** Consignes renvoyées par authorize (OAuth) — affichées telles quelles. */
let instructions = $state("");

/** Garde-fou contre les polls survivant au dialogue (démontage pendant l'attente). */
let vivant = true;
let minuteur: ReturnType<typeof setInterval> | null = null;

onMount(async () => {
  try {
    const carte = await serveurCatalogue.requete<Record<string, MethodeAuth[]>>(
      resolveAgentBinary(), "/provider/auth",
    );
    methodes = carte[fournisseur.id] ?? [];
  } catch (e) {
    methodes = [];
    erreur = String(e);
  }
});

onDestroy(() => {
  vivant = false;
  if (minuteur !== null) clearInterval(minuteur);
});

function choisirMethode(i: number, m: MethodeAuth) {
  if (m.type === "oauth") {
    etat = "oauth";
    void lancerOauth(i);
  } else {
    etat = "cle";
  }
}

async function connecterCle() {
  if (!cle.trim() || enVol) return;
  enVol = true;
  erreur = "";
  try {
    await serveurCatalogue.requete(resolveAgentBinary(), `/auth/${encodeURIComponent(fournisseur.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "api", key: cle.trim() }),
    });
    await onConnecte();
  } catch (e) {
    erreur = String(e);
  } finally {
    enVol = false;
  }
}

async function lancerOauth(idx: number) {
  enVol = true;
  erreur = "";
  try {
    const rep = await serveurCatalogue.requete<{ url?: string; instructions?: string }>(
      resolveAgentBinary(),
      `/provider/${encodeURIComponent(fournisseur.id)}/oauth/authorize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: idx, inputs: {} }),
      },
    );
    instructions = rep.instructions ?? "";
    if (rep.url) await openUrl(rep.url);
    attendreConnexion();
  } catch (e) {
    erreur = String(e);
  } finally {
    enVol = false;
  }
}

/** Interroge `/provider` jusqu'à voir le fournisseur dans `connected`
 *  (3 min max) — c'est LA source de vérité, pas une supposition locale. */
function attendreConnexion() {
  const echeance = Date.now() + 180_000;
  minuteur = setInterval(() => {
    void (async () => {
      if (!vivant || Date.now() > echeance) {
        if (vivant) erreur = t("agent.connect.timeout");
        arreterPoll();
        return;
      }
      try {
        const rep = await serveurCatalogue.requete<{ connected?: string[] }>(resolveAgentBinary(), "/provider");
        if (rep.connected?.includes(fournisseur.id)) {
          arreterPoll();
          await onConnecte();
        }
      } catch { /* serveur occupé : on réessaie au prochain tick */ }
    })();
  }, 2000);
}

function arreterPoll() {
  if (minuteur !== null) clearInterval(minuteur);
  minuteur = null;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    onFerme();
  }
}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Couvre la fenêtre : le flux de connexion est modal par nature — tant
     qu'il tourne, le sélecteur derrière n'a plus de sens. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions — Échap géré globalement, le fond n'est qu'une cible de clic -->
<div class="agent-connect" role="dialog" aria-modal="true" aria-label={t("agent.connect.titre", { nom: fournisseur.nom })}>
  <div class="agent-connect__fond" onclick={onFerme}></div>
  <div class="agent-connect__carte">
    <div class="agent-connect__titre">
      {t("agent.connect.titre", { nom: fournisseur.nom })}
    </div>

    {#if methodes === null}
      <div class="agent-connect__note">{t("agent.connect.chargement")}</div>
    {:else if methodes.length === 0}
      <div class="agent-connect__note">{t("agent.connect.aucuneMethode")}</div>
    {:else if etat === "methodes"}
      {#each methodes as m, i (i)}
        <button
          type="button"
          class="agent-connect__methode"
          disabled={enVol}
          onclick={() => choisirMethode(i, m)}
        >
          <i class="wxi-{m.type === 'oauth' ? 'globe' : 'type'} agent-connect__icone" aria-hidden="true"></i>
          <span>{m.label ?? (m.type === "oauth" ? t("agent.connect.oauth") : t("agent.connect.api"))}</span>
        </button>
      {/each}
    {:else if etat === "cle"}
      <label class="agent-connect__champ">
        <span>{t("agent.connect.cleLabel")}</span>
        <!-- password : la clé ne doit pas rester lisible à l'écran -->
        <input
          type="password"
          bind:value={cle}
          placeholder={t("agent.connect.clePlaceholder")}
          spellcheck="false"
          autocomplete="off"
        />
      </label>
      <div class="agent-connect__actions">
        <button type="button" class="agent-connect__retour" onclick={() => (etat = "methodes")}>
          {t("agent.connect.retour")}
        </button>
        <button
          type="button"
          class="agent-connect__valider"
          disabled={!cle.trim() || enVol}
          onclick={connecterCle}
        >
          {t("agent.connect.valider")}
        </button>
      </div>
    {:else}
      {#if instructions}
        <div class="agent-connect__instructions">{instructions}</div>
      {/if}
      <div class="agent-connect__attente">
        <!-- Rotation portée par NOTRE classe : le helper de rotation du pack
             n'est pas une icône déclarée et le garde-fou le refuserait. -->
        <i class="wxi-loading agent-connect__spin" aria-hidden="true"></i>
        {t("agent.connect.attente")}
      </div>
      <div class="agent-connect__actions">
        <button type="button" class="agent-connect__retour" onclick={onFerme}>
          {t("agent.connect.annuler")}
        </button>
      </div>
    {/if}

    {#if erreur}
      <div class="agent-connect__erreur">{erreur}</div>
    {/if}
  </div>
</div>

<style>
  .agent-connect {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .agent-connect__fond {
    position: absolute;
    inset: 0;
    background: rgba(var(--shadow-color), 0.35);
  }
  .agent-connect__carte {
    position: relative;
    width: min(340px, calc(100vw - 48px));
    padding: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 6px);
    box-shadow:
      0 10px 28px rgba(var(--shadow-color), 0.28),
      0 2px 8px rgba(var(--shadow-color), 0.1);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .agent-connect__titre {
    font-size: 13px;
    font-weight: 600;
    color: var(--fg);
  }
  .agent-connect__note {
    font-size: 12.5px;
    color: var(--muted);
  }
  .agent-connect__methode {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    font-family: var(--font-ui, system-ui);
    font-size: 12.5px;
    color: var(--fg);
    text-align: left;
  }
  .agent-connect__methode:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .agent-connect__methode:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .agent-connect__icone {
    width: 14px;
    height: 14px;
    font-size: 14px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .agent-connect__champ {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .agent-connect__champ input {
    padding: 6px 9px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    color: var(--fg);
  }
  .agent-connect__champ input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .agent-connect__actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .agent-connect__retour,
  .agent-connect__valider {
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  .agent-connect__retour {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .agent-connect__valider {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--bg, #fff);
  }
  .agent-connect__retour:disabled,
  .agent-connect__valider:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .agent-connect__instructions {
    padding: 8px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    color: var(--fg);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 160px;
    overflow-y: auto;
  }
  .agent-connect__attente {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .agent-connect__spin {
    width: 14px;
    height: 14px;
    font-size: 14px;
    animation: agent-connect-tourne 1.5s linear infinite;
  }
  @keyframes agent-connect-tourne {
    to { transform: rotate(360deg); }
  }
  .agent-connect__erreur {
    padding-top: 6px;
    border-top: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--agent-del, #f85149);
    white-space: normal;
    word-break: break-word;
  }
</style>
