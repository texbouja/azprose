// PDF export service — assembles a self-contained HTML document from the
// markdown render pipeline and sends it to the Rust backend.
// Chromium opens a visible window with the rendered content and the native
// print dialog, letting the user fine-tune paper size, margins, etc.

import { invoke } from "@tauri-apps/api/core";
import {
  renderMarkdown,
  ensurePreviewReady,
  resolveLocalImages,
  makeCalloutsCollapsible,
  updateCalloutIcons,
} from "@/markdown";
import {
  previewSettings,
  resolveFontFamily,
  resolveMonoFont,
} from "@/stores/markdown-settings.svelte";
import { calloutSettings, generateCalloutCss } from "@/stores/callout-settings.svelte";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { getRootPath } from "@/stores/root-path.svelte";
import type { Theme } from "./theme";

// ── HTML assembly ────────────────────────────────────────────────────────────

function buildProseCss(): string {
  const s = previewSettings.current;
  const fontFamily = resolveFontFamily(s.fontFamily, s.customFontName);
  const monoFont = resolveMonoFont(s.monoFont);
  const heading = (n: 1 | 2 | 3) => {
    const size = s[`h${n}Size`] as number;
    const align = s[`h${n}Align`] as string;
    const mt = s[`h${n}MarginTop`] as number;
    const mb = s[`h${n}MarginBottom`] as number;
    return `.mdv-prose h${n}{font-size:${size}em;text-align:${align};margin:${mt}em 0 ${mb}em;}`;
  };
  return [
    `.mdv-prose{font-family:${fontFamily};font-size:${s.fontSize}px;line-height:${s.lineHeight};max-width:${s.maxWidth}px;}`,
    `.mdv-prose code,.mdv-prose pre{font-family:${monoFont};}`,
    heading(1), heading(2), heading(3),
    `.mdv-prose ol{list-style-type:${s.olLevel1};}`,
    `.mdv-prose ol ol{list-style-type:${s.olLevel2};}`,
    `.mdv-prose ol ol ol{list-style-type:${s.olLevel3};}`,
  ].join("\n");
}

function buildPrintCss(): string {
  return `
    @page { margin: 32px 48px; }
    body { background: #fff; color: #000; margin: 0; padding: 0; }
    .mdv-prose { max-width: 100%; }
    .mdv-prose h1 { break-before: page; break-after: avoid; }
    .mdv-prose h1:first-child { break-before: avoid; }
    .mdv-prose h2, .mdv-prose h3 { break-after: avoid; }
    .mdv-prose pre, .mdv-prose table, .mdv-prose figure, .mdv-prose img { break-inside: avoid; }
    .mdv-prose p, .mdv-prose li { orphans: 3; widows: 3; }
    .mdv-prose a { color: #0a4d8c; }
    .mdv-prose details.callout { display: block !important; }
    .mdv-prose details.callout > summary { list-style: none; cursor: default; }
    .mdv-prose details.callout > summary::-webkit-details-marker { display: none; }
    .mdv-prose details.callout .callout-chevron { display: none !important; }
    .mdv-prose details.callout[open] { display: block; }
  `;
}

function buildMathJaxConfig(): string {
  return `
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
        processEscapes: true,
        tags: 'ams',
      },
      svg: { fontCache: 'global' },
      startup: { typeset: true },
    };
  `;
}

function buildCalloutBaseCss(): string {
  return `
.mdv-prose { counter-reset: callout-num callout-ex; }
.mdv-prose .callout { border-radius: 8px; border: 1px solid #ccc; margin: 0 0 1em; overflow: hidden; }
.mdv-prose .callout .callout-title { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(0,0,0,0.04); font-weight: 600; font-size: 0.93em; cursor: default; }
.mdv-prose .callout .callout-title-icon { display: flex; align-items: center; }
.mdv-prose .callout .callout-title-icon svg { width: 16px; height: 16px; }
.mdv-prose .callout .callout-title-inner { flex: 1; }
.mdv-prose .callout .callout-content { padding: 8px 12px; }
.mdv-prose .callout .callout-content > :first-child { margin-top: 0; }
.mdv-prose .callout .callout-content > :last-child { margin-bottom: 0; }
.mdv-prose .callout[data-callout="note"]    { border-left: 3px solid #6b9eeb; }
.mdv-prose .callout[data-callout="tip"]     { border-left: 3px solid #72b886; }
.mdv-prose .callout[data-callout="success"] { border-left: 3px solid #72b886; }
.mdv-prose .callout[data-callout="warning"] { border-left: 3px solid #e6a94c; }
.mdv-prose .callout[data-callout="danger"]  { border-left: 3px solid #e06464; }
.mdv-prose .callout[data-callout="bug"]     { border-left: 3px solid #e06464; }
.mdv-prose .callout[data-callout="quote"]   { border-left: 3px solid #888; }
.mdv-prose .callout[data-callout="info"]    { border-left: 3px solid #6b9eeb; }
.mdv-prose .callout[data-callout="example"] { border-left: 3px solid #b496e6; }
.mdv-prose .callout[data-callout="todo"]    { border-left: 3px solid #e6a94c; }
.callout-type-label { font-size: 0.85em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.85; }
.callout-diamond { margin-right: 2px; flex-shrink: 0; vertical-align: middle; }
.mdv-prose details.callout > summary { list-style: none; display: flex; align-items: center; }
.mdv-prose details.callout > summary::-webkit-details-marker { display: none; }
.mdv-prose details.callout > summary::marker { display: none; content: ""; }
.mdv-prose .callout-chevron { margin-left: auto; transition: transform 150ms; }
.mdv-prose details.callout[open] > summary .callout-chevron { transform: rotate(90deg); }
`;
}

/**
 * Assemble a fully self-contained HTML document suitable for headless Chromium.
 * All CSS is inlined; images are data URIs; MathJax loaded from CDN.
 */
async function assembleHtml(
  src: string,
  theme: Theme,
  filePath: string,
  rootPath: string | null,
): Promise<string> {
  await ensurePreviewReady();

  // 1. Render markdown → HTML
  updateCalloutIcons(calloutSettings.current);
  const result = await renderMarkdown(src, theme, filePath, rootPath ?? undefined);

  // 2. Post-process callouts (strip auto-titles, make collapsible)
  const tmp = document.createElement("div");
  tmp.innerHTML = result.html;
  for (const el of tmp.querySelectorAll<HTMLElement>(".callout")) {
    const inner = el.querySelector<HTMLElement>(".callout-title-inner");
    if (!inner) continue;
    const type = el.dataset.callout ?? "";
    const auto = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    if (inner.textContent?.trim() === auto) inner.textContent = "";
  }
  makeCalloutsCollapsible(tmp);

  // 3. Resolve local images → data URIs
  if (filePath) {
    await resolveLocalImages(tmp, filePath);
  }

  // 4. Build <base> href from file directory
  const lastSep = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dir = filePath.slice(0, lastSep);
  const baseUrl = `file://${dir}/`;

  // 5. Assemble
  const proseCss = buildProseCss();
  const calloutBaseCss = buildCalloutBaseCss();
  const calloutDynCss = generateCalloutCss(calloutSettings.current);
  const printCss = buildPrintCss();
  const mathjaxConfig = buildMathJaxConfig();

  // Inject preamble as hidden display math — MathJax will process it during typesetting
  // and register the macros before processing the rest of the document.
  const preamble = mathJaxPreamble.current.trim();
  const preambleBlock = preamble
    ? `<div style="position:absolute;left:-9999px" aria-hidden="true">$$${preamble}$$</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<base href="${baseUrl}">
<style>
${proseCss}
${calloutBaseCss}
${calloutDynCss}
${printCss}
</style>
<script>
${mathjaxConfig}
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" async><\/script>
</head>
<body>
<div class="mdv-prose">
${preambleBlock}
${tmp.innerHTML}
</div>
<\/script>
</body>
</html>`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Export a markdown file to PDF via Chrome --app mode.
 * Opens a minimal Chrome window with the rendered HTML
 * and the native print dialog.
 */
export async function exportMarkdownPdf(
  src: string,
  theme: Theme,
  filePath: string,
): Promise<void> {
  const rootPath = getRootPath();
  const html = await assembleHtml(src, theme, filePath, rootPath);

  await invoke("export_markdown_pdf", { html });
}
