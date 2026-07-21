/**
 * Post-render: resolve PDF rect embed placeholders into images.
 *
 * Walks `.pdf-rect-embed` elements, renders the PDF rect to an image
 * via renderPdfRect(), and replaces with a clickable <a> + <img>.
 */

import { renderPdfRect } from "@/pdf/rect-render";
import { getFileIndex } from "@/lib/vault-index";

export async function resolvePdfRectEmbeds(
  article: HTMLElement,
  _currentFilePath: string,
  rootPath?: string,
): Promise<void> {
  const embeds = article.querySelectorAll<HTMLElement>(".pdf-rect-embed");
  if (embeds.length === 0) return;

  // Resolve PDF targets to full paths
  const index = rootPath ? await getFileIndex(rootPath) : null;

  for (const el of Array.from(embeds)) {
    const target = el.getAttribute("data-pdf-target");
    const pageStr = el.getAttribute("data-pdf-page");
    const rectStr = el.getAttribute("data-pdf-rect");
    const widthStr = el.getAttribute("data-pdf-width");

    if (!target || !rectStr) continue;

    const page = parseInt(pageStr ?? "") || 1;
    const parts = rectStr.split(",").map(Number);
    if (parts.length !== 4 || !parts.every(Number.isFinite)) continue;
    const rect = { x1: parts[0], y1: parts[1], x2: parts[2], y2: parts[3] };

    // Resolve absolute path
    let absPath = target;
    if (index) {
      const resolved = index.get(target);
      if (resolved) absPath = resolved;
    }

    // Render the rect to an image
    try {
      const dataUrl = await renderPdfRect(absPath, page, rect);

      // Build the clickable wrapper
      const anchor = document.createElement("a");
      anchor.className = "pdf-rect-link";
      anchor.href = "#";
      anchor.setAttribute("data-pdf-path", absPath);
      anchor.setAttribute("data-pdf-page", String(page));
      anchor.setAttribute("data-pdf-rect", rectStr);

      const img = document.createElement("img");
      img.className = "pdf-rect-img";
      img.src = dataUrl;
      img.alt = `${target} p.${page}`;

      // width parameter kept as data attribute for potential future use
      if (widthStr) {
        const w = parseInt(widthStr) || 0;
        if (w > 0) img.dataset.pdfWidth = String(w);
      }

      anchor.appendChild(img);
      el.replaceWith(anchor);
    } catch (err) {
      console.error("azprose: pdf rect render failed", target, page, rect, err);
      el.textContent = `[render error: ${target} p.${page}]`;
      el.className = "pdf-rect-error";
    }
  }
}
