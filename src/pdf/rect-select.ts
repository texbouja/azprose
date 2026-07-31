/**
 * PDF rectangle selection overlay — Alt+drag to select a region.
 *
 * Phase 1 (drawing): Alt+mousedown → drag → mouseup creates the rectangle.
 * Phase 2 (editing): Rectangle stays visible with 4 draggable corner handles.
 *   - Drag corners to adjust the selection.
 *   - Enter → confirm: convert to PDF coords, copy wikilink, notify app.
 *   - Escape → cancel: remove overlay.
 *   - Click outside the overlay → confirm (same as Enter).
 *
 * Converts CSS coordinates to PDF user-space via pageView.getPagePoint().
 * Copies a wikilink [[file#page=N&rect=x1,y1,x2,y2]] to the clipboard.
 */

export interface RectInfo {
  filePath: string;
  page: number;
  x1: number; y1: number;
  x2: number; y2: number;
}

/** Corner indices */
const TL = 0, TR = 1, BL = 2, BR = 3;

interface BaseState {
  pageEl: HTMLElement;
  pageNum: number;
  overlay: HTMLDivElement;
}

interface DrawingState extends BaseState {
  phase: "drawing";
  startX: number;
  startY: number;
}

interface EditingState extends BaseState {
  phase: "editing";
  handles: HTMLDivElement[];
  /** Bounding rect in CSS coords (relative to pageEl) */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Which corner is being dragged (null = idle) */
  dragCorner: number | null;
  /** Anchor = opposite corner during drag */
  anchorX: number;
  anchorY: number;
}

type SelectionState = DrawingState | EditingState;

export function attachRectSelection(
  viewportEl: HTMLElement,
  getViewer: () => any | null,
  getDocPath: () => string,
  onSelected: (info: RectInfo) => void,
): () => void {
  let sel: SelectionState | null = null;

  // ─── Corner handle creation ───────────────────────────────────────
  const HANDLE_SIZE = 10;

  function createHandles(pageEl: HTMLElement): HTMLDivElement[] {
    const cursors = ["nw-resize", "ne-resize", "sw-resize", "se-resize"];
    return cursors.map((cursor, i) => {
      const h = document.createElement("div");
      h.className = "pdf-rect-handle";
      h.dataset.corner = String(i);
      h.style.cssText = `
        position:absolute;
        width:${HANDLE_SIZE}px;
        height:${HANDLE_SIZE}px;
        cursor:${cursor};
        z-index:11;
        pointer-events:auto;
      `;
      pageEl.appendChild(h);
      return h;
    });
  }

  function positionHandles(handles: HTMLDivElement[], left: number, top: number, width: number, height: number) {
    if (width < 0) { left += width; width = -width; }
    if (height < 0) { top += height; height = -height; }
    const hs = HANDLE_SIZE / 2;
    // TL, TR, BL, BR
    const positions = [
      [left - hs, top - hs],
      [left + width - hs, top - hs],
      [left - hs, top + height - hs],
      [left + width - hs, top + height - hs],
    ];
    handles.forEach((h, i) => {
      h.style.left = `${positions[i][0]}px`;
      h.style.top = `${positions[i][1]}px`;
    });
  }

  function updateOverlayFromState(state: EditingState) {
    let { left, top, width, height } = state;
    if (width < 0) { left += width; width = -width; }
    if (height < 0) { top += height; height = -height; }
    state.overlay.style.left = `${left}px`;
    state.overlay.style.top = `${top}px`;
    state.overlay.style.width = `${width}px`;
    state.overlay.style.height = `${height}px`;
    positionHandles(state.handles, state.left, state.top, state.width, state.height);
  }

  // ─── Normalize bounds ─────────────────────────────────────────────
  function normalizeRect(left: number, top: number, width: number, height: number) {
    let { left: l, top: t, width: w, height: h } = { left, top, width, height };
    if (w < 0) { l += w; w = -w; }
    if (h < 0) { t += h; h = -h; }
    return { l, t, w, h };
  }

  // ─── Confirm selection ────────────────────────────────────────────
  function confirmSelection() {
    if (!sel || sel.phase !== "editing") return;
    const { pageNum, overlay, handles, left, top, width, height } = sel;

    const norm = normalizeRect(left, top, width, height);
    // Minimum 5px
    if (norm.w < 5 || norm.h < 5) {
      cleanup();
      return;
    }

    // CSS corners in page-local coords
    const cssX1 = norm.l;
    const cssY1 = norm.t;
    const cssX2 = norm.l + norm.w;
    const cssY2 = norm.t + norm.h;

    // Convert CSS coords → PDF user-space via pageView.getPagePoint()
    const viewer = getViewer();
    const pageView = (viewer as any)?._pages?.[pageNum - 1];
    if (!pageView) {
      cleanup();
      return;
    }

    const [pdfX1, pdfY1] = pageView.getPagePoint(cssX1, cssY1);
    const [pdfX2, pdfY2] = pageView.getPagePoint(cssX2, cssY2);

    const rect = {
      x1: Math.round(Math.min(pdfX1, pdfX2) * 100) / 100,
      y1: Math.round(Math.min(pdfY1, pdfY2) * 100) / 100,
      x2: Math.round(Math.max(pdfX1, pdfX2) * 100) / 100,
      y2: Math.round(Math.max(pdfY1, pdfY2) * 100) / 100,
    };

    // Flash then remove
    overlay.classList.add("is-done");
    handles.forEach((h) => (h.style.opacity = "0"));
    setTimeout(() => {
      overlay.remove();
      handles.forEach((h) => h.remove());
    }, 400);

    sel = null;

    const filePath = getDocPath();
    const wikilink = `[[${filePath}#page=${pageNum}&rect=${rect.x1},${rect.y1},${rect.x2},${rect.y2}]]`;
    copyToClipboard(wikilink);
    window.dispatchEvent(new CustomEvent("azprose:pdf-region-copied"));
    onSelected({ filePath, page: pageNum, ...rect });
  }

  // ─── Cancel selection ─────────────────────────────────────────────
  function cleanup() {
    if (!sel) return;
    sel.overlay.remove();
    if (sel.phase === "editing") sel.handles.forEach((h) => h.remove());
    sel = null;
  }

  function cancelSelection() {
    cleanup();
  }

  // ─── Mouse: drawing phase ────────────────────────────────────────
  function onMouseDown(e: MouseEvent) {
    if (!e.altKey) return;
    if (e.button !== 0) return;

    // If we're in editing phase and click is NOT on the overlay or a handle → confirm
    if (sel?.phase === "editing") {
      const target = e.target as HTMLElement;
      if (target !== sel.overlay && !target.classList.contains("pdf-rect-handle")) {
        confirmSelection();
      }
      return;
    }

    // Cancel any existing selection
    cleanup();

    const pageEl = (e.target as HTMLElement).closest("[data-page-number]") as HTMLElement | null;
    if (!pageEl) return;

    const pageNum = Number(pageEl.dataset.pageNumber);
    if (!pageNum) return;

    e.preventDefault();
    e.stopPropagation();

    const pageRect = pageEl.getBoundingClientRect();
    const startX = e.clientX - pageRect.left;
    const startY = e.clientY - pageRect.top;

    const overlay = document.createElement("div");
    overlay.className = "pdf-rect-overlay";
    overlay.style.left = `${startX}px`;
    overlay.style.top = `${startY}px`;
    overlay.style.width = "0px";
    overlay.style.height = "0px";
    pageEl.appendChild(overlay);

    sel = { phase: "drawing", pageEl, pageNum, startX, startY, overlay };
  }

  function onMouseMove(e: MouseEvent) {
    if (!sel) return;

    if (sel.phase === "drawing") {
      const pageRect = sel.pageEl.getBoundingClientRect();
      const curX = e.clientX - pageRect.left;
      const curY = e.clientY - pageRect.top;

      sel.overlay.style.left = `${Math.min(sel.startX, curX)}px`;
      sel.overlay.style.top = `${Math.min(sel.startY, curY)}px`;
      sel.overlay.style.width = `${Math.abs(curX - sel.startX)}px`;
      sel.overlay.style.height = `${Math.abs(curY - sel.startY)}px`;
      return;
    }

    // editing phase: corner drag
    if (sel.phase === "editing" && sel.dragCorner !== null) {
      const pageRect = sel.pageEl.getBoundingClientRect();
      const curX = e.clientX - pageRect.left;
      const curY = e.clientY - pageRect.top;

      const { dragCorner, anchorX, anchorY } = sel;

      if (dragCorner === TL) {
        sel.left = curX;
        sel.top = curY;
        sel.width = anchorX - curX;
        sel.height = anchorY - curY;
      } else if (dragCorner === TR) {
        sel.left = anchorX;
        sel.top = curY;
        sel.width = curX - anchorX;
        sel.height = anchorY - curY;
      } else if (dragCorner === BL) {
        sel.left = curX;
        sel.top = anchorY;
        sel.width = anchorX - curX;
        sel.height = curY - anchorY;
      } else if (dragCorner === BR) {
        sel.left = anchorX;
        sel.top = anchorY;
        sel.width = curX - anchorX;
        sel.height = curY - anchorY;
      }

      updateOverlayFromState(sel);
    }
  }

  function onMouseUp(e: MouseEvent) {
    if (!sel) return;

    if (sel.phase === "drawing") {
      const { pageEl, pageNum, startX, startY, overlay } = sel;

      const pageRect = pageEl.getBoundingClientRect();
      const endX = e.clientX - pageRect.left;
      const endY = e.clientY - pageRect.top;

      // Minimum 5px drag to qualify
      if (Math.abs(endX - startX) < 5 && Math.abs(endY - startY) < 5) {
        overlay.remove();
        sel = null;
        return;
      }

      // Transition to editing phase
      const handles = createHandles(pageEl);
      const editingState: EditingState = {
        phase: "editing",
        pageEl,
        pageNum,
        overlay,
        handles,
        left: startX,
        top: startY,
        width: endX - startX,
        height: endY - startY,
        dragCorner: null,
        anchorX: 0,
        anchorY: 0,
      };
      sel = editingState;
      positionHandles(handles, editingState.left, editingState.top, editingState.width, editingState.height);
      return;
    }

    // editing phase: release corner drag
    if (sel.phase === "editing") {
      sel.dragCorner = null;
    }
  }

  // ─── Handle: corner mousedown ─────────────────────────────────────
  function onHandleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    if (!sel || sel.phase !== "editing") return;

    const target = e.target as HTMLElement;
    if (!target.classList.contains("pdf-rect-handle")) return;

    e.preventDefault();
    e.stopPropagation();

    const corner = Number(target.dataset.corner);
    let { left, top, width, height } = sel;

    // Normalize to get current visual bounds
    const norm = normalizeRect(left, top, width, height);

    // Anchor = opposite corner
    let anchorX: number, anchorY: number;
    if (corner === TL) { anchorX = norm.l + norm.w; anchorY = norm.t + norm.h; }
    else if (corner === TR) { anchorX = norm.l; anchorY = norm.t + norm.h; }
    else if (corner === BL) { anchorX = norm.l + norm.w; anchorY = norm.t; }
    else { anchorX = norm.l; anchorY = norm.t; } // BR

    sel.dragCorner = corner;
    sel.anchorX = anchorX;
    sel.anchorY = anchorY;

    // Set non-normalized bounds so drag math is correct
    if (corner === TL) {
      sel.left = norm.l + norm.w; sel.top = norm.t + norm.h;
      sel.width = -norm.w; sel.height = -norm.h;
    } else if (corner === TR) {
      sel.left = norm.l; sel.top = norm.t + norm.h;
      sel.width = norm.w; sel.height = -norm.h;
    } else if (corner === BL) {
      sel.left = norm.l + norm.w; sel.top = norm.t;
      sel.width = -norm.w; sel.height = norm.h;
    } else {
      sel.left = norm.l; sel.top = norm.t;
      sel.width = norm.w; sel.height = norm.h;
    }
  }

  // ─── Keyboard: Enter / Escape ─────────────────────────────────────
  function onKeyDown(e: KeyboardEvent) {
    if (!sel || sel.phase !== "editing") return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      confirmSelection();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelSelection();
    }
  }

  // ─── Bind ─────────────────────────────────────────────────────────
  viewportEl.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  viewportEl.addEventListener("mousedown", onHandleMouseDown, true);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    viewportEl.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    viewportEl.removeEventListener("mousedown", onHandleMouseDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    cleanup();
  };
}

function copyToClipboard(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}
