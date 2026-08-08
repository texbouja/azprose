<script lang="ts">
  import type { Snippet } from "svelte";
  import { sidebarSections } from "@/stores/sidebar-sections.svelte";

  // NOTE : l'état persisté vit dans le store partagé `sidebar-sections.svelte.ts`
  // (importé ici ET par la vue hôte en mode accordéon).

  let {
    children,
    id = "",
    title = "",
    icon = "",
    badge = null as string | number | null,
    actions = null as Snippet | null,
    defaultCollapsed = false,
    /**
     * Mode CONTRÔLÉ (accordéon) : quand non-null, le parent fournit l'état de
     * repli et reçoit le clic via `onToggle` — le composant ne touche plus au
     * store persisté. Null (défaut) = mode autonome persisté.
     */
    collapsed = null as boolean | null,
    /** Rappel du clic sur le toggle en mode contrôlé. */
    onToggle = null as (() => void) | null,
  }: {
    children?: Snippet;
    id?: string;
    title?: string;
    icon?: string;
    badge?: string | number | null;
    /** Rendu dans la zone d'actions (à droite du titre, hors du bouton toggle,
     *  À GAUCHE du badge — « bouton puis nombre », pattern VSCode). */
    actions?: Snippet | null;
    defaultCollapsed?: boolean;
    collapsed?: boolean | null;
    onToggle?: (() => void) | null;
  } = $props();

  let isCollapsed = $derived(
    collapsed !== null ? collapsed : (sidebarSections.current[id] ?? defaultCollapsed),
  );

  function toggle() {
    if (collapsed !== null) {
      onToggle?.();
    } else {
      sidebarSections.update((rec) => ({ ...rec, [id]: !isCollapsed }));
    }
  }
</script>

<section
  class="mdv-sb-section"
  class:mdv-sb-section--open={!isCollapsed}
>
  <div class="mdv-sb-section__head">
    <button
      type="button"
      class="mdv-sb-section__toggle"
      onclick={toggle}
      aria-expanded={!isCollapsed}
      title={title}
    >
      <i class="wxi mdv-sb-section__chevron" class:wxi-chevron-down={!isCollapsed} class:wxi-chevron-right={isCollapsed} aria-hidden="true"></i>
      {#if icon}<i class="{icon} mdv-sb-section__icon" aria-hidden="true"></i>{/if}
      <span class="mdv-sb-section__title">{title}</span>
    </button>
    {#if actions}
      <div class="mdv-sb-section__actions">
        {@render actions()}
      </div>
    {/if}
    {#if badge != null}<span class="mdv-sb-section__badge">{badge}</span>{/if}
  </div>
  {#if !isCollapsed}
    <div class="mdv-sb-section__body">
      {@render children?.()}
    </div>
  {/if}
</section>

<style>
  /* Carte : la section se détache du fond de la sidebar (--bg) par un fond
     thémé (--surface) + un filet discret. L'en-tête et le corps partagent le
     même fond pour que la section forme un tout lisible.
     `min-height: 0` : indispensable pour que la section OUVERTE puisse
     rétrécir sous sa hauteur de contenu (voir --open) — sans lui, le défaut
     `min-height: auto` l'empêche de devenir un conteneur de scroll. */
  .mdv-sb-section {
    display: flex;
    flex-direction: column;
    flex: none;
    min-height: 0;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
    overflow: hidden;
  }
  /* Section OUVERTE (accordéon) : rétrécissable mais JAMAIS étirée —
     `flex: 0 1 auto` = hauteur NATURELLE quand le contenu tient, sinon
     rétrécit jusqu'à l'espace restant (les en-têtes des trois sections
     restent visibles) et le corps scrolle en interne. */
  .mdv-sb-section--open {
    flex: 0 1 auto;
  }
  .mdv-sb-section__head {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
    min-height: 26px;
    padding: 2px 6px 2px 4px;
  }
  .mdv-sb-section__head:hover {
    background: color-mix(in srgb, var(--fg) 5%, transparent);
  }
  .mdv-sb-section__toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    border: none;
    background: transparent;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
    color: var(--muted);
  }
  .mdv-sb-section__toggle:hover {
    color: var(--fg);
  }
  .mdv-sb-section__chevron {
    flex: none;
    font-size: 12px;
    transition: transform 0.12s ease;
  }
  .mdv-sb-section__icon {
    flex: none;
    font-size: 13px;
    color: var(--accent);
  }
  .mdv-sb-section__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .mdv-sb-section__badge {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    color: var(--bg);
    background: var(--accent);
    border-radius: 8px;
    padding: 2px 7px;
  }
  .mdv-sb-section__actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  /* Corps : `flex: 1 1 auto; min-height: 0` — quand la section rétrécit
     (--open + contenu trop long), le corps absorbe le déficit et scrolle en
     interne ; l'en-tête (flex: none) reste épinglé au-dessus. `auto` = aucun
     scrollbar tant que le contenu tient. `contain` : le geste de roulette ne
     se propage pas aux conteneurs parents. */
  .mdv-sb-section__body {
    padding: 2px 8px 8px;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(128, 128, 128, 0.35) transparent;
  }
  .mdv-sb-section__body::-webkit-scrollbar {
    width: 8px;
  }
  .mdv-sb-section__body::-webkit-scrollbar-track {
    background: transparent;
  }
  .mdv-sb-section__body::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.35);
    border-radius: 4px;
  }
  .mdv-sb-section__body::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 128, 0.6);
  }
</style>
