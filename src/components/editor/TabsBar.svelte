<script lang="ts">
import { Icon } from "@/components/primitives";
import { X, Eye, FileDown } from "@/lib/icons";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";

export type Tab = {
  id: string;
  title: string;
  path: string;
  source: string;
  savedContent: string;
  /** VS Code-style preview tab: ephemeral, reused on single-click, italic title. */
  preview?: boolean;
};

let {
  tabs = [] as Tab[],
  activeTabId = null as string | null,
  onSelect,
  onClose,
  onReorder,
  splitOn = false,
  canSplit = false,
  onToggleSplit,
  typstPreviewOn = false,
  onToggleTypstPreview,
  latexSplitOn = false,
  latexBuilding = false,
  onToggleLatexSplit,
  onLatexBuild,
}: {
  tabs?: Tab[];
  activeTabId?: string | null;
  onSelect?: (id: string) => void;
  onClose?: (id: string) => void;
  onReorder?: (from: number, to: number) => void;
  splitOn?: boolean;
  canSplit?: boolean;
  onToggleSplit?: (id: string) => void;
  typstPreviewOn?: boolean;
  onToggleTypstPreview?: () => void;
  latexSplitOn?: boolean;
  latexBuilding?: boolean;
  onToggleLatexSplit?: () => void;
  onLatexBuild?: () => void;
} = $props();

let t = $derived(getT($language));

const DRAG_THRESHOLD = 4;

let listEl: HTMLDivElement;
let dragFromIndex: number | null = $state(null);
let dragOverIndex: number | null = $state(null);
let dragPtr: { fromIndex: number; startX: number; pointerId: number; moved: boolean } | null = null;
let suppressClick = false;

$effect(() => {
  if (!activeTabId || !listEl) return;
  const active = listEl.querySelector<HTMLElement>(".mdv-tab.is-active");
  active?.scrollIntoView({ block: "nearest", inline: "nearest" });
});

function indexAtX(clientX: number): number | null {
  if (!listEl) return null;
  const tabEls = Array.from(listEl.querySelectorAll<HTMLElement>(".mdv-tab"));
  if (tabEls.length === 0) return null;
  for (let i = 0; i < tabEls.length; i++) {
    const rect = tabEls[i].getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) return i;
  }
  return tabEls.length - 1;
}

function handleWheel(e: WheelEvent) {
  if (!listEl) return;
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
  if (listEl.scrollWidth <= listEl.clientWidth) return;
  e.preventDefault();
  listEl.scrollLeft += e.deltaY;
}

function onTabPointerDown(e: PointerEvent, index: number) {
  if (!onReorder || e.button !== 0) return;
  suppressClick = false;
  dragPtr = { fromIndex: index, startX: e.clientX, pointerId: e.pointerId, moved: false };
}

function onListPointerMove(e: PointerEvent) {
  const drag = dragPtr;
  if (!drag) return;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) return;
    drag.moved = true;
    dragFromIndex = drag.fromIndex;
    try {
      listEl?.setPointerCapture(drag.pointerId);
    } catch {}
  }
  dragOverIndex = indexAtX(e.clientX);
}

function endDrag(e: PointerEvent) {
  const drag = dragPtr;
  if (!drag) return;
  if (drag.moved) {
    suppressClick = true;
    const target = indexAtX(e.clientX);
    if (onReorder && target !== null && target !== drag.fromIndex) {
      onReorder(drag.fromIndex, target);
    }
  }
  try {
    listEl?.releasePointerCapture(drag.pointerId);
  } catch {}
  dragPtr = null;
  dragFromIndex = null;
  dragOverIndex = null;
}
</script>

<div
  bind:this={listEl}
  class="mdv-tabs{dragFromIndex !== null ? " is-reordering" : ""}"
  role="tablist"
  aria-label={t("tabs.openFiles")}
  onwheel={handleWheel}
  onpointermove={onListPointerMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
>
  {#each tabs as tab, tabIndex}
    {@const active = tab.id === activeTabId}
    {@const dirty = tab.source !== tab.savedContent}
    {@const dragging = dragFromIndex === tabIndex}
    {@const isDragOver = dragOverIndex === tabIndex && dragFromIndex !== null && dragFromIndex !== tabIndex}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      role="tab"
      aria-selected={active}
      class="mdv-tab{active ? " is-active" : ""}{dirty ? " is-dirty" : ""}{dragging ? " is-dragging" : ""}{isDragOver ? " is-drag-over" : ""}"
      title={tab.path}
      onpointerdown={(e) => onTabPointerDown(e, tabIndex)}
    >
      <button
        type="button"
        class="mdv-tab__select"
        onclick={() => {
          if (suppressClick) { suppressClick = false; return; }
          onSelect?.(tab.id);
        }}
      >
        <span class="mdv-tab__dot" aria-hidden="true" />
        <span class="mdv-tab__label" class:is-preview={tab.preview}>{tab.title}</span>
      </button>
      {#if canSplit && active}
        <button
          type="button"
          class="mdv-tab__split"
          class:is-active={splitOn}
          aria-label="Toggle split preview"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={() => onToggleSplit?.(tab.id)}
        >
          <Icon icon={Eye} size={13} strokeWidth={1.8} />
        </button>
      {:else if onToggleTypstPreview && tab.path.endsWith(".typ") && active}
        <button
          type="button"
          class="mdv-tab__split"
          class:is-active={typstPreviewOn}
          aria-label="Toggle live preview"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={onToggleTypstPreview}
        >
          <Icon icon={Eye} size={13} strokeWidth={1.8} />
        </button>
      {:else if onToggleLatexSplit && tab.path.endsWith(".tex") && active}
        <button
          type="button"
          class="mdv-tab__split"
          class:is-active={latexSplitOn}
          aria-label="Toggle PDF preview"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={onToggleLatexSplit}
        >
          <Icon icon={Eye} size={13} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          class="mdv-tab__build"
          disabled={latexBuilding}
          aria-label="Build LaTeX"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={onLatexBuild}
        >
          <Icon icon={FileDown} size={12} strokeWidth={1.8} />
        </button>
      {/if}
      <button
        type="button"
        class="mdv-tab__close"
        aria-label={t("tabs.close", { name: tab.title })}
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => onClose?.(tab.id)}
      >
        <Icon icon={X} size={13} strokeWidth={1.8} />
      </button>
    </div>
  {/each}
</div>

<style>
.mdv-tab__build {
  display: inline-flex;
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
  flex-shrink: 0;
  transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
}
.mdv-tab__build:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--fg);
}
.mdv-tab__build:disabled {
  opacity: 0.4;
  cursor: default;
}
.mdv-tab__build:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1.5px var(--accent);
}
</style>
