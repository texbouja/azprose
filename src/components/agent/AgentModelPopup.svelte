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
 * ACTIF vs DÉFAUT — deux gestes distincts (décision utilisateur 2026-08-22).
 * Auparavant confondus : cliquer une ligne persistait le choix, donc ESSAYER
 * un modèle changeait le défaut pour toujours, en silence.
 *   · clic sur la ligne → applique MAINTENANT, pour cette session ;
 *   · clic sur le PIN   → devient le défaut (persisté, prochaines sessions).
 * Le pin est un bouton RADIO, pas une case à cocher : cliquer le pin de
 * l'épinglé n'a aucun effet, il y a toujours au plus un défaut. L'ancienne
 * entrée « Défaut OpenCode » a disparu — ce n'était pas un modèle mais un
 * `choisir(null)` déguisé en ligne sélectionnable.
 *
 * Forme EN CASCADE à DEUX SECTIONS (retour d'usage + décision 2026-08-21) :
 * racine = section ACTIFS (fournisseurs connectés, liste
 * déclarée par l'agent via ACP) puis section CATALOGUE (les autres, voie
 * documentée `GET /provider` du serveur headless). Un fournisseur non
 * connecté s'ouvre comme les autres ; choisir un de ses modèles déclenche
 * `onSelectCatalogue` → le PANNEAU ouvre le dialogue de connexion (le menu se
 * ferme : le flux est modal). Le champ de filtre APLATIT les deux sections
 * tant qu'il est rempli. La saisie libre `fournisseur/modèle` passe par ce
 * même champ (action « Utiliser »).
 *
 * Sélection ASYNCHRONE : le switch passe par l'agent (`set_config_option`,
 * repli `set_model`) et peut être refusé — l'erreur s'affiche en place, le
 * menu reste ouvert.
 */
import { grouperParProvider, estIdModele, type ModeleDisponible } from "@/lib/agent/config-options";
import type { FournisseurCatalogue } from "@/lib/agent/catalogue";
import { getT, language } from "@/lib/i18n";

let {
  rect = null as DOMRect | null,
  value = null as string | null,
  /** Modèle ÉPINGLÉ (le défaut persisté) ; null = aucun, l'assistant suit
   *  alors le comportement par défaut ou configuré d'OpenCode. */
  pin = null as string | null,
  /** Liste déclarée par l'agent ; null = pas de liste disponible. */
  modeles = null as ModeleDisponible[] | null,
  /** Catalogue complet (`GET /provider`) déjà trié ET CURATÉ par le panneau
   *  (seuls les fournisseurs cochés en réglages, hors connectés) ; null =
   *  pas encore chargé. */
  catalogue = null as FournisseurCatalogue[] | null,
  /** Le chargement a échoué (serveur injoignable) → note dédiée. */
  catalogueIndisponible = false,
  /** Aucun fournisseur coché en réglages → la section vide oriente vers
   *  Réglages › Assistant IA › Fournisseurs plutôt que d'affirmer faux. */
  aucunCoche = false,
  triggerEl = null as HTMLElement | null,
  onSelect,
  onSelectCatalogue,
  onEpingler,
  onClose,
}: {
  rect?: DOMRect | null;
  /** Modèle ACTIF dans la session (ce que le chip montre). */
  value?: string | null;
  pin?: string | null;
  modeles?: ModeleDisponible[] | null;
  catalogue?: FournisseurCatalogue[] | null;
  catalogueIndisponible?: boolean;
  aucunCoche?: boolean;
  triggerEl?: HTMLElement | null;
  /** Renvoie null si le choix est appliqué, sinon le message d'erreur. */
  onSelect?: (id: string) => Promise<string | null>;
  /** Modèle d'un fournisseur NON connecté → dialogue de connexion (panneau). */
  onSelectCatalogue?: (id: string) => void;
  /** Épingle ce modèle comme défaut. Le menu reste OUVERT : épingler n'est
   *  pas choisir, l'utilisateur peut vouloir enchaîner sur un clic de ligne. */
  onEpingler?: (id: string) => void;
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
// Sous-menu ouvert : identifiant affiché + items + section d'origine
// (actifs → switch direct ; catalogue → dialogue de connexion).
let providerOuvert = $state<string | null>(null);
let sousMenu = $state<{ id: string; nom?: string }[]>([]);
let sousMenuCatalogue = $state(false);

/** Pas de liste déclarée par l'agent : menu réduit à la saisie libre. */
const listeIndisponible = $derived(modeles === null);

const filtres = $derived.by(() => {
  const base = modeles ?? [];
  const q = requete.trim().toLowerCase();
  // Recherche sur l'identifiant ET le nom : « alpha » doit trouver
  // « Ox Alpha Free (Unlimited) » même si l'id est x-preview-f-free.
  if (!q) return base;
  return base.filter(
    (m) => m.id.toLowerCase().includes(q) || (m.nom ?? "").toLowerCase().includes(q),
  );
});
const groupes = $derived(grouperParProvider(filtres));

/** Catalogue reçu du panneau, déjà curé (cochés en réglages, hors connectés
 *  qui sont dans la section actifs). Le garde `!connecte` reste par défense :
 *  l'état peut changer entre le filtrage panneau et l'ouverture du menu. */
const fournisseursCatalogue = $derived(
  (catalogue ?? []).filter((f) => !f.connecte && f.modeles.length > 0),
);

/** Mode aplati : le catalogue filtré aussi — un clic passe par
 *  onSelectCatalogue, qui sait retomber sur le choix normal si l'état a
 *  changé entre-temps (connexion faite par ailleurs). Recherche sur
 *  l'identifiant ET le nom du modèle (même motif que la section connectés). */
const cataloguePlat = $derived.by(() => {
  const q = requete.trim().toLowerCase();
  if (!q) return [];
  return fournisseursCatalogue
    .flatMap((f) => f.modeles)
    .filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.nom ?? "").toLowerCase().includes(q),
    );
});

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

async function choisir(id: string) {
  if (!onSelect || enCours !== null) return;
  erreurInline = "";
  enCours = id;
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

/** Épingle : sélection UNIQUE, pas une bascule — recliquer le pin de
 *  l'épinglé ne le dépingle pas (décision utilisateur 2026-08-22). Il y a
 *  donc toujours au plus un défaut, et on n'en sort que par un autre pin. */
function epingler(id: string) {
  if (!onEpingler || enCours !== null || id === pin) return;
  onEpingler(id);
}

/** Choix d'un modèle NON connecté : le panneau ouvre son dialogue de
 *  connexion — on ferme le menu, le flux est modal. */
function choisirCatalogue(id: string) {
  if (!onSelectCatalogue || enCours !== null) return;
  onSelectCatalogue(id);
  onClose?.();
}

/** Ouvre le sous-menu d'un fournisseur, ancré à sa ligne. Côté droit d'abord ;
 *  le chip vit au bord droit de la fenêtre, on bascule à GAUCHE de la racine
 *  quand il n'y a pas la place — sinon le sous-menu sortirait de l'écran.
 *  `items` portés par l'appelant : actifs (configOptions) OU catalogue. */
function ouvrirProvider(
  e: MouseEvent,
  provider: string,
  items: { id: string; nom?: string }[],
  duCatalogue = false,
) {
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
  sousMenu = items;
  sousMenuCatalogue = duCatalogue;
}

/** Libellé d'un modèle dans le sous-menu : le slug après « provider/ » quand
 *  l'id a cette forme, sinon le nom fourni (agent ou catalogue), sinon l'id. */
function libelle(m: { id: string; nom?: string }): string {
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
  // Entrée : saisie libre prioritaire, sinon premier actif filtré, sinon
  // premier modèle de catalogue filtré (→ connexion).
  if (saisieLibre) void choisir(saisieLibre);
  else if (filtres.length > 0) void choisir(filtres[0].id);
  else if (cataloguePlat.length > 0) choisirCatalogue(cataloguePlat[0].id);
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

{#snippet pinBtn(id: string)}
  <!-- Le pin fait le DÉFAUT, la ligne fait l'ACTIF. Toujours rendu (jamais
       seulement au survol) : une affordance invisible ne s'apprend pas. -->
  <button
    type="button"
    class="agent-model-menu__pin"
    class:is-pinned={id === pin}
    aria-pressed={id === pin}
    disabled={enCours !== null}
    title={id === pin ? t("agent.model.pinActuel") : t("agent.model.pin")}
    aria-label={id === pin ? t("agent.model.pinActuel") : t("agent.model.pin")}
    onclick={() => epingler(id)}
  >
    <i class={id === pin ? "wxi-pin" : "wxi-pin-outline"} aria-hidden="true"></i>
  </button>
{/snippet}

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
    <!-- Mode aplati : résultats des deux sections, identifiant complet.
         Les items de catalogue (non connectés) sont atténués et routent
         vers le dialogue de connexion via le panneau. -->
    {#if filtres.length === 0 && cataloguePlat.length === 0 && !saisieLibre}
      <div class="agent-model-menu__note">{t("agent.model.aucun")}</div>
    {:else}
      {#each filtres as m (m.id)}
        <div class="agent-model-menu__ligne">
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
          {@render pinBtn(m.id)}
        </div>
      {/each}
      {#each cataloguePlat as m (m.id)}
        <button
          type="button"
          role="menuitem"
          class="agent-model-menu__item agent-model-menu__item--mono agent-model-menu__item--cat"
          disabled={enCours !== null}
          title={m.id}
          onclick={() => choisirCatalogue(m.id)}
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
    <!-- Mode cascade : ACTIFS (connectés) puis CATALOGUE. Plus d'entrée
         « Défaut OpenCode » : le défaut est le modèle ÉPINGLÉ, et aucun pin
         signifie « suivre le comportement par défaut ou configuré
         d'OpenCode » — un état, pas une ligne de menu. -->
    {#if !listeIndisponible && groupes.size > 0}
      <div class="agent-model-menu__section">{t("agent.model.actifs")}</div>
      {#each [...groupes] as [provider, liste] (provider)}
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={providerOuvert === provider}
          class="agent-model-menu__item agent-model-menu__provider"
          class:is-open={providerOuvert === provider}
          disabled={enCours !== null}
          onmouseenter={(e) => ouvrirProvider(e, provider, liste)}
          onclick={(e) => ouvrirProvider(e, provider, liste)}
        >
          <span class="agent-model-menu__provider-nom">{provider}</span>
          <span class="agent-model-menu__count">{liste.length}</span>
          <i class="wxi-chevron-right agent-model-menu__chevron" aria-hidden="true"></i>
        </button>
      {/each}
    {:else if listeIndisponible}
      <div class="agent-model-menu__note">{t("agent.model.indisponible")}</div>
    {:else if groupes.size === 0}
      <div class="agent-model-menu__note">{t("agent.model.aucun")}</div>
    {/if}

    <!-- Catalogue : les fournisseurs cochés en réglages, hors connectés
         (curé par le panneau). null = pas encore chargé (chargement
         paresseux au 1er ouvert) ; [] avec erreur = tentative échouée. -->
    <div class="agent-model-menu__divider" aria-hidden="true"></div>
    <div class="agent-model-menu__section">{t("agent.model.catalogue")}</div>
    {#if catalogue === null}
      <div class="agent-model-menu__note">{t("agent.model.catalogueChargement")}</div>
    {:else if catalogueIndisponible}
      <div class="agent-model-menu__note">{t("agent.model.catalogueIndisponible")}</div>
    {:else if fournisseursCatalogue.length === 0}
      <div class="agent-model-menu__note">
        {aucunCoche ? t("agent.model.aucunCoche") : t("agent.model.aucunAutre")}
      </div>
    {:else}
      {#each fournisseursCatalogue as f (f.id)}
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={providerOuvert === f.id}
          class="agent-model-menu__item agent-model-menu__provider agent-model-menu__provider--cat"
          class:is-open={providerOuvert === f.id}
          disabled={enCours !== null}
          title={t("agent.connect.titre", { nom: f.nom })}
          onmouseenter={(e) => ouvrirProvider(e, f.id, f.modeles, true)}
          onclick={(e) => ouvrirProvider(e, f.id, f.modeles, true)}
        >
          <span class="agent-model-menu__provider-nom">{f.nom}</span>
          <span class="agent-model-menu__count">{f.modeles.length}</span>
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
    {#each sousMenu as m (m.id)}
      <div class="agent-model-menu__ligne">
        <button
          type="button"
          role="menuitem"
          class="agent-model-menu__item agent-model-menu__modele"
          class:is-selected={m.id === value}
          disabled={enCours !== null}
          title={m.id}
          onclick={() => (sousMenuCatalogue ? choisirCatalogue(m.id) : choisir(m.id))}
        >
          <span class="agent-model-menu__modele-nom">{libelle(m)}</span>
          {#if m.id === value}<i class="wxi-check agent-model-menu__check" aria-hidden="true"></i>{/if}
        </button>
        <!-- Pas de pin sur le catalogue : épingler un modèle d'un
             fournisseur non connecté produirait un défaut inapplicable. -->
        {#if !sousMenuCatalogue}{@render pinBtn(m.id)}{/if}
      </div>
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
  /* Ligne = modèle + pin. Le bouton de modèle prend toute la place restante ;
     le pin garde une largeur fixe pour que les icônes s'alignent. */
  .agent-model-menu__ligne {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .agent-model-menu__ligne .agent-model-menu__item {
    flex: 1;
    min-width: 0;
  }
  .agent-model-menu__pin {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: color-mix(in srgb, var(--muted) 55%, transparent);
    cursor: pointer;
    font-size: 12px;
  }
  .agent-model-menu__pin:hover:not(:disabled) {
    color: var(--fg);
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }
  /* L'épinglé est ACQUIS : plein, à l'accent, et son bouton n'a plus d'effet
     (sélection unique) — le curseur le dit. */
  .agent-model-menu__pin.is-pinned {
    color: var(--accent);
    cursor: default;
  }
  .agent-model-menu__pin.is-pinned:hover {
    background: transparent;
  }
  .agent-model-menu__pin:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .agent-model-menu__divider {
    height: 1px;
    margin: 3px 6px;
    background: var(--border);
  }
  /* Intitulé de section (Actifs / Catalogue) : petit, muet, non cliquable —
     même vocabulaire visuel que les menus de l'app. */
  .agent-model-menu__section {
    padding: 3px 10px 2px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  /* Items de catalogue (non connectés) : atténués mais lisibles ; au survol
     ils reprennent la teinte normale pour ne pas sembler désactivés. */
  .agent-model-menu__item--cat {
    color: var(--muted);
  }
  .agent-model-menu__item--cat:hover:not(:disabled) {
    color: var(--fg);
  }
  .agent-model-menu__provider--cat .agent-model-menu__provider-nom {
    color: var(--muted);
  }
  .agent-model-menu__provider--cat:hover:not(:disabled) .agent-model-menu__provider-nom,
  .agent-model-menu__provider--cat.is-open .agent-model-menu__provider-nom {
    color: var(--fg);
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
