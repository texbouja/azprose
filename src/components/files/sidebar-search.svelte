<script lang="ts">
import { dirname, walkSupportedTextFiles, type FlatFileEntry } from "@/lib";

const MAX_RESULTS = 80;

let {
  rootPath,
  query,
  activePath,
  treeVersion = 0,
  onSelect,
}: {
  rootPath: string;
  query: string;
  activePath: string | null;
  treeVersion?: number;
  onSelect: (path: string) => void;
} = $props();

let index = $state<FlatFileEntry[] | null>(null);

$effect(() => {
  let cancelled = false;
  index = null;
  walkSupportedTextFiles(rootPath)
    .then((items) => {
      if (!cancelled) index = items;
    })
    .catch(() => {
      if (!cancelled) index = [];
    });
  return () => { cancelled = true; };
});

let results = $derived.by(() => {
  if (!index) return null;
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: FlatFileEntry[] = [];
  for (const e of index) {
    if (e.rel.toLowerCase().includes(q)) {
      out.push(e);
      if (out.length >= MAX_RESULTS) break;
    }
  }
  return out;
});
</script>

{#if !index}
  <div class="mdv-tree__loading">indexing…</div>
{:else if results && results.length === 0}
  <div class="mdv-tree__empty">no matches</div>
{:else}
  <ul class="mdv-search-results" role="listbox">
    {#each results as r (r.path)}
      <li>
        <button
          type="button"
          class="mdv-search-result{r.path === activePath ? ' is-active' : ''}"
          title={r.path}
          onclick={() => onSelect(r.path)}
        >
          <span class="mdv-search-result__name">{r.name}</span>
          {#if dirname(r.rel) && dirname(r.rel) !== "/"}
            <span class="mdv-search-result__dir">{dirname(r.rel)}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}
