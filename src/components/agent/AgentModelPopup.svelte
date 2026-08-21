<script lang="ts">
/**
 * Liste des modèles de l'assistant, rendue dans `document.body` (portal,
 * montée par `AgentModelSelect`) — même mécanisme que `TexDirectivePopup` :
 * échapper au `overflow`/`backdrop-filter` des conteneurs et rester thémée.
 *
 * Ce que la version « directives » n'a pas et qu'exige une liste de modèles :
 * un champ de FILTRE (centaines d'entrées possibles selon les providers
 * authentifiés), l'option « Défaut OpenCode » (absence de surcharge — état
 * légitime), le repli SAISIE LIBRE `fournisseur/modèle` quand la liste est
 * vide ou sans le modèle voulu, et une sélection ASYNCHRONE : le switch passe
 * par l'agent (`session/set_model`) et peut être refusé — l'erreur s'affiche
 * en place, le menu reste ouvert.
 */
import { grouperParProvider, listerModeles, estIdModele, type ModeleDisponible } from "@/lib/agent/modeles";
import { resolveAgentBinary } from "@/lib/agent/client";
import { getT, language } from "@/lib/i18n";

let {
  rect = null as DOMRect | null,
  value = null as string | null,
  labelDefaut = "",
  triggerEl = null as HTMLElement | null,
  onSelect,
  onClose,
}: {
  rect?: DOMRect | null;
  /** Choix courant persisté — `null` = Défaut OpenCode. */
  value?: string | null;
  labelDefaut?: string;
  triggerEl?: HTMLElement | null;
  /** Renvoie null si le choix est appliqué, sinon le message d'erreur. */
  onSelect?: (id: string | null) => Promise<string | null>;
  onClose?: () => void;
} = $props();

let t = $derived(getT($language));

let ref = $state<HTMLDivElement | null>(null);
let pos = $state({ left: 8, top: 8 });
let requete = $state("");
let searchEl = $state<HTMLInputElement | null>(null);
let modeles = $state<ModeleDisponible[]>([]);
let etat = $state<"chargement" | "pret" | "erreur">("chargement");
let erreurInline = $state("");
// Sélection en vol : on grise les items pour éviter un double set_model.
let enCours = $state<string | null>(null);

// Chargement paresseux à l'ouverture (cache du module : ~2 s payées une fois).
$effect(() => {
  let vivant = true;
  listerModeles(resolveAgentBinary())
    .then((m) => {
      if (!vivant) return;
      modeles = m;
      etat = "pret";
    })
    .catch((e) => {
      console.warn("[agent] liste des modèles indisponible :", e);
      if (vivant) etat = "erreur";
    });
  return () => {
    vivant = false;
  };
});

const filtres = $derived.by(() => {
  const q = requete.trim().toLowerCase();
  if (!q) return modeles;
  return modeles.filter((m) => m.id.toLowerCase().includes(q));
});
const groupes = $derived(grouperParProvider(filtres));

/** Saisie libre : la requête a la forme d'un identifiant ET ne désigne pas
 *  déjà un item filtré — proposer explicitement de l'utiliser. */
const saisieLibre = $derived.by(() => {
  const q = requete.trim();
  if (!estIdModele(q)) return "";
  if (filtres.some((m) => m.id === q)) return "";
  return q;
});

async function choisir(id: string | null) {
  if (!onSelect || enCours !== null) return;
  erreurInline = "";
  enCours = id ?? "∅";
  try {
    const err = await onSelect(id);
    if (err) {
      // Refus du binaire (« model not found ») : message en place, menu ouvert.
      const m = /model not found:\s*(\S+)/i.exec(err);
      erreurInline = m ? t("agent.model.notFound", { id: m[1] }) : err;
      return;
    }
    onClose?.();
  } finally {
    enCours = null;
  }
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    onClose?.();
    return;
  }
  if (e.key !== "Enter") return;
  e.preventDefault();
  // Entrée : la saisie libre prioritaire, sinon le premier modèle filtré,
  // sinon l'option défaut — toujours quelque chose de prévisible.
  if (saisieLibre) void choisir(saisieLibre);
  else if (filtres.length > 0) void choisir(filtres[0].id);
  else void choisir(null);
}

// Sous le déclencheur, rabattu dans le viewport si la liste déborderait
// (même géométrie que TexDirectivePopup).
$effect(() => {
  if (!ref || !rect) return;
  const pop = ref.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - pop.width - 8);
  const top = Math.min(rect.bottom + 2, window.innerHeight - pop.height - 8);
  pos = { left: Math.max(8, left), top: Math.max(8, top) };
});

// Ferme au clic hors de la liste ET hors du déclencheur (qui porte son propre
// toggle), et sur Échap — hors champ de recherche, qui a son propre handler.
$effect(() => {
  const onDown = (e: MouseEvent) => {
    const cible = e.target as Node;
    if (ref?.contains(cible)) return;
    if (triggerEl?.contains(cible)) return;
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && document.activeElement !== searchEl) {
      e.preventDefault();
      onClose?.();
    }
  };
  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("keydown", onKey);
  };
});

// Focus du filtre à l'ouverture — une liste qu'on doit cliquer avant de
// chercher aurait raté son seul intérêt.
$effect(() => {
  searchEl?.focus();
});
</script>

<div
  bind:this={ref}
  class="agent-model-popup"
  role="listbox"
  aria-label={t("agent.model.label")}
  style="position:fixed;left:{pos.left}px;top:{pos.top}px"
>
  <input
    bind:this={searchEl}
    bind:value={requete}
    class="agent-model-popup__search"
    type="text"
    placeholder={t("agent.model.search")}
    spellcheck="false"
    onkeydown={onSearchKeydown}
  />

  <button
    type="button"
    role="option"
    aria-selected={value === null}
    class="agent-model-popup__item agent-model-popup__defaut"
    class:is-selected={value === null}
    disabled={enCours !== null}
    onclick={() => choisir(null)}
  >
    {labelDefaut}
  </button>

  {#if etat === "chargement"}
    <div class="agent-model-popup__note">{t("agent.model.loading")}</div>
  {:else if etat === "erreur"}
    <div class="agent-model-popup__note">{t("agent.model.indisponible")}</div>
  {:else if filtres.length === 0 && !saisieLibre}
    <div class="agent-model-popup__note">{t("agent.model.aucun")}</div>
  {:else}
    {#each [...groupes] as [provider, liste] (provider)}
      <div class="agent-model-popup__groupe">{provider}</div>
      {#each liste as m (m.id)}
        <button
          type="button"
          role="option"
          aria-selected={m.id === value}
          class="agent-model-popup__item"
          class:is-selected={m.id === value}
          disabled={enCours !== null}
          onclick={() => choisir(m.id)}
        >
          <span class="agent-model-popup__nom">{m.id.slice(provider.length + 1)}</span>
        </button>
      {/each}
    {/each}
  {/if}

  {#if saisieLibre}
    <button
      type="button"
      role="option"
      aria-selected={saisieLibre === value}
      class="agent-model-popup__item agent-model-popup__libre"
      disabled={enCours !== null}
      onclick={() => choisir(saisieLibre)}
    >
      {t("agent.model.useCustom", { id: saisieLibre })}
    </button>
  {/if}

  {#if erreurInline}
    <div class="agent-model-popup__erreur">{erreurInline}</div>
  {/if}
</div>

<style>
  .agent-model-popup {
    width: 300px;
    max-height: 380px;
    overflow-y: auto;
    padding: 5px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow:
      0 1px 0 color-mix(in srgb, white 4%, transparent) inset,
      0 10px 28px rgba(var(--shadow-color), 0.22),
      0 2px 8px rgba(var(--shadow-color), 0.08);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }
  .agent-model-popup__search {
    margin: 0 1px 5px;
    padding: 5px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    color: var(--fg);
  }
  .agent-model-popup__search:focus {
    outline: none;
    border-color: var(--accent);
  }
  .agent-model-popup__groupe {
    padding: 6px 9px 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .agent-model-popup__item {
    display: block;
    width: 100%;
    padding: 4px 9px;
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    color: var(--fg);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agent-model-popup__item:hover:not(:disabled) {
    background: var(--surface-hover);
  }
  .agent-model-popup__item:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .agent-model-popup__item.is-selected {
    color: var(--accent);
  }
  .agent-model-popup__defaut {
    border-bottom: 1px solid var(--border);
    border-radius: 4px 4px 0 0;
    margin-bottom: 2px;
    padding-bottom: 6px;
  }
  .agent-model-popup__libre {
    border-top: 1px solid var(--border);
    border-radius: 0 0 4px 4px;
    margin-top: 2px;
    padding-top: 6px;
    color: var(--accent);
  }
  .agent-model-popup__nom {
    /* Le segment après « provider/ » porte l'info utile ; le fournisseur est
       déjà l'en-tête de groupe au-dessus. */
    font-family: var(--font-preview, var(--font-ui, system-ui));
  }
  .agent-model-popup__note {
    padding: 8px 9px;
    font-size: 12px;
    color: var(--muted);
  }
  .agent-model-popup__erreur {
    margin-top: 4px;
    padding: 6px 9px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--agent-del, #f85149);
    white-space: normal;
  }
</style>
