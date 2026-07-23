<script lang="ts">
import { extFromPath } from "@/lib/editor-languages";
import { isPdfPath, isImagePath } from "@/lib";
import { ZoomIn, ZoomOut, Fullscreen, BookOpen, Wallpaper, Code2, Pencil, Eye, PdfLogo, FileDown, Table2, CircleEqual } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import { slideSettings, SLIDE_MODES } from "@/stores/slide-settings.svelte";
import type { Tab, RenderMode } from "@/lib/panel-store";


let {
  activeTab = null as Tab | null,
  panelId = "main",
  viewportEl: _viewportEl = null as HTMLElement | null,
  renderMode = "raw" as RenderMode,
  onSetEditorMode,
  onLatexViewer,
  onLatexBuild,
  onExportPdf,
  onToggleRenderMode,
  onToggleFullscreen,
  onCommand,
}: {
  activeTab?: Tab | null;
  panelId?: string;
  viewportEl?: HTMLElement | null;
  renderMode?: RenderMode;
  onSetEditorMode?: (mode: "raw" | "prose" | "preview") => void;
  onLatexViewer?: () => void;
  onLatexBuild?: () => void;
  onExportPdf?: () => void;
  onToggleRenderMode?: () => void;
  onToggleFullscreen?: () => void;
  onCommand?: (cmd: string) => void;
} = $props();

let visible = $state(false);
let toolbarEl = $state<HTMLElement | null>(null);
let hoverZoneEl = $state<HTMLElement | null>(null);

function show() { visible = true; }
function hide() { visible = false; }

function clickOutside(e: MouseEvent) {
  if (!toolbarEl && !hoverZoneEl) return;
  const target = e.target as Node;
  if (toolbarEl && !toolbarEl.contains(target) && hoverZoneEl && !hoverZoneEl.contains(target)) hide();
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
let isCsv = $derived(ext === "csv" || ext === "tsv");
let isMain = $derived(panelId === "main");
</script>

{#if activeTab}
  {#if isMain}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tab-actions__hover-zone tab-actions__hover-zone--main" bind:this={hoverZoneEl} onmouseenter={show}></div>
    <div class="tab-actions__indicator" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="4" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="12" r="1.2"/>
      </svg>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tab-actions__hover-zone" bind:this={hoverZoneEl} onmouseenter={show}></div>
  {/if}

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
            <button type="button" class="tab-actions__btn tab-actions__btn--label" onclick={() => onExportPdf?.()} title={t("tabs.exportPdf")}>
              <Icon icon={FileDown} size={13} strokeWidth={1.8} /><span>{t("tabs.exportPdf")}</span>
            </button>
          {:else if isTex}
            <button type="button" class="tab-actions__btn tab-actions__btn--label" onclick={() => onLatexViewer?.()}>
              {@html PdfLogo}<span>{t("tabs.viewPdf")}</span>
            </button>
            <button type="button" class="tab-actions__btn tab-actions__btn--label" onclick={() => onLatexBuild?.()}>
              <Icon icon={FileDown} size={13} strokeWidth={1.8} /><span>{t("tabs.build")}</span>
            </button>
          {:else if isCsv}
            <button type="button" class="tab-actions__btn tab-actions__btn--label" class:is-active={renderMode === "preview"} onclick={() => onSetEditorMode?.("preview")}>
              <Icon icon={Table2} size={14} strokeWidth={1.8} /><span>Grille</span>
            </button>
          {/if}
        </div>
      </div>
    {:else}
      <div class="tab-actions tab-actions--side" bind:this={toolbarEl} role="toolbar" aria-label="Tab actions">
        <div class="tab-actions__section tab-actions__left">
          {#if isPdfPath(activeTab.path) || isImagePath(activeTab.path) || ext === "html"}
            <span class="tab-actions__title">{activeTab.title}</span>
          {/if}
        </div>
        <div class="tab-actions__section tab-actions__center">
          {#if isImagePath(activeTab.path)}
            <button class="tab-actions__btn" onclick={() => fire("zoom-out")} aria-label="Zoom out" title="Zoom out"><Icon icon={ZoomOut} size={16} strokeWidth={1.8} /></button>
            <button class="tab-actions__btn" onclick={() => fire("zoom-in")} aria-label="Zoom in" title="Zoom in"><Icon icon={ZoomIn} size={16} strokeWidth={1.8} /></button>
          {:else if (isMd && renderMode !== "presentation")}
            <button class="tab-actions__btn" onclick={() => fire("zoom-out")} aria-label="Zoom out" title="Zoom out"><Icon icon={ZoomOut} size={16} strokeWidth={1.8} /></button>
            <button class="tab-actions__btn" onclick={() => fire("zoom-reset")} aria-label="Reset zoom" title="Reset zoom"><Icon icon={CircleEqual} size={16} strokeWidth={1.8} /></button>
            <button class="tab-actions__btn" onclick={() => fire("zoom-in")} aria-label="Zoom in" title="Zoom in"><Icon icon={ZoomIn} size={16} strokeWidth={1.8} /></button>
          {:else if isMd && renderMode === "presentation"}
            {#each SLIDE_MODES as sm}
              <label class="tab-actions__radio">
                <input type="radio" name="slide-mode" checked={slideSettings.mode === sm.id} onchange={() => slideSettings.mode = sm.id} />
                <span>{sm.label}</span>
              </label>
            {/each}
            <span class="tab-actions__sep"></span>
            <button class="tab-actions__btn" onclick={() => fire("zoom-out")} aria-label="Zoom out" title="Zoom out"><Icon icon={ZoomOut} size={16} strokeWidth={1.8} /></button>
            <button class="tab-actions__btn" onclick={() => fire("zoom-reset")} aria-label="Reset zoom" title="Reset zoom"><Icon icon={CircleEqual} size={16} strokeWidth={1.8} /></button>
            <button class="tab-actions__btn" onclick={() => fire("zoom-in")} aria-label="Zoom in" title="Zoom in"><Icon icon={ZoomIn} size={16} strokeWidth={1.8} /></button>
          {/if}
        </div>
        <div class="tab-actions__section tab-actions__right">
          {#if isMd}
            <button type="button" class="tab-actions__btn" onclick={() => onToggleRenderMode?.()} aria-label="Presentation" title="Presentation">
              <Icon icon={renderMode === "presentation" ? BookOpen : Wallpaper} size={16} strokeWidth={1.8} />
            </button>
            <span class="tab-actions__sep"></span>
          {/if}
          <button type="button" class="tab-actions__btn" onclick={() => onToggleFullscreen?.()} aria-label="Fullscreen" title="Fullscreen">
            <Icon icon={Fullscreen} size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    {/if}
  {/if}
{/if}

<style>
.tab-actions__hover-zone {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  z-index: 19;
  pointer-events: auto;
}
.tab-actions__hover-zone--main {
  left: auto;
  right: 0;
  width: 80px;
}
.tab-actions__indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 18;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--muted);
  opacity: 0.4;
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--easing);
}
.tab-actions {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 6px;
  gap: 2px;
  pointer-events: auto;
  position: absolute;
  top: 0;
  left: 0;
  font-family: var(--font-ui);
  right: 0;
  z-index: 20;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--border);
}
.tab-actions--main {
  justify-content: flex-end;
}
.tab-actions--side {
  justify-content: space-between;
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
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
}
.tab-actions__btn:hover {
  background: var(--surface-hover);
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
.tab-actions__btn--label:hover {
  color: var(--fg);
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
</style>
