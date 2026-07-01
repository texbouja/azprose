<script lang="ts">
import { FolderOpen, Layers3 } from "@/lib/icons";
import { Button, Icon } from "@/components/primitives";
import { language, getT } from "@/lib/i18n";
import { getProjectsList, removeProject, type ProjectEntry } from "@/lib/projects-list";
import { onMount } from "svelte";

let {
  rootPath,
  onOpenProject,
  onProjectFromFolder,
}: {
  rootPath: string | null;
  onOpenProject: (path: string) => void;
  onProjectFromFolder: () => void;
} = $props();

let t = $derived(getT($language));

let projects = $state<ProjectEntry[]>([]);
let showDropdown = $state(false);

onMount(() => {
  reload();
});

async function reload() {
  projects = await getProjectsList();
}

async function handleOpen(p: ProjectEntry) {
  showDropdown = false;
  onOpenProject(p.path);
}

function handleInit() {
  showDropdown = false;
  onProjectFromFolder();
}

function handleToggle() {
  showDropdown = !showDropdown;
}

async function handleRemove(p: ProjectEntry, e: MouseEvent) {
  e.stopPropagation();
  await removeProject(p.path);
  await reload();
}
</script>

<div class="mdv-project-selector">
  {#snippet projectsIcon()}
    <Icon icon={Layers3} size={13} strokeWidth={1.5} />
  {/snippet}
  <Button
    data-tooltip={t("sidebar.openProject")}
    aria-label={t("sidebar.openProject")}
    onclick={handleToggle}
    icon={projectsIcon}
    class="mdv-project-selector__trigger"
  >
    {t("sidebar.openProject")}
  </Button>

  {#if showDropdown}
    <div class="mdv-project-selector__popover">
      <div class="mdv-project-selector__header">
        <span class="mdv-project-selector__title">{t("sidebar.projects")}</span>
      </div>
      <div class="mdv-project-selector__list">
        {#each projects as p (p.path)}
          <div
            role="button"
            tabindex="0"
            class="mdv-project-selector__item"
            class:is-current={rootPath != null && p.path === rootPath}
            onclick={() => handleOpen(p)}
            onkeydown={(e) => { if (e.key === "Enter") handleOpen(p); }}
          >
            <Icon icon={FolderOpen} size={13} strokeWidth={1.5} />
            <span class="mdv-project-selector__name">{p.name}</span>
              <button
              type="button"
              class="mdv-project-selector__remove"
              aria-label={t("sidebar.removeProject")}
              onclick={(e) => handleRemove(p, e)}
            >
              ×
            </button>
          </div>
        {:else}
          <div class="mdv-project-selector__empty">
            {t("sidebar.noProjects")}
          </div>
        {/each}
      </div>
      <div class="mdv-project-selector__footer">
        <button
          type="button"
          class="mdv-project-selector__add"
          onclick={handleInit}
        >
          <span class="mdv-project-selector__plus">+</span>
          <span>{t("sidebar.openFolderAsProject")}</span>
        </button>
      </div>
    </div>
  {/if}
</div>

<svelte:window onclick={(e) => {
  if (!showDropdown) return;
  const target = e.target as HTMLElement;
  if (!target.closest(".mdv-project-selector")) {
    showDropdown = false;
  }
}} />

<style>
.mdv-project-selector {
  position: relative;
}
.mdv-project-selector :global(.mdv-project-selector__trigger) {
  width: 100%;
  justify-content: flex-start;
}
.mdv-project-selector__popover {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  min-width: 220px;
  max-width: 280px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100;
}
.mdv-project-selector__header {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.mdv-project-selector__title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.mdv-project-selector__list {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
}
.mdv-project-selector__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  background: none;
  border: none;
  color: var(--fg);
  cursor: pointer;
  text-align: left;
}
.mdv-project-selector__item:hover {
  background: var(--surface-hover);
}
.mdv-project-selector__item.is-current {
  color: var(--accent);
}
.mdv-project-selector__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.mdv-project-selector__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  opacity: 0;
  flex-shrink: 0;
}
.mdv-project-selector__item:hover .mdv-project-selector__remove {
  opacity: 1;
}
.mdv-project-selector__remove:hover {
  color: var(--fg);
  background: var(--surface-hover);
}
.mdv-project-selector__empty {
  padding: 12px 10px;
  font-size: 11px;
  color: var(--muted);
  text-align: center;
}
.mdv-project-selector__footer {
  border-top: 1px solid var(--border);
  padding: 4px;
}
.mdv-project-selector__add {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  background: none;
  border: none;
  color: var(--fg);
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
}
.mdv-project-selector__add:hover {
  background: var(--surface-hover);
}
.mdv-project-selector__plus {
  font-size: 16px;
  line-height: 1;
  width: 12px;
  text-align: center;
}
</style>
