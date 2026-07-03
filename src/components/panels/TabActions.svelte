<script lang="ts">
import { extFromPath } from "@/lib/editor-languages";
import { isPdfPath, isImagePath } from "@/lib";
import { ZoomIn, ZoomOut, Maximize2, Monitor, BookOpen, Wallpaper, Code2, Pencil, Eye, FileDown } from "@/lib/icons";
import { Button, Icon, Popover } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import { slideSettings, SLIDE_THEMES, SLIDE_MODES } from "@/components/markdown/slide-settings.svelte";
import type { Tab, RenderMode } from "@/lib/panel-store";
import { Check, ChevronDown } from "@/lib/icons";

let {
  activeTab = null as Tab | null,
  panelId = "main",
  viewportEl = null as HTMLElement | null,
  renderMode = "raw" as RenderMode,
  onSetEditorMode,
  onLatexViewer,
  onLatexBuild,
  onToggleTypstViewer,
  onTypstBuild,
  onToggleRenderMode,
  onToggleFullscreen,
  onCommand,
}: {
  activeTab?: Tab | null;
  panelId?: string;
  viewportEl?: HTMLElement | null;
  renderMode?: RenderMode;
  onSetEditorMode?: (mode: "raw" | "prose" | "preview" | "presentation") => void;
  onLatexViewer?: () => void;
  onLatexBuild?: () => void;
  onToggleTypstViewer?: () => void;
  onTypstBuild?: () => void;
  onToggleRenderMode?: () => void;
  onToggleFullscreen?: () => void;
  onCommand?: (cmd: string) => void;
} = $props();

let visible = $state(false);
let toolbarEl = $state<HTMLElement | null>(null);
let triggerEl = $state<HTMLElement | null>(null);
let themeMenuOpen = $state(false);
let themeAnchorEl = $state<HTMLDivElement | null>(null);

function show() { visible = true; }
function hide() { visible = false; }

function clickOutside(e: MouseEvent) {
  if (!toolbarEl && !triggerEl) return;
  const target = e.target as Node;
  if (toolbarEl && !toolbarEl.contains(target) && triggerEl && !triggerEl.contains(target)) hide();
}

$effect(() => {
  if (!visible) return;
  const handler = (e: MouseEvent) => clickOutside(e);
  requestAnimationFrame(() => document.addEventListener("click", handler));
  return () => document.removeEventListener("click", handler);
});

let t = $derived(getT($language));

function fire(cmd: string) { onCommand?.(cmd); }

let ext = $derived(extFromPath(activeTab?.path ?? ""));
let isMd = $derived(ext === "md");
let isTex = $derived(ext === "tex");
let isTyp = $derived(ext === "typ");
let isMain = $derived(panelId === "main");
let isSide = $derived(panelId !== "main");
</script>

{#if activeTab}
  <button
    type="button"
    bind:this={triggerEl}
    class="tab-actions__trigger"
    class:is-hidden={visible}
    onmouseenter={show}
    onclick={show}
    aria-label="Show actions"
    title="Show actions"
  >
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="4" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="12" r="1.2"/>
    </svg>
  </button>

  {#if visible}
    {#if isMain}
      <div class="tab-actions tab-actions--main" bind:this={toolbarEl} role="toolbar" aria-label="Tab actions">
        <div class="tab-actions__group">
          {#if isMd}
            <button type="button" class="tab-actions__btn tab-actions__btn--label" class:is-active={renderMode === "raw"} onclick={() => onSetEditorMode?.("raw")}>
              <Icon icon={Code2} size={14} strokeWidth={1.8} /><span>{t("tabs.raw")}</span>
            </button>
            <button type="button" class="tab-actions__btn tab-actions__btn--label" class:is-active={renderMode === "prose"} onclick={() => onSetEditorMode?.("prose")}>
              <Icon icon={Pencil} size={14} strokeWidth={1.8} /><span>{t("tabs.prose")}</span>
            </button>
            <button type="button" class="tab-actions__btn tab-actions__btn--label" class:is-active={renderMode === "preview" || renderMode === "presentation"} onclick={() => onSetEditorMode?.("preview")}>
              <Icon icon={Eye} size={14} strokeWidth={1.8} /><span>{t("tabs.preview")}</span>
            </button>
          {:else if isTex}
            <button type="button" class="tab-actions__btn tab-actions__btn--label" onclick={() => onLatexViewer?.()}>
              <Icon icon={Eye} size={14} strokeWidth={1.8} /><span>{t("tabs.viewPdf")}</span>
            </button>
            <button type="button" class="tab-actions__btn tab-actions__btn--label" onclick={() => onLatexBuild?.()}>
              <Icon icon={FileDown} size={13} strokeWidth={1.8} /><span>{t("tabs.build")}</span>
            </button>
          {:else if isTyp}
            <button type="button" class="tab-actions__btn tab-actions__btn--label" onclick={() => onToggleTypstViewer?.()}>
              <Icon icon={Eye} size={14} strokeWidth={1.8} /><span>{t("tabs.viewPdf")}</span>
            </button>
            <button type="button" class="tab-actions__btn tab-actions__btn--label" onclick={() => onTypstBuild?.()}>
              <Icon icon={FileDown} size={13} strokeWidth={1.8} /><span>{t("tabs.build")}</span>
            </button>
          {/if}
        </div>
      </div>
    {:else}
      <div class="tab-actions tab-actions--side" bind:this={toolbarEl} role="toolbar" aria-label="Tab actions">
        <div class="tab-actions__section tab-actions__left">
          {#if isMd}
            <button type="button" class="tab-actions__btn" onclick={() => onToggleRenderMode?.()} aria-label="Presentation" title="Presentation">
              <Icon icon={renderMode === "presentation" ? BookOpen : Wallpaper} size={16} strokeWidth={1.8} />
            </button>
          {:else if isPdfPath(activeTab.path) || isImagePath(activeTab.path) || ext === "html"}
            <span class="tab-actions__title">{activeTab.title}</span>
          {/if}
        </div>
        <div class="tab-actions__section tab-actions__center">
          {#if isImagePath(activeTab.path)}
            <button class="tab-actions__btn" onclick={() => fire("zoom-out")} aria-label="Zoom out" title="Zoom out">{@html ZoomOut}</button>
            <button class="tab-actions__btn" onclick={() => fire("zoom-in")} aria-label="Zoom in" title="Zoom in">{@html ZoomIn}</button>
          {:else if isMd && renderMode === "presentation"}
            {#each SLIDE_MODES as sm}
              <label class="tab-actions__radio">
                <input type="radio" name="slide-mode" checked={slideSettings.mode === sm.id} onchange={() => slideSettings.mode = sm.id} />
                <span>{sm.label}</span>
              </label>
            {/each}
            <span class="tab-actions__sep" />
            <div class="tab-actions__theme-wrap" bind:this={themeAnchorEl}>
              <Button
                data-tooltip="Slide theme"
                aria-label="Slide theme"
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
                onclick={() => themeMenuOpen = !themeMenuOpen}
              >
                {#snippet icon()}
                  <Icon icon={Monitor} size={14} strokeWidth={1.5} />
                {/snippet}
              </Button>
              <span class="tab-actions__theme-label">{SLIDE_THEMES.find(st => st.id === slideSettings.theme)?.label ?? slideSettings.theme}</span>
              <Popover
                align="left"
                open={themeMenuOpen}
                onClose={() => themeMenuOpen = false}
                anchorRef={{ current: themeAnchorEl }}
              >
                <div class="mdv-menu" role="menu">
                  <div class="mdv-menu__group-label">{t("slides.theme")}</div>
                  {#each SLIDE_THEMES as st}
                    {@const active = slideSettings.theme === st.id}
                    <button
                      type="button"
                      class="mdv-menu__item"
                      class:is-active={active}
                      onclick={() => { slideSettings.theme = st.id; themeMenuOpen = false; }}
                      role="menuitemradio"
                      aria-checked={active}
                    >
                      <span class="mdv-menu__item-label">{st.label}</span>
                      {#if active}
                        <span class="mdv-menu__item-check">
                          <Icon icon={Check} size={13} strokeWidth={2} />
                        </span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </Popover>
            </div>
          {/if}
        </div>
        <div class="tab-actions__section tab-actions__right">
          <button type="button" class="tab-actions__btn" onclick={() => onToggleFullscreen?.()} aria-label="Fullscreen" title="Fullscreen">
            <Icon icon={Maximize2} size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    {/if}
  {/if}
{/if}

<style>
.tab-actions__trigger {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 19;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0.35;
  transition: opacity var(--dur-fast) var(--easing), background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
}
.tab-actions__trigger:hover {
  opacity: 0.85;
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  color: var(--fg);
}
.tab-actions__trigger.is-hidden {
  display: none;
}
.tab-actions {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  gap: 4px;
  pointer-events: auto;
  position: absolute;
  top: 0;
  left: 0;
  font-family: var(--font-ui);
  right: 0;
  z-index: 20;
}
.tab-actions--main {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  justify-content: flex-end;
}
.tab-actions--side {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.tab-actions__group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.tab-actions__section {
  display: flex;
  align-items: center;
  gap: 2px;
}
.tab-actions__left { flex: 0 0 auto; }
.tab-actions__center { flex: 1 1 auto; justify-content: center; }
.tab-actions__right { flex: 0 0 auto; margin-left: auto; }
.tab-actions__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
}
.tab-actions__btn:hover {
  background: color-mix(in srgb, var(--fg) 12%, transparent);
  color: var(--fg);
}
.tab-actions__btn:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1.5px var(--accent);
}
.tab-actions__btn.is-active {
  color: var(--accent);
}
.tab-actions__btn--label {
  width: auto;
  padding: 0 8px;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--fg-muted);
}
.tab-actions__btn--label span {
  line-height: 1;
}
.tab-actions__btn--label.is-active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.tab-actions__title {
  font-size: 12px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.tab-actions__sep {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 6px;
}
.tab-actions__radio {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--fg-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.tab-actions__radio:hover {
  background: var(--surface-hover);
}
.tab-actions__theme-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
}
.tab-actions__theme-label {
  font-size: 11px;
  color: var(--fg-muted, var(--muted));
  cursor: default;
}
</style>
