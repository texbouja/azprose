// PDF export service — assembles a self-contained HTML document from the
// markdown render pipeline and sends it to the Rust backend.
// Rust selects the best system browser per platform, injects print
// parameters (Firefox profile prefs, Chrome --app mode), and opens the
// native print dialog for the user to fine-tune paper size, margins, etc.

import { invoke } from "@tauri-apps/api/core";
import {
  renderMarkdown,
  ensurePreviewReady,
  postRenderDom,
  makeCalloutsCollapsible,
  updateCalloutIcons,
} from "@/markdown";
import {
  printSettings,
} from "@/stores/markdown-settings.svelte";
import { buildProseStyleCss } from "@/lib/prose-style-css";
import { calloutSettings, generateCalloutCss } from "@/stores/callout-settings.svelte";
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte";
import { getRootPath } from "@/stores/root-path.svelte";
import type { Theme } from "./theme";

// ── HTML assembly ────────────────────────────────────────────────────────────

// CSS typographique du document imprimé : source = la section « Printing »
// des réglages (`printSettings` — une copie indépendante de l'aperçu écran,
// décision « Printing »). Le builder pur (lib/prose-style-css.ts) produit les
// règles `.mdv-prose` ; le `customCss` utilisateur est ajouté tel quel.
function buildProseCss(): string {
  const s = printSettings.current;
  return buildProseStyleCss(s, ".mdv-prose") + (s.customCss.trim() ? "\n" + s.customCss.trim() : "");
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

export function buildMathJaxConfig(): string {
  const pkgs = mathJaxPackages.current;
  const loaderBlock = pkgs.length > 0
    ? `loader: { paths: { mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@4' }, load: [${pkgs.map(p => `'[tex]/${p}'`).join(', ')}] },`
    : `loader: { paths: { mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@4' } },`;
  const packagesBlock = pkgs.length > 0
    ? `packages: { '[+]': [${pkgs.map(p => `'${p}'`).join(', ')}] },`
    : '';
  return `
    window.MathJax = {
      ${loaderBlock}
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
        processEscapes: true,
        tags: 'ams',
        ${packagesBlock}
      },
      svg: { fontCache: 'global' },
      startup: { typeset: true },
      // V4 active les extensions a11y par défaut (contrairement à V3) : chaque
      // expression serait enrichie sémantiquement + dotée de speech/braille
      // (SRE) — gonflement massif du HTML sur les documents chargés en maths,
      // et coût de démarrage SRE inutile pour l'impression. Miroir du bloc
      // déjà validé dans main.ts (app runtime) : les options enable* désactivent
      // les extensions dans les documents autonomes (pas de ui/menu chargé),
      // menuOptions.settings couvre le cas où le menu viendrait à exister.
      options: {
        enableEnrichment: false,
        enableSpeech: false,
        enableBraille: false,
        enableExplorer: false,
        enableComplexity: false,
        menuOptions: {
          settings: {
            enrich: false,
            speech: false,
            braille: false,
            assistiveMml: false,
          },
        },
      },
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

  // 3. Resolve local images → data URIs, PDF rect embeds, wikilink paths
  if (filePath) {
    await postRenderDom(tmp, { filePath, rootPath: rootPath ?? undefined });
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

  // Lifecycle script — waits for MathJax to finish, then signals readiness by
  // setting document.title to the marker polled by the headless Rust backend
  // (mdprinter.rs). No more window.print(): the PDF is produced by print_to_pdf.
  const lifecycleScript = `
<script>
(function() {
    function markReady() { document.title = "azprose-print-ready"; }
    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
        window.MathJax.startup.promise.then(function() {
            setTimeout(markReady, 600);
        }).catch(function() { markReady(); });
    } else {
        window.addEventListener('load', function() {
            setTimeout(markReady, 2000);
        });
    }
})();
<\/script>`;

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
<script src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js" async><\/script>
</head>
<body>
<div class="mdv-prose">
${preambleBlock}
${tmp.innerHTML}
</div>
${lifecycleScript}
</body>
</html>`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Export a markdown file to PDF via headless Chrome.
 * Assembles a self-contained HTML, asks the user for the destination with a
 * native save dialog, then delegates to the Rust backend which runs headless
 * print_to_pdf and writes the PDF directly to disk.
 *
 * DECISION UTILISATEUR : headless print_to_pdf — the --app + native print
 * dialog flow is gone; the page layout is decided by the app (A4 portrait,
 * @page CSS margins).
 *
 * Returns the output path, or null when the user cancelled the save dialog.
 */
export async function exportMarkdownPdf(
  src: string,
  theme: Theme,
  filePath: string,
): Promise<string | null> {
  const rootPath = getRootPath();
  const html = await assembleHtml(src, theme, filePath, rootPath);

  // La destination est choisie AVANT le rendu headless (le backend écrit le
  // PDF directement sur disque, plus de dialogue d'impression natif).
  const { save } = await import("@tauri-apps/plugin-dialog");
  const outputPath = await save({
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: filePath.replace(/\.md$/i, ".pdf"),
  });
  if (!outputPath) return null;

  await invoke("export_markdown_pdf", { html, outputPath, landscape: false, rootPath });
  return outputPath;
}
