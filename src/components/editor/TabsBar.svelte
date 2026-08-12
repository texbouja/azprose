<script lang="ts">
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import type { Tab } from "@/lib/panel-store";
import { canPinTab } from "@/lib/panel-store";

let {
  tabs = [] as Tab[],
  activeTabId = null as string | null,
  panelId = "main",
  onSelect,
  onClose,
  onReorder,
  onTabDoubleClick,
  onTogglePin,
  onDropOnPinned,
}: {
  tabs?: Tab[];
  activeTabId?: string | null;
  panelId?: string;
  onSelect?: (id: string) => void;
  onClose?: (id: string) => void;
  onReorder?: (from: number, to: number) => void;
  onTabDoubleClick?: (id: string) => void;
  /** Commutation d'épingle (Phase A — R1) : le pinnage se décide dans le MAIN
   *  panel (l'icône n'apparaît que là) ; les viewers n'ont qu'un badge. */
  onTogglePin?: (id: string) => void;
  /** Dépôt d'un onglet SUR le slot épinglé (rectification 2) : le slot est
   *  recyclé avec le contenu glissé — sa pile de montage survit — et l'onglet
   *  glissé est fermé. */
  onDropOnPinned?: (draggedId: string, pinnedId: string) => void;
} = $props();

let t = $derived(getT($language));

const DRAG_THRESHOLD = 4;

let listEl: HTMLDivElement;
let dragFromIndex: number | null = $state(null);
let dragOverIndex: number | null = $state(null);
/** Slot épinglé survolé au CENTRE pendant un glisser (cible de recyclage). */
let dropPinnedIndex: number | null = $state(null);
let dragPtr: { fromIndex: number; startX: number; pointerId: number; moved: boolean } | null = null;
let suppressClick = false;

$effect(() => {
  if (!activeTabId || !listEl) return;
  const active = listEl.querySelector<HTMLElement>(".mdv-tab.is-active");
  active?.scrollIntoView({ block: "nearest", inline: "nearest" });
});

/**
 * Cible d'un dépôt (rectification 2) — la position dans l'onglet décide :
 *  - dans les MARGES (tiers gauche / tiers droit) = « ENTRE deux onglets » →
 *    DÉPLACEMENT (comportement historique) ;
 *  - au CENTRE = « SUR l'onglet » → ignoré, SAUF si cet onglet est le slot
 *    ÉPINGLÉ : le slot est alors recyclé avec le contenu glissé (sa pile de
 *    montage survit), et l'onglet glissé est fermé.
 */
function dropTargetAtX(clientX: number): { kind: "move"; index: number } | { kind: "pinned"; index: number } | null {
  if (!listEl) return null;
  const tabEls = Array.from(listEl.querySelectorAll<HTMLElement>(".mdv-tab"));
  if (tabEls.length === 0) return null;
  for (let i = 0; i < tabEls.length; i++) {
    const rect = tabEls[i].getBoundingClientRect();
    if (clientX > rect.right) continue;
    const inCenter = clientX > rect.left + rect.width / 3 && clientX < rect.right - rect.width / 3;
    if (inCenter && tabs[i] && tabs[i].space === "pinned") return { kind: "pinned", index: i };
    if (inCenter) return null; // dépôt sur un onglet ordinaire : sans effet
    return { kind: "move", index: i };
  }
  return { kind: "move", index: tabEls.length - 1 };
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
  const target = dropTargetAtX(e.clientX);
  dragOverIndex = target?.kind === "move" ? target.index : null;
  dropPinnedIndex = target?.kind === "pinned" && target.index !== drag.fromIndex ? target.index : null;
}

function endDrag(e: PointerEvent) {
  const drag = dragPtr;
  if (!drag) return;
  if (drag.moved) {
    suppressClick = true;
    const target = dropTargetAtX(e.clientX);
    if (target?.kind === "pinned" && target.index !== drag.fromIndex) {
      // Dépôt SUR le slot épinglé : recyclage du slot (rectification 2).
      const dragged = tabs[drag.fromIndex];
      const pinned = tabs[target.index];
      if (dragged && pinned) onDropOnPinned?.(dragged.id, pinned.id);
    } else if (onReorder && target?.kind === "move" && target.index !== drag.fromIndex) {
      onReorder(drag.fromIndex, target.index);
    }
  }
  try {
    listEl?.releasePointerCapture(drag.pointerId);
  } catch {}
  dragPtr = null;
  dragFromIndex = null;
  dragOverIndex = null;
  dropPinnedIndex = null;
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
    {@const dirty = panelId === "main" && tab.source !== tab.savedContent}
    {@const dragging = dragFromIndex === tabIndex}
    {@const isDragOver = dragOverIndex === tabIndex && dragFromIndex !== null && dragFromIndex !== tabIndex}
    {@const isDropPinned = dropPinnedIndex === tabIndex}
    {@const pinable = panelId === "main" && canPinTab(tab)}
    {@const pinned = tab.space === "pinned"}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      role="tab"
      aria-selected={active}
      class="mdv-tab{active ? " is-active" : ""}{dirty ? " is-dirty" : ""}{dragging ? " is-dragging" : ""}{isDragOver ? " is-drag-over" : ""}{isDropPinned ? " is-drop-pinned" : ""}{tab.dormant ? " is-dormant" : ""}"
      title={tab.path}
      onpointerdown={(e) => onTabPointerDown(e, tabIndex)}
      ondblclick={() => onTabDoubleClick?.(tab.id)}
    >
      <span class="mdv-tab__dot" aria-hidden="true" />
      {#if panelId === "side" && pinned}
        <!-- Badge pin viewer (Phase C — R1 round 5) : marqueur d'appartenance
             à la sphère pinned, NON cliquable, pas de grisé — le pinnage se
             décide dans le MAIN panel (l'icône cliquable n'existe que là). -->
        <span class="mdv-tab__pin-badge" title={t("tabs.pinBadgeTitle")}>
          <i class="wxi-pin-outline" style="font-size:13px"></i>
        </span>
      {/if}
      {#if pinable}
        <button
          type="button"
          class="mdv-tab__pin{pinned ? " is-pinned" : ""}"
          aria-label={pinned ? t("tabs.unpin", { name: tab.title }) : t("tabs.pin", { name: tab.title })}
          title={pinned ? t("tabs.unpinTitle") : t("tabs.pinTitle")}
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => { e.stopPropagation(); onTogglePin?.(tab.id); }}
        >
          <i class="wxi-pin-outline" style="font-size:13px"></i>
        </button>
      {/if}
      <button
        type="button"
        class="mdv-tab__select"
        onclick={() => {
          if (suppressClick) { suppressClick = false; return; }
          onSelect?.(tab.id);
        }}
      >
        <span class="mdv-tab__label" class:is-preview={tab.preview}>{tab.title}</span>
      </button>
      <button
        type="button"
        class="mdv-tab__close"
        aria-label={t("tabs.close", { name: tab.title })}
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => onClose?.(tab.id)}
      >
        <i class="wxi-x" style="font-size:13px"></i>
      </button>
    </div>
  {/each}
</div>

<style></style>
