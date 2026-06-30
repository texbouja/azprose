// Turn non-fatal Markdown render problems (failed MathJax formulas, missing local
// images) into Diagnostics for the console. Shared by Preview and Presentation.
import type { Diagnostic } from "./diagnostics";
import { diagnosticsStore } from "@/stores/diagnostics.svelte";

/**
 * Scan a freshly rendered article for MathJax errors, combine with the list of
 * unresolved image srcs, and publish to the diagnostics store under the
 * "mathjax" and "image" sources (each call replaces the previous render's set).
 */
export function collectRenderDiagnostics(el: HTMLElement, brokenImages: string[]): void {
  const mathjax: Diagnostic[] = [];
  el.querySelectorAll("mjx-merror, [data-mjx-error]").forEach((m) => {
    const msg =
      m.getAttribute("data-mjx-error") ||
      (m as HTMLElement).title ||
      (m.textContent ?? "").trim() ||
      "formule invalide";
    mathjax.push({ severity: "error", message: msg });
  });
  diagnosticsStore.set("mathjax", mathjax);
  diagnosticsStore.set(
    "image",
    brokenImages.map((src) => ({ severity: "warning" as const, message: `image introuvable : ${src}` })),
  );
}

/** Drop render diagnostics — call on unmount / when leaving preview & presentation. */
export function clearRenderDiagnostics(): void {
  diagnosticsStore.clear("mathjax");
  diagnosticsStore.clear("image");
}
