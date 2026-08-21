<script lang="ts">
/**
 * Menu de choix du modèle de l'assistant, rendu dans `document.body` (portal,
 * monté par `AgentModelSelect`) — même mécanisme que `TexDirectivePopup` :
 * échapper au clip des conteneurs et rester thémé.
 *
 * La liste est celle que l'AGENT déclare (ACP v1 « Session Config Options »,
 * voir `config-options.ts`) : elle arrive toute formée du panneau, aucun
 * sondage du binaire ici. `modeles === null` = l'agent n'a rien déclaré
 * (binaire ancien) → note + saisie libre `fournisseur/modèle`.
 *
 * Forme EN CASCADE (retour d'usage : la liste plate à 12 px lisait mal) :
 * racine = « Défaut OpenCode » + une entrée par FOURNISSEUR, survol/clic
 * ouvre un sous-menu à côté (à gauche si la fenêtre manque à droite — le chip
 * vit au bord droit). Le champ de filtre APLATIT la liste tant qu'il est
 * rempli : navigation rapide dans un gros catalogue, cascade sinon. La saisie
 * libre `fournisseur/modèle` passe par ce même champ (action « Utiliser »).
 *
 * Sélection ASYNCHRONE : le switch passe par l'agent (`set_config_option`,
 * repli `set_model`) et peut être refusé — l'erreur s'affiche en place, le
 * menu reste ouvert.
 */
import { grouperParProvider, estIdModele, type ModeleDisponible } from "@/lib/agent/config-options";
import { getT, language } from "@/lib/i18n";

let {
  rect = null as DOMRect | null,
  value = null as string | null,
  labelDefaut = "",
  /** Liste déclarée par l'agent ; null = pas de liste disponible. */
  modeles = null as ModeleDisponible[] | null,
  triggerEl = null as HTMLElement | null,
  onSelect,
  onClose,
}: {
  rect?: DOMRect | null;
  /** Choix courant persisté — `null` = Défaut OpenCode. */
  value?: string | null;
  labelDefaut?: string;
  modeles?: ModeleDisponible[] | null;
  triggerEl?: HTMLElement | null;
  /** Renvoie null si le choix est appliqué, sinon le message d'erreur. */
  onSelect?: (id: string | null) => Promise<string | null>;
  onClose?: () => void;
} = $props();

let t = $derived(getT($language));

// Largeur/hauteur fixes du sous-menu : suffisent pour calculer son ancrage
// (bord droit de la fenêtre) sans mesurer après rendu.
const SUB_W = 264;
const SUB_MAX_H = 340;

let ref = $state<HTMLDivElement | null>(null);
let subRef = $state<HTMLDivElement | null>(null);
let pos = $state({ left: 8, top: 8 });
let subPos = $state({ left: -9999, top: 0 });
let requete = $state("");
let searchEl = $state<HTMLInputElement | null>(null);
let erreurInline = $state("");
// Sélection en vol : on grise les items pour éviter un double changement.
let enCours = $state<string | null>(null);
let providerOuvert = $state<string | null>(null);

/** Pas de liste déclarée par l'agent : menu réduit à la saisie libre. */
const listeIndisponible = $derived(modeles === null);

const filtres = $derived.by(() => {
  const base = modeles ?? [];
  const q = requete.trim().toLowerCase();
  if (!q) return base;
  return base.filter((m) => m.id.toLowerCase().includes(q));
});
const groupes = $derived(grouperParProvider(filtres));

/** Recherche active → liste APLATIE (tous fournisseurs confondus) : c'est le
 *  mode « je sais ce que je cherche ». Cascade seulement à champ vide. */
const plat = $derived(requete.trim().length > 0);
$effect(() => {
  if (plat) providerOuvert = null;
});

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

/** Ouvre le sous-menu d'un fournisseur, ancré à sa ligne. Côté droit d'abord ;
 *  le chip vit au bord droit de la fenêtre, on bascule à GAUCHE de la racine
 *  quand il n'y a pas la place — sinon le sous-menu sortirait de l'écran. */
function ouvrirProvider(e: MouseEvent, provider: string) {
  const ligne = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const racine = ref?.getBoundingClientRect();
  let left = (racine?.right ?? ligne.right) + 4;
  if (left + SUB_W > window.innerWidth - 8) {
    left = (racine?.left ?? ligne.left) - SUB_W - 4;
  }
  subPos = {
    left: Math.max(8, left),
    top: Math.max(8, Math.min(ligne.top - 4, window.innerHeight - SUB_MAX_H - 8)),
  };
  providerOuvert = provider;
}

/** Libellé d'un modèle dans le sous-menu : le slug après « provider/ » quand
 *  l'id a cette forme, sinon le nom fourni par l'agent, sinon l'id complet. */
function libelle(m: ModeleDisponible): string {
  const p = providerOuvert ?? "";
  if (p && m.id.startsWith(p + "/")) return m.id.slice(p.length + 1);
  return m.nom ?? m.id;
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    onClose?.();
    return;
  }
  if (e.key !== "Enter") return;
  e.preventDefault();
  // Entrée : la saisie libre prioritaire, sinon le premier modèle filtré.
  if (saisieLibre) void choisir(saisieLibre);
  else if (filtres.length > 0) void choisir(filtres[0].id);
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

// Ferme au clic hors des DEUX menus et hors du déclencheur (qui porte son
// propre toggle). Échap : ferme le sous-menu d'abord, la racine ensuite.
$effect(() => {
  const onDown = (e: MouseEvent) => {
    const cible = e.target as Node;
    if (ref?.contains(cible)) return;
    if (subRef?.contains(cible)) return;
    if (triggerEl?.contains(cible)) return;
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (document.activeElement === searchEl) return; // le champ a son handler
    e.preventDefault();
    if (providerOuvert) providerOuvert = null;
    else onClose?.();
  };
  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("keydown", onKey);
  };
});

// Focus du filtre à l'ouverture — chercher doit être immédiat.
$effect(() => {
  searchEl?.focus();
});
</script>

<div
  bind:this={ref}
  class="agent-model-menu"
  role="menu"
  aria-label={t("agent.model.label")}
  style="position:fixed;left:{pos.left}px;top:{pos.top}px"
>
  <input
    bind:this={searchEl}
    bind:value={requete}
    class="agent-model-menu__search"
    type="text"
    placeholder={t("agent.model.search")}
    spellcheck="false"
    onkeydown={onSearchKeydown}
  />

  {#if plat}
    <!-- Mode aplati : résultats tous fournisseurs confondus, identifiant complet. -->
    {#if filtres.length === 0 && !saisieLibre}
      <div class="agent-model-menu__note">{t("agent.model.aucun")}</div>
    {:else}
      {#each filtres as m (m.id)}
        <button
          type="button"
          role="menuitem"
          class="agent-model-menu__item agent-model-menu__item--mono"
          class:is-selected={m.id === value}
          disabled={enCours !== null}
          title={m.id}
          onclick={() => choisir(m.id)}
        >
          {m.id}
        </button>
      {/each}
    {/if}
    {#if saisieLibre}
      <button
        type="button"
        role="menuitem"
        class="agent-model-menu__item agent-model-menu__libre"
        disabled={enCours !== null}
        onclick={() => choisir(saisieLibre)}
      >
        {t("agent.model.useCustom", { id: saisieLibre })}
      </button>
    {/if}
  {:else}
    <!-- Mode cascade : défaut, puis un fournisseur par ligne. -->
    <button
      type="button"
      role="menuitem"
      class="agent-model-menu__item agent-model-menu__defaut"
      class:is-selected={value === null}
      disabled={enCours !== null}
      onclick={() => choisir(null)}
    >
      {labelDefaut}
    </button>

    <div class="agent-model-menu__divider" aria-hidden="true"></div>

    {#if listeIndisponible}
      <div class="agent-model-menu__note">{t("agent.model.indisponible")}</div>
    {:else if groupes.size === 0}
      <div class="agent-model-menu__note">{t("agent.model.aucun")}</div>
    {:else}
      {#each [...groupes] as [provider, liste] (provider)}
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={providerOuvert === provider}
          class="agent-model-menu__item agent-model-menu__provider"
          class:is-open={providerOuvert === provider}
          disabled={enCours !== null}
          onmouseenter={(e) => ouvrirProvider(e, provider)}
          onclick={(e) => ouvrirProvider(e, provider)}
        >
          <span class="agent-model-menu__provider-nom">{provider}</span>
          <span class="agent-model-menu__count">{liste.length}</span>
          <i class="wxi-chevron-right agent-model-menu__chevron" aria-hidden="true"></i>
        </button>
      {/each}
    {/if}
  {/if}

  {#if erreurInline}
    <div class="agent-model-menu__erreur">{erreurInline}</div>
  {/if}
</div>

{#if providerOuvert && !plat}
  <div
    bind:this={subRef}
    class="agent-model-menu agent-model-menu--sub"
    role="menu"
    aria-label={providerOuvert}
    style="position:fixed;left:{subPos.left}px;top:{subPos.top}px"
  >
    {#each groupes.get(providerOuvert) ?? [] as m (m.id)}
      <button
        type="button"
        role="menuitem"
        class="agent-model-menu__item agent-model-menu__modele"
        class:is-selected={m.id === value}
        disabled={enCours !== null}
        title={m.id}
        onclick={() => choisir(m.id)}
      >
        <span class="agent-model-menu__modele-nom">{libelle(m)}</span>
        {#if m.id === value}<i class="wxi-check agent-model-menu__check" aria-hidden="true"></i>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  /* Échelle des menus de l'app (context-menu.svelte) : items 12,5 px, padding
     5 px — la première version à 12 px/4 px lisait mal les identifiants. */
  .agent-model-menu {
    width: 230px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 6px);
    box-shadow:
      0 1px 0 color-mix(in srgb, white 4%, transparent) inset,
      0 10px 28px rgba(var(--shadow-color), 0.22),
      0 2px 8px rgba(var(--shadow-color), 0.08);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }
  .agent-model-menu--sub {
    width: 264px;
    max-height: 340px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--muted) 30%, transparent) transparent;
    z-index: 1001;
  }
  .agent-model-menu__search {
    margin: 0 1px 4px;
    padding: 6px 9px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 12.5px;
    color: var(--fg);
  }
  .agent-model-menu__search:focus {
    outline: none;
    border-color: var(--accent);
  }
  .agent-model-menu__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 10px;
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--font-ui, system-ui);
    font-size: 12.5px;
    color: var(--fg);
    text-align: left;
    white-space: nowrap;
  }
  .agent-model-menu__item:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }
  .agent-model-menu__item:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .agent-model-menu__item.is-selected {
    color: var(--accent);
  }
  .agent-model-menu__item--mono,
  .agent-model-menu__modele-nom {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agent-model-menu__defaut {
    font-weight: 500;
  }
  .agent-model-menu__divider {
    height: 1px;
    margin: 3px 6px;
    background: var(--border);
  }
  .agent-model-menu__provider {
    justify-content: space-between;
    font-weight: 500;
  }
  .agent-model-menu__provider.is-open {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }
  .agent-model-menu__provider-nom {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agent-model-menu__count {
    margin-left: auto;
    font-size: 10.5px;
    color: var(--muted);
    font-weight: 400;
  }
  .agent-model-menu__chevron {
    width: 12px;
    height: 12px;
    font-size: 12px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .agent-model-menu__modele {
    justify-content: space-between;
  }
  .agent-model-menu__check {
    width: 13px;
    height: 13px;
    font-size: 13px;
    color: var(--accent);
    flex-shrink: 0;
  }
  .agent-model-menu__libre {
    margin-top: 3px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
    color: var(--accent);
  }
  .agent-model-menu__note {
    padding: 8px 10px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .agent-model-menu__erreur {
    margin-top: 4px;
    padding: 6px 10px;
    border-top: 1px solid var(--border);
    font-size: 11.5px;
    color: var(--agent-del, #f85149);
    white-space: normal;
  }
</style>
