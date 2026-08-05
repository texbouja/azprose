<script lang="ts">
  import { readText } from "@/lib/files";
  import { basename } from "@/lib/paths-utils";
  import { getT, language } from "@/lib/i18n";
  import { getRootPath } from "@/stores/root-path.svelte";
  import { requestMarkdownOxide } from "@/lib/lsp/markdown-oxide";
  import { fetchBacklinks, groupBacklinks, type BacklinkRef } from "@/lib/lsp/backlinks";

  let {
    filePath = null as string | null,
    /** Remontée de l'état pour le header de section (badge + désactivation refresh). */
    onStateChange = null as ((s: { total: number; loading: boolean }) => void) | null,
  } = $props();

  let t = $derived(getT($language));

  let refs = $state<BacklinkRef[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let linesCache = $state<Map<string, string[]>>(new Map());

  let groups = $derived(groupBacklinks(refs));
  let total = $derived(refs.length);

  /** Jeton anti-course : seul le chargement le plus récent applique son résultat. */
  let loadToken = 0;

  // Remonte l'état vers le conteneur (badge de section, désactivation du refresh).
  $effect(() => {
    onStateChange?.({ total, loading });
  });

  /** Lit les lignes des fichiers référençants (contexte d'affichage, best-effort). */
  async function loadContextLines(result: BacklinkRef[]) {
    const cache = new Map(linesCache);
    const unique = new Set(result.map((r) => r.path));
    for (const p of unique) {
      if (cache.has(p)) continue;
      try {
        cache.set(p, (await readText(p)).split("\n"));
      } catch {
        cache.set(p, []);
      }
    }
    linesCache = cache;
  }

  async function load(target: string | null = filePath) {
    const token = ++loadToken;
    if (!target) {
      refs = [];
      error = null;
      loading = false;
      return;
    }
    loading = true;
    error = null;
    try {
      const result = await fetchBacklinks(target, requestMarkdownOxide);
      if (token !== loadToken) return;
      refs = result;
      await loadContextLines(result);
    } catch (e) {
      if (token !== loadToken) return;
      console.error("[backlinks]", e);
      error = e instanceof Error ? e.message : String(e);
      refs = [];
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  // Recharge au changement de note active (et au premier montage).
  $effect(() => {
    void load(filePath);
  });

  // Recharge après une sauvegarde (l'index vault du serveur est rafraîchi par
  // app.svelte via notifyMarkdownOxideFileChanged AVANT cet événement).
  $effect(() => {
    const onRefresh = () => void load();
    window.addEventListener("azprose:links-refresh", onRefresh);
    return () => window.removeEventListener("azprose:links-refresh", onRefresh);
  });

  function relPath(p: string): string {
    const root = getRootPath();
    if (!root) return p;
    return p.startsWith(root + "/") ? p.slice(root.length + 1) : p;
  }

  function contextLine(path: string, line1: number): string | null {
    const lines = linesCache.get(path);
    if (!lines) return null;
    const raw = lines[line1 - 1] ?? "";
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.length > 140 ? trimmed.slice(0, 139) + "…" : trimmed;
  }

  function navigate(ref: BacklinkRef) {
    window.dispatchEvent(
      new CustomEvent("azprose:jump-to-file", { detail: { path: ref.path, line: ref.line } }),
    );
  }

  function navigateGroup(group: { path: string; refs: BacklinkRef[] }) {
    const first = group.refs[0];
    if (first) navigate(first);
  }
</script>

<div class="blp">
  {#if !filePath}
    <div class="blp__state">
      <p>{t("backlinks.noNote")}</p>
    </div>
  {:else if error}
    <div class="blp__state blp__state--error">
      <p>{t("backlinks.error")}</p>
      <p class="blp__hint">{t("backlinks.serverHint")}</p>
      <button type="button" class="blp__retry" onclick={() => void load()}>{t("backlinks.retry")}</button>
    </div>
  {:else if loading && refs.length === 0}
    <div class="blp__state">
      <p>{t("backlinks.loading")}</p>
    </div>
  {:else if groups.length === 0}
    <div class="blp__state">
      <p>{t("backlinks.empty")}</p>
    </div>
  {:else}
    <div class="blp__groups">
      {#each groups as group (group.path)}
        <section class="blp__group">
          <button type="button" class="blp__file" onclick={() => navigateGroup(group)}>
            <span class="blp__file-name">{basename(group.path)}</span>
            <span class="blp__file-count">{group.refs.length}</span>
          </button>
          <div class="blp__file-path">{relPath(group.path)}</div>
          <ul class="blp__refs">
            {#each group.refs as ref (group.path + ":" + ref.line)}
              <li>
                <button type="button" class="blp__ref" onclick={() => navigate(ref)}>
                  <span class="blp__ref-line">L{ref.line}</span>
                  <span class="blp__ref-text">{contextLine(group.path, ref.line) ?? t("backlinks.noContext")}</span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .blp {
    /* Corps pur — le header de section (titre, badge, actions) vit dans la
       SidebarSection hôte. */
    min-height: 0;
  }
  .blp__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 8px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  .blp__state--error p:first-child {
    color: var(--color-error, #e5484d);
    font-weight: 600;
  }
  .blp__hint {
    font-size: 11px;
    line-height: 1.5;
  }
  .blp__retry {
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
  .blp__retry:hover {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .blp__groups {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .blp__group {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface);
  }
  .blp__file {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .blp__file:hover {
    background: var(--surface-hover);
  }
  .blp__file-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .blp__file-count {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    border-radius: 8px;
    padding: 1px 7px;
  }
  .blp__file-path {
    padding: 0 8px 4px;
    font-size: 10px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .blp__refs {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--border);
  }
  .blp__refs li + li {
    border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  .blp__ref {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 4px 8px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .blp__ref:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .blp__ref-line {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .blp__ref-text {
    font-size: 11px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
