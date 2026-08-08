<script lang="ts">
  import { getT, language } from "@/lib/i18n";
  import SidebarSection from "@/components/sidebar/SidebarSection.svelte";
  import BacklinksPanel from "@/components/links/BacklinksPanel.svelte";
  import TagsPanel from "@/components/links/TagsPanel.svelte";
  import TocPanel from "@/components/links/TocPanel.svelte";
  import { sidebarSections } from "@/stores/sidebar-sections.svelte";

  let {
    filePath = null as string | null,
    source = "",
    rootPath = null as string | null,
  } = $props();

  let t = $derived(getT($language));

  // Référence au composant TOC pour piloter le mode « plan condensé » depuis le
  // bouton du header (pattern bind:this + export function, cf. Spreadsheet).
  let tocPanel: TocPanel;
  let tocOutlineActive = $state(false);

  function handleTocOutline() {
    tocOutlineActive = tocPanel?.toggleOutline() ?? false;
  }

  // Le mode est désactivé par TocPanel lors d'un changement de fichier : le
  // header doit refléter l'état réel (bouton non actif).
  function handleTocOutlineChange(active: boolean) {
    tocOutlineActive = active;
  }

  // État remonté par les panneaux (badge + désactivation du refresh pendant un
  // chargement). Callbacks stables (const du composant) : pas de re-render
  // parasite à chaque remontée.
  let tocTotal = $state(0);
  let backlinksTotal = $state(0);
  let backlinksLoading = $state(false);
  let tagsTotal = $state(0);
  let tagsLoading = $state(false);

  function handleTocState(s: { total: number; loading: boolean }) {
    tocTotal = s.total;
  }

  function handleBacklinksState(s: { total: number; loading: boolean }) {
    backlinksTotal = s.total;
    backlinksLoading = s.loading;
  }

  function handleTagsState(s: { total: number; loading: boolean }) {
    tagsTotal = s.total;
    tagsLoading = s.loading;
  }

  // ===== Accordéon (une seule section dépliée à la fois) =====
  // Les sections passent en mode CONTRÔLÉ : la vue décide quelle section est
  // ouverte et réécrit l'état persisté (une seule entrée false à la fois).
  // L'état initial respecte la persistance (première section non repliée).

  const SECTION_ORDER = ["toc", "backlinks", "tags"] as const;

  function initialOpenId(): string | null {
    const rec = sidebarSections.current;
    for (const id of SECTION_ORDER) {
      // Défaut : déplié (le store ne contient la clé que si elle a été repliée).
      if (!(rec[id] ?? false)) return id;
    }
    return null;
  }

  let openId = $state<string | null>(initialOpenId());

  function handleToggle(id: string) {
    openId = openId === id ? null : id;
    // Si la section TOC se ferme, le mode condensé n'a plus de panneau pour
    // l'appliquer : on le désactive pour que l'état du bouton reste honnête à
    // la réouverture (TocPanel est démonté — bind:this remis à null).
    if (openId !== "toc") tocOutlineActive = false;
    const rec: Record<string, boolean> = {};
    for (const s of SECTION_ORDER) rec[s] = s !== openId;
    sidebarSections.update((cur) => ({ ...cur, ...rec }));
  }

  // Rechargement : les panneaux s'abonnent à azprose:links-refresh (même canal
  // que le refresh post-sauvegarde de app.svelte). Ce conteneur ne fait que
  // l'UI des sections (badge + boutons), l'état vient de onStateChange.
  // Un refresh de section recharge TOUTE la vue (backlinks + tags).
  function refresh() {
    window.dispatchEvent(new CustomEvent("azprose:links-refresh"));
  }
</script>

<div class="blv">
  <SidebarSection
    id="toc"
    icon="wxi-list"
    title={t("toc.title")}
    badge={tocTotal > 0 ? tocTotal : null}
    collapsed={openId !== "toc"}
    onToggle={() => handleToggle("toc")}
    actions={openId === "toc" ? tocOutlineAction : null}
  >
    <TocPanel
      {filePath}
      {source}
      {rootPath}
      onStateChange={handleTocState}
      onOutlineChange={handleTocOutlineChange}
      bind:this={tocPanel}
    />
  </SidebarSection>

  <SidebarSection
    id="backlinks"
    icon="wxi-link"
    title={t("backlinks.title")}
    badge={backlinksTotal > 0 ? backlinksTotal : null}
    collapsed={openId !== "backlinks"}
    onToggle={() => handleToggle("backlinks")}
    actions={backlinksRefreshAction}
  >
    <BacklinksPanel
      {filePath}
      onStateChange={handleBacklinksState}
    />
  </SidebarSection>

  <SidebarSection
    id="tags"
    icon="wxi-tag"
    title={t("tags.title")}
    badge={tagsTotal > 0 ? tagsTotal : null}
    collapsed={openId !== "tags"}
    onToggle={() => handleToggle("tags")}
    actions={tagsRefreshAction}
  >
    <TagsPanel onStateChange={handleTagsState} />
  </SidebarSection>
</div>

{#snippet backlinksRefreshAction()}
  <button
    type="button"
    class="blv__icon-btn"
    onclick={refresh}
    aria-label={t("backlinks.refresh")}
    title={t("backlinks.refresh")}
    disabled={backlinksLoading}
  >
    <i class="wxi wxi-refresh" aria-hidden="true"></i>
  </button>
{/snippet}

{#snippet tocOutlineAction()}
  <button
    type="button"
    class="blv__icon-btn"
    class:is-active={tocOutlineActive}
    onclick={handleTocOutline}
    aria-pressed={tocOutlineActive}
    aria-label={t("toc.collapseBelowH2")}
    title={t("toc.collapseBelowH2")}
  >
    <!-- Chevrons up/down = « replier au-delà de H2 » ; inversés (down/up) quand
         le mode condensé est actif — le plan repassera à tous les niveaux. -->
    <i
      class="wxi {tocOutlineActive ? "wxi-chevrons-down-up" : "wxi-chevrons-up-down"}"
      aria-hidden="true"
    ></i>
  </button>
{/snippet}

{#snippet tagsRefreshAction()}
  <button
    type="button"
    class="blv__icon-btn"
    onclick={refresh}
    aria-label={t("tags.refresh")}
    title={t("tags.refresh")}
    disabled={tagsLoading}
  >
    <i class="wxi wxi-refresh" aria-hidden="true"></i>
  </button>
{/snippet}

<style>
  .blv {
    /* Vue scrollable : les sections (cartes) s'empilent et la vue scrolle dans
       son ensemble (pattern VSCode). Espacement entre cartes + marges latérales. */
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 6px 8px;
  }
  .blv__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .blv__icon-btn:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }
  /* État pressé du mode « plan condensé » : les chevrons wxi-chevrons-down-up
     (inversés) restent accentués tant que seuls H1/H2 sont visibles. */
  .blv__icon-btn.is-active {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }
  .blv__icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
