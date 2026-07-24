<script lang="ts">
import { ChevronRight, Folder, FolderOpen, FileText } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import { joinPath } from "@/lib";

let {
  noteDates,
  rootPath,
  activePath,
  onSelect,
  scrollToPath,
}: {
  noteDates: Set<string>;
  rootPath: string | null;
  activePath: string | null;
  onSelect: (path: string) => void;
  scrollToPath: string | null;
} = $props();

const MONTH_LABELS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

interface FileNode {
  name: string;
  path: string;
  date: string;
}

interface MonthFolder {
  key: string;
  label: string;
  path: string;
  files: FileNode[];
}

interface YearFolder {
  key: string;
  label: string;
  path: string;
  months: MonthFolder[];
}

function buildTree(dates: Set<string>, root: string | null): YearFolder[] {
  if (!root || dates.size === 0) return [];

  const years = new Map<string, Map<string, FileNode[]>>();

  for (const date of dates) {
    const [y, m, d] = date.split("-");
    if (!y || !m || !d) continue;
    if (!years.has(y)) years.set(y, new Map());
    const months = years.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push({
      name: `${date}.md`,
      path: joinPath(root, `${date}.md`),
      date,
    });
  }

  const result: YearFolder[] = [];
  for (const [y, months] of [...years.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const monthFolders: MonthFolder[] = [];
    for (const [m, files] of [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      const monthIdx = parseInt(m, 10) - 1;
      monthFolders.push({
        key: m,
        label: MONTH_LABELS[monthIdx] ?? m,
        path: joinPath(joinPath(root, y), m),
        files: files.sort((a, b) => a.date.localeCompare(b.date)),
      });
    }
    result.push({
      key: y,
      label: y,
      path: joinPath(root, y),
      months: monthFolders,
    });
  }
  return result;
}

let tree = $derived(buildTree(noteDates, rootPath));

// Plain object for open state — avoids Set proxy reactivity issues in Svelte 5
let open: Record<string, boolean> = $state({});

function toggleFolder(path: string) {
  open[path] = !open[path];
}

// Auto-open all year + month folders when tree changes
let prevTreeKey = "";
$effect(() => {
  const key = tree.map((y) => y.key + ":" + y.months.map((m) => m.key).join(",")).join("|");
  if (key === prevTreeKey) return;
  prevTreeKey = key;
  const next: Record<string, boolean> = {};
  for (const y of tree) {
    next[y.path] = true;
    for (const m of y.months) {
      next[m.path] = true;
    }
  }
  open = next;
});

let containerEl: HTMLDivElement;

$effect(() => {
  if (!scrollToPath) return;
  const filename = scrollToPath.split("/").pop()?.replace(/\.md$/i, "") ?? "";
  const match = filename.match(/^(\d{4})-(\d{2})/);
  if (!match || !rootPath) return;
  const [, y, m] = match;
  open[joinPath(rootPath, y)] = true;
  open[joinPath(joinPath(rootPath, y), m)] = true;
  requestAnimationFrame(() => {
    const el = containerEl?.querySelector(`[data-path="${CSS.escape(scrollToPath!)}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
});
</script>

<div class="mdv-vtree" bind:this={containerEl}>
  {#if tree.length === 0}
    <div class="mdv-tree__empty">no notes yet</div>
  {:else}
    <ul class="mdv-tree" role="tree">
      {#each tree as year (year.key)}
        <li class="mdv-tree__item" role="treeitem" aria-expanded={!!open[year.path]}>
          <button
            type="button"
            class="mdv-tree__row mdv-tree__row--folder"
            onclick={() => toggleFolder(year.path)}
          >
            <span class="mdv-tree__chevron{open[year.path] ? ' is-open' : ''}">
              <Icon icon={ChevronRight} size={12} strokeWidth={2} />
            </span>
            <span class="mdv-tree__icon">
              <Icon icon={open[year.path] ? FolderOpen : Folder} size={13} strokeWidth={1.5} />
            </span>
            <span class="mdv-tree__name">{year.label}</span>
          </button>
          {#if open[year.path]}
            <ul class="mdv-tree" role="group">
              {#each year.months as month (month.key)}
                <li class="mdv-tree__item" role="treeitem" aria-expanded={!!open[month.path]}>
                  <button
                    type="button"
                    class="mdv-tree__row mdv-tree__row--folder"
                    onclick={() => toggleFolder(month.path)}
                  >
                    <span class="mdv-tree__chevron{open[month.path] ? ' is-open' : ''}">
                      <Icon icon={ChevronRight} size={12} strokeWidth={2} />
                    </span>
                    <span class="mdv-tree__icon">
                      <Icon icon={open[month.path] ? FolderOpen : Folder} size={13} strokeWidth={1.5} />
                    </span>
                    <span class="mdv-tree__name">{month.label}</span>
                  </button>
                  {#if open[month.path]}
                    <ul class="mdv-tree" role="group">
                      {#each month.files as file (file.path)}
                        <li class="mdv-tree__item" role="treeitem">
                          <button
                            type="button"
                            class="mdv-tree__row mdv-tree__row--file{activePath === file.path ? ' is-active' : ''}"
                            data-path={file.path}
                            onclick={() => onSelect(file.path)}
                          >
                            <span class="mdv-tree__icon">
                              <Icon icon={FileText} size={13} strokeWidth={1.5} />
                            </span>
                            <span class="mdv-tree__name">{file.name}</span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
