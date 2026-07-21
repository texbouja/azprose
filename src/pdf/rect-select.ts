/**
 * PDF rectangle selection overlay — Alt+drag to select a region.
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

interface SelectionState {
  active: boolean;
  pageEl: HTMLElement;
  pageNum: number;
  startX: number;
  startY: number;
  overlay: HTMLDivElement;
}

export function attachRectSelection(
  viewportEl: HTMLElement,
  getViewer: () => any | null,
  getDocPath: () => string,
  onSelected: (info: RectInfo) => void,
): () => void {
  let selection: SelectionState | null = null;

  function onMouseDown(e: MouseEvent) {
    if (!e.altKey) return;
    if (e.button !== 0) return;

    const pageEl = (e.target as HTMLElement).closest("[data-page-number]") as HTMLElement | null;
    if (!pageEl) return;

    e.preventDefault();
    e.stopPropagation();

    const pageNum = Number(pageEl.dataset.pageNumber);
    if (!pageNum) return;

    const pageRect = pageEl.getBoundingClientRect();
    const startX = e.clientX - pageRect.left;
    const startY = e.clientY - pageRect.top;

    // Create overlay inside the page element
    const overlay = document.createElement("div");
    overlay.className = "pdf-rect-overlay";
    overlay.style.left = `${startX}px`;
    overlay.style.top = `${startY}px`;
    overlay.style.width = "0px";
    overlay.style.height = "0px";
    pageEl.appendChild(overlay);

    selection = { active: true, pageEl, pageNum, startX, startY, overlay };
  }

  function onMouseMove(e: MouseEvent) {
    if (!selection?.active) return;

    const pageRect = selection.pageEl.getBoundingClientRect();
    const curX = e.clientX - pageRect.left;
    const curY = e.clientY - pageRect.top;

    const left = Math.min(selection.startX, curX);
    const top = Math.min(selection.startY, curY);
    const width = Math.abs(curX - selection.startX);
    const height = Math.abs(curY - selection.startY);

    selection.overlay.style.left = `${left}px`;
    selection.overlay.style.top = `${top}px`;
    selection.overlay.style.width = `${width}px`;
    selection.overlay.style.height = `${height}px`;
  }

  function onMouseUp(e: MouseEvent) {
    if (!selection?.active) return;

    const { pageEl, pageNum, startX, startY, overlay } = selection;
    selection = null;

    const pageRect = pageEl.getBoundingClientRect();
    const endX = e.clientX - pageRect.left;
    const endY = e.clientY - pageRect.top;

    // Minimum 5px drag to qualify as a selection
    if (Math.abs(endX - startX) < 5 && Math.abs(endY - startY) < 5) {
      overlay.remove();
      return;
    }

    // Convert CSS coords → PDF user-space via pageView.getPagePoint()
    const viewer = getViewer();
    const pageView = (viewer as any)?._pages?.[pageNum - 1];
    if (!pageView) {
      overlay.remove();
      return;
    }

    const [pdfX1, pdfY1] = pageView.getPagePoint(startX, startY);
    const [pdfX2, pdfY2] = pageView.getPagePoint(endX, endY);

    // Normalize so x1 < x2, y1 < y2
    const rect = {
      x1: Math.round(Math.min(pdfX1, pdfX2) * 100) / 100,
      y1: Math.round(Math.min(pdfY1, pdfY2) * 100) / 100,
      x2: Math.round(Math.max(pdfX1, pdfX2) * 100) / 100,
      y2: Math.round(Math.max(pdfY1, pdfY2) * 100) / 100,
    };

    // Flash overlay then remove
    overlay.classList.add("is-done");
    setTimeout(() => overlay.remove(), 400);

    const filePath = getDocPath();

    // Copy wikilink to clipboard via hidden textarea (navigator.clipboard requires
    // a direct user gesture which document-level mouseup doesn't satisfy in Tauri)
    const wikilink = `[[${filePath}#page=${pageNum}&rect=${rect.x1},${rect.y1},${rect.x2},${rect.y2}]]`;
    copyToClipboard(wikilink);

    // Notify the app to show a toast
    window.dispatchEvent(new CustomEvent("azprose:pdf-region-copied"));

    onSelected({ filePath, page: pageNum, ...rect });
  }

  viewportEl.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  return () => {
    viewportEl.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    selection?.overlay.remove();
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
