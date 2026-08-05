<script lang="ts">
  import { getT, language } from "@/lib/i18n";
  import { basename } from "@/lib/paths-utils";
  import { getRootPath } from "@/stores/root-path.svelte";
  import { requestMarkdownOxide } from "@/lib/lsp/markdown-oxide";
  import {
    fetchVaultTags,
    sortTagsByFrequency,
    type TagEntry,
    type TagNote,
  } from "@/lib/lsp/tags";

  let {
    /** Remontée de l'état pour le header de section (badge + désactivation refresh). */
    onStateChange = null as ((s: { total: number; loading: boolean }) => void) | null,
  } = $props();

  let t = $derived(getT($language));

  let tags = $state<TagEntry[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // ===== Filtrage =====
  let query = $state("");
  let inputFocused = $state(false);
  /** Index de la suggestion active dans le menu de complétion. */
  let highlight = $state(0);

  // ===== Sous-sections consultées (empilées) =====
  let stacked = $state<TagEntry[]>([]);

  /** Liste tronquée : les tags les plus référencés, le reste via le filtrage. */
  const TOP_TAGS = 12;
  /** Plafond des résultats filtrés (projet à « mille et un tags »). */
  const MAX_RESULTS = 100;
  /** Nombre de suggestions du menu de complétion. */
  const SUGGESTIONS = 8;

  let total = $derived(tags.length);
  let sorted = $derived(sortTagsByFrequency(tags));

  let q = $derived(query.trim().toLowerCase());
  let filtered = $derived(q ? sorted.filter((e) => e.tag.toLowerCase().includes(q)) : []);
  /** Tags affichés : tous les matchs pendant un filtrage, sinon le top N. */
  let visible = $derived(q ? filtered.slice(0, MAX_RESULTS) : sorted.slice(0, TOP_TAGS));
  let hiddenCount = $derived(q ? filtered.length - visible.length : 0);
  /** Suggestions de complétion (menu déroulant sous le champ). */
  let suggestions = $derived(q ? filtered.slice(0, SUGGESTIONS) : []);

  function isConsulted(tag: string): boolean {
    return stacked.some((e) => e.tag === tag);
  }

  /** Jeton anti-course : seul le chargement le plus récent applique son résultat. */
  let loadToken = 0;

  // Remonte l'état vers le conteneur (badge de section, désactivation du refresh).
  $effect(() => {
    onStateChange?.({ total, loading });
  });

  async function load() {
    const token = ++loadToken;
    loading = true;
    error = null;
    try {
      const result = await fetchVaultTags(requestMarkdownOxide);
      if (token !== loadToken) return;
      tags = result;
      // Rafraîchit les sous-sections consultées : ne garde que les tags encore
      // présents, en réattachant les entrées à jour.
      stacked = stacked
        .map((s) => result.find((r) => r.tag === s.tag))
        .filter((e): e is TagEntry => e !== undefined);
    } catch (e) {
      if (token !== loadToken) return;
      console.error("[tags]", e);
      error = e instanceof Error ? e.message : String(e);
      tags = [];
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  // Chargement au premier montage (les tags sont globaux au vault, pas liés à
  // la note active).
  $effect(() => {
    void load();
  });

  // Recharge après une sauvegarde (même canal que les backlinks — l'index du
  // serveur est rafraîchi par app.svelte AVANT l'événement).
  $effect(() => {
    const onRefresh = () => void load();
    window.addEventListener("azprose:links-refresh", onRefresh);
    return () => window.removeEventListener("azprose:links-refresh", onRefresh);
  });

  // Le curseur de complétion repart en tête dès que la requête change.
  $effect(() => {
    void q;
    highlight = 0;
  });

  // ===== Interactions =====
  function toggleConsulted(entry: TagEntry) {
    stacked = isConsulted(entry.tag)
      ? stacked.filter((e) => e.tag !== entry.tag)
      : [...stacked, entry];
  }

  /** Bouton recycle : ferme toutes les sous-sections. */
  function clearStack() {
    stacked = [];
  }

  function removeConsulted(tag: string) {
    stacked = stacked.filter((e) => e.tag !== tag);
  }

  function clearQuery() {
    query = "";
  }

  function pickSuggestion(tag: string) {
    query = tag;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (query) {
        query = "";
      } else {
        (e.target as HTMLInputElement).blur();
      }
      return;
    }
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight = (highlight + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight = (highlight - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[highlight];
      if (s) pickSuggestion(s.tag);
    }
  }

  function relPath(p: string): string {
    const root = getRootPath();
    if (!root) return p;
    return p.startsWith(root + "/") ? p.slice(root.length + 1) : p;
  }

  function navigate(note: TagNote) {
    window.dispatchEvent(
      new CustomEvent("azprose:jump-to-file", { detail: { path: note.path, line: note.line } }),
    );
  }
</script>

<div class="tgp">
  {#if error}
    <div class="tgp__state tgp__state--error">
      <p>{t("tags.error")}</p>
      <p class="tgp__hint">{t("tags.serverHint")}</p>
      <button type="button" class="tgp__retry" onclick={() => void load()}>{t("tags.retry")}</button>
    </div>
  {:else if loading && tags.length === 0}
    <div class="tgp__state">
      <p>{t("tags.loading")}</p>
    </div>
  {:else if tags.length === 0}
    <div class="tgp__state">
      <p>{t("tags.empty")}</p>
    </div>
  {:else}
    <!-- Barre d'outils : filtre avec complétion + recycle des sous-sections. -->
    <div class="tgp__toolbar">
      <div class="tgp__field">
        <i class="wxi wxi-search tgp__search" aria-hidden="true"></i>
        <input
          type="text"
          class="tgp__filter"
          placeholder={t("tags.filterPlaceholder")}
          aria-label={t("tags.filterAria")}
          aria-autocomplete="list"
          role="combobox"
          aria-expanded={inputFocused && suggestions.length > 0}
          aria-controls="tgp-completion"
          aria-activedescendant={inputFocused && suggestions.length > 0 ? "tgp-sug-" + highlight : undefined}
          value={query}
          oninput={(e) => (query = e.currentTarget.value)}
          onfocus={() => (inputFocused = true)}
          onblur={() => (inputFocused = false)}
          onkeydown={onKeydown}
        />
        {#if query}
          <button type="button" class="tgp__clear" onclick={clearQuery} aria-label={t("tags.clearQuery")} title={t("tags.clearQuery")}>
            <i class="wxi wxi-x" aria-hidden="true"></i>
          </button>
        {/if}
        {#if inputFocused && suggestions.length > 0}
          <div id="tgp-completion" class="tgp__completion" role="listbox" tabindex="-1"
            onmousedown={(e) => e.preventDefault()}
          >
            {#each suggestions as entry, i (entry.tag)}
              <button
                type="button"
                id={"tgp-sug-" + i}
                role="option"
                aria-selected={i === highlight}
                class="tgp__completion-item"
                class:tgp__completion-item--active={i === highlight}
                onclick={() => pickSuggestion(entry.tag)}
              >
                <span class="tgp__completion-name">#{entry.tag}</span>
                <span class="tgp__completion-count">{entry.notes.length}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="tgp__recycle"
        onclick={clearStack}
        disabled={stacked.length === 0}
        aria-label={t("tags.recycle")}
        title={t("tags.recycle")}
      >
        <i class="wxi wxi-rotate-ccw" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Sous-sections consultées (empilées dans l'ordre des clics). -->
    {#if stacked.length > 0}
      <div class="tgp__stack" aria-label={t("tags.consulted")}>
        {#each stacked as entry (entry.tag)}
          <section class="tgp__sub">
            <header class="tgp__sub-head">
              <span class="tgp__sub-name">#{entry.tag}</span>
              <span class="tgp__sub-count">{entry.notes.length}</span>
              <button
                type="button"
                class="tgp__sub-remove"
                onclick={() => removeConsulted(entry.tag)}
                aria-label={t("tags.remove")}
                title={t("tags.remove")}
              >
                <i class="wxi wxi-x" aria-hidden="true"></i>
              </button>
            </header>
            <ul class="tgp__sub-notes">
              {#each entry.notes as note (entry.tag + ":" + note.path)}
                <li>
                  <button type="button" class="tgp__sub-note" onclick={() => navigate(note)}>
                    <span class="tgp__sub-note-name">{basename(note.path)}</span>
                    <span class="tgp__sub-note-path">{relPath(note.path)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {/if}

    <!-- Liste des tags : boutons avec nombre de références. -->
    {#if visible.length === 0}
      <div class="tgp__state">
        <p>{t("tags.noMatch", { q: query.trim() })}</p>
      </div>
    {:else}
      <ul class="tgp__list">
        {#each visible as entry (entry.tag)}
          <li>
            <button
              type="button"
              class="tgp__tag-head"
              class:tgp__tag-head--open={isConsulted(entry.tag)}
              onclick={() => toggleConsulted(entry)}
              aria-expanded={isConsulted(entry.tag)}
              title={`#${entry.tag} (${entry.notes.length})`}
            >
              <i
                class="wxi tgp__chevron"
                class:wxi-chevron-down={isConsulted(entry.tag)}
                class:wxi-chevron-right={!isConsulted(entry.tag)}
                aria-hidden="true"
              ></i>
              <span class="tgp__tag-name">#{entry.tag}</span>
              <span class="tgp__tag-count">{entry.notes.length}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if hiddenCount > 0}
        <p class="tgp__hint tgp__hint--more">{t("tags.more", { n: hiddenCount })}</p>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .tgp {
    /* Corps pur — le header de section (titre, badge, actions) vit dans la
       SidebarSection hôte. */
    min-height: 0;
  }
  .tgp__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 8px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  .tgp__state--error p:first-child {
    color: var(--color-error, #e5484d);
    font-weight: 600;
  }
  .tgp__hint {
    font-size: 11px;
    line-height: 1.5;
    margin: 0;
  }
  .tgp__hint--more {
    padding: 4px 8px;
    text-align: center;
  }
  .tgp__retry {
    margin-top: 2px;
    padding: 4px 14px;
    border: none;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .tgp__retry:hover {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }

  /* ===== Barre d'outils : filtre + recycle ===== */
  .tgp__toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .tgp__field {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .tgp__search {
    position: absolute;
    left: 7px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 13px;
    color: var(--muted);
    pointer-events: none;
  }
  .tgp__filter {
    width: 100%;
    height: 26px;
    padding: 0 22px 0 24px;
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
    font-size: 12px;
    outline: none;
  }
  .tgp__filter::placeholder {
    color: var(--muted);
  }
  .tgp__filter:focus {
    border-color: var(--accent);
  }
  .tgp__clear {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .tgp__clear:hover {
    background: var(--surface-hover);
    color: var(--fg);
  }
  .tgp__completion {
    position: absolute;
    top: calc(100% + 3px);
    left: 0;
    right: 0;
    z-index: 10;
    max-height: 180px;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    padding: 2px;
  }
  .tgp__completion-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 8px;
    border: none;
    background: transparent;
    border-radius: 3px;
    text-align: left;
    cursor: pointer;
  }
  .tgp__completion-item:hover,
  .tgp__completion-item--active {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .tgp__completion-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tgp__completion-count {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
  }
  .tgp__recycle {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    border-radius: 4px;
    background: var(--bg);
    color: var(--muted);
    cursor: pointer;
  }
  .tgp__recycle:hover:not(:disabled) {
    color: var(--fg);
    background: var(--surface-hover);
  }
  .tgp__recycle:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* ===== Sous-sections consultées (empilées) ===== */
  .tgp__stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }
  .tgp__sub {
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .tgp__sub-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px 3px 8px;
    background: color-mix(in srgb, var(--fg) 5%, transparent);
  }
  .tgp__sub-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tgp__sub-count {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    border-radius: 8px;
    padding: 1px 7px;
  }
  .tgp__sub-remove {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .tgp__sub-remove:hover {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    color: var(--fg);
  }
  .tgp__sub-notes {
    list-style: none;
    margin: 0;
    padding: 2px 0 4px;
  }
  .tgp__sub-note {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 3px 8px 3px 12px;
    border: none;
    background: transparent;
    border-radius: 3px;
    text-align: left;
    cursor: pointer;
  }
  .tgp__sub-note:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .tgp__sub-note-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tgp__sub-note-path {
    flex: none;
    font-size: 10px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 60%;
  }

  /* ===== Liste des tags ===== */
  .tgp__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tgp__tag-head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 6px;
    border: none;
    background: transparent;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
    color: var(--fg);
  }
  .tgp__tag-head:hover {
    background: var(--surface-hover);
  }
  .tgp__tag-head--open {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .tgp__chevron {
    flex: none;
    font-size: 12px;
    color: var(--muted);
    transition: transform 0.12s ease;
  }
  .tgp__tag-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tgp__tag-count {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    border-radius: 8px;
    padding: 1px 7px;
    font-variant-numeric: tabular-nums;
  }
</style>
