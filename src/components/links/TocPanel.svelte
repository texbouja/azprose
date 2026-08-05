<script lang="ts">
  import { getT, language } from "@/lib/i18n";
  import { extFromPath } from "@/lib/editor-languages";
  import { parseMarkdownToc, type TocEntry } from "@/lib/markdown-toc";

  let {
    /** Fichier actif du panneau main (null si aucun). */
    filePath = null as string | null,
    /** Contenu LIVE du buffer actif (reflète les frappes non sauvegardées). */
    source = "" as string,
    /** Remontée de l'état pour le header de section (badge). */
    onStateChange = null as ((s: { total: number; loading: boolean }) => void) | null,
  } = $props();

  let t = $derived(getT($language));

  // Parsing local et synchrone : le plan reflète l'éditeur en continu (le
  // serveur LSP indexe le disque, pas le buffer — inutilisable ici).
  let entries = $derived(
    filePath && extFromPath(filePath) === "md" ? parseMarkdownToc(source ?? "") : [],
  );
  let total = $derived(entries.length);

  // Indentation relative au premier titre (h4 en tête → profondeur 0).
  let minLevel = $derived(
    entries.length > 0 ? Math.min(...entries.map((e) => e.level)) : 1,
  );

  $effect(() => {
    onStateChange?.({ total, loading: false });
  });

  function navigate(entry: TocEntry) {
    if (!filePath) return;
    window.dispatchEvent(
      new CustomEvent("azprose:jump-to-file", {
        // line = 1-based source line (editor jump); heading = raw text for the
        // id-based preview scroll (immune to transclusion line shifts).
        detail: { path: filePath, line: entry.line, heading: entry.text },
      }),
    );
  }
</script>

<div class="toc">
  {#if !filePath || extFromPath(filePath) !== "md"}
    <div class="toc__state">
      <p>{t("toc.noNote")}</p>
    </div>
  {:else if entries.length === 0}
    <div class="toc__state">
      <p>{t("toc.empty")}</p>
    </div>
  {:else}
    <ul class="toc__list">
      {#each entries as entry (entry.line)}
        <li>
          <button
            type="button"
            class="toc__item"
            style:padding-left={8 + (entry.level - minLevel) * 14 + "px"}
            onclick={() => navigate(entry)}
            title={entry.text}
          >
            <span class="toc__text">{entry.text}</span>
            <span class="toc__line">L{entry.line}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .toc {
    /* Corps pur — le header de section (titre, badge, actions) vit dans la
       SidebarSection hôte. */
    min-height: 0;
  }
  .toc__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 8px;
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  .toc__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .toc__item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 3px 8px;
    border: none;
    background: transparent;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
  }
  .toc__item:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .toc__text {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toc__line {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
