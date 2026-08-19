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
import { resolveFontFamily } from "@/lib/font-resolvers";
import { renderMermaidBlocks, type ApparenceDiagramme } from "@/lib/mermaid-render";
import { calloutSettings, generateCalloutCss } from "@/stores/callout-settings.svelte";
import {
  mathJaxPreamble,
  mathJaxPackages,
  mathJaxFont,
  mathJaxSpacing,
} from "@/stores/mathjax-preamble.svelte";
import { nomInterne } from "@/lib/mathjax-font";
import { cssEspacementMaths } from "@/lib/mathjax-spacing";
import { getRootPath } from "@/stores/root-path.svelte";
import { expandWikilinksForPrint } from "@/markdown/print-expand";
import type { Theme } from "./theme";
import {
  buildPrintBaseCss,
  buildPrintCdpOptions,
  DEFAULT_PRINT_REQUEST,
  type PrintRequest,
} from "@/lib/print-request";
import { getPrintTemplate, renderPrintTemplate, printTitleFromPath, resolveLogoValue } from "@/lib/print-templates";
import { assemblePrintDocument, PRINT_READY_TITLE } from "@/printing/core/document";
import { parseFrontMatter } from "@/lib/front-matter";
import { readFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog"; // statique : déjà eager (app.svelte)

// ── HTML assembly ────────────────────────────────────────────────────────────

// CSS typographique du document imprimé : source = la section « Printing »
// des réglages (`printSettings` — une copie indépendante de l'aperçu écran,
// décision « Printing »). Le builder pur (lib/prose-style-css.ts) produit les
// règles `.mdv-prose` ; le `customCss` utilisateur est ajouté tel quel.
function buildProseCss(): string {
  const s = printSettings.current;
  return buildProseStyleCss(s, ".mdv-prose") + (s.customCss.trim() ? "\n" + s.customCss.trim() : "");
}

function buildPrintCss(req: PrintRequest): string {
  return [
    buildPrintBaseCss(req),
    DIAGRAM_PRINT_CSS,
    // Le document imprimé ne reprend pas `preview.css` : l'espace autour des
    // formules hors texte s'y écrit à partir du même réglage, sans quoi le
    // papier et l'écran ne s'accorderaient pas.
    cssEspacementMaths(mathJaxSpacing.current),
  ].join("\n");
}

/**
 * Style des diagrammes sur le papier.
 *
 * Le document imprimé ne reprend PAS `preview.css` (il se construit à partir
 * des réglages d'impression) : le peu de style nécessaire vit donc ici. Sans
 * cadre ni fond — un encadré à l'écran signale une zone interactive, sur le
 * papier il n'ajoute que de l'encre — et surtout jamais coupé entre deux pages.
 */
const DIAGRAM_PRINT_CSS = `
.mdv-mermaid{margin:1em 0;padding:0;border:0;background:none;text-align:center;break-inside:avoid;page-break-inside:avoid;}
.mdv-mermaid svg{max-width:100%;height:auto;}
.mdv-mermaid__source{margin:0;font-family:monospace;font-size:.85em;text-align:left;white-space:pre-wrap;}
.mdv-mermaid__error{margin:0 0 .5em;font-size:.85em;text-align:left;}
/* Libellés : du HTML dans un \`<foreignObject>\`, donc soumis aux marges de
   paragraphe de \`.mdv-prose\` — elles décalent le contenu dans une boîte que
   Mermaid a dimensionnée sans elles. Miroir de \`preview.css\`, qui n'est pas
   repris ici. */
.mdv-mermaid foreignObject p,.mdv-mermaid foreignObject div,.mdv-mermaid foreignObject span{margin:0;padding:0;}
.mdv-mermaid foreignObject svg{margin:0;}
.mdv-mermaid foreignObject{overflow:visible;}
`;

/**
 * Apparence des diagrammes à l'impression.
 *
 * Thème INTÉGRÉ clair, jamais la palette de l'application : la sortie va sur
 * du papier blanc, où un thème sombre donnerait des aplats d'encre illisibles.
 * Les polices suivent en revanche les réglages d'impression, pour que les
 * diagrammes s'accordent au texte du document.
 */
function apparenceImpression(): ApparenceDiagramme {
  const s = printSettings.current;
  return {
    mode: "default",
    fontFamily: resolveFontFamily(s.fontFamily, s.customFontName),
    fontSize: `${s.fontSize}px`,
    couleurs: null,
  };
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
      // Police mathématique : le script chargé est la variante \`-nofont\`, donc
      // cette ligne n'est PAS facultative — sans elle le document n'a aucune
      // police. Elle suit le réglage de l'application, ce qui accorde le papier
      // à l'écran.
      output: { font: '${nomInterne(mathJaxFont.current)}' },
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
  req: PrintRequest,
): Promise<string> {
  await ensurePreviewReady();

  // 1. Render markdown → HTML
  updateCalloutIcons(calloutSettings.current);
  // 1b. (Phase 4, chantier 4) Wikilinks block-level → transclusions récursives.
  //     L'expansion produit des `![[…]]` que `resolveTransclusions` traite dans
  //     `renderMarkdown`. Jamais appliquée au preview normal (défaut off).
  if (req.expandLinks) src = expandWikilinksForPrint(src);
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

  // 3b. Diagrammes composés ICI, en SVG inliné dans le document.
  //     Contrairement à MathJax — chargé depuis un CDN par la coquille — le
  //     document imprimé ne dépend d'aucun réseau pour ses diagrammes : le SVG
  //     est déjà là. C'est ce qui permet d'imprimer hors ligne.
  await renderMermaidBlocks(tmp, apparenceImpression());

  // 4. Build <base> href from file directory
  const lastSep = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dir = filePath.slice(0, lastSep);
  const baseUrl = `file://${dir}/`;

  // 5. Coquille du gabarit d'impression (variables {{content}}/{{title}}/{{date}}
  //    + {{logo}}/{{altlogo}} issus du front matter YAML du document)
  const template = getPrintTemplate(req.template);
  const title = printTitleFromPath(filePath);
  const date = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  // logo = chemin d'image → data URI (relatif au document, absolu, URL ou
  // data URI — `resolveLogoValue` gère les 4, lecteur Tauri injecté).
  // altlogo = simple texte alternatif, jamais résolu comme une image.
  const fm = parseFrontMatter(src);
  const logo = await resolveLogoValue(fm.meta.logo, filePath, readFile);
  const altlogo = (fm.meta.altlogo ?? "").trim() || null;
  // `fm.values` expose TOUTES les variables YAML du front-matter à la coquille
  // (sauf `type` et booléens — règles du moteur de templating).
  const body = renderPrintTemplate(template, { content: tmp.innerHTML, title, date, logo, altlogo }, fm.values);

  // 6. Assemble — squelette commun du noyau printing (head CSS + MathJax CDN
  //    + préambule + lifecycle), marqueur `azprose-print-ready`.
  const proseCss = buildProseCss();
  const calloutBaseCss = buildCalloutBaseCss();
  const calloutDynCss = generateCalloutCss(calloutSettings.current);
  const printCss = buildPrintCss(req) + "\n" + template.css;
  const mathjaxConfig = buildMathJaxConfig();
  const preamble = mathJaxPreamble.current.trim();

  return assemblePrintDocument({
    baseHref: baseUrl,
    cssBlocks: [proseCss, calloutBaseCss, calloutDynCss, printCss],
    mathjaxConfig,
    mathjaxCdn: true,
    body,
    preamble,
    readyMarker: PRINT_READY_TITLE,
  });
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
 * Phase 3 : `req` décrit la mise en page complète (papier, orientation,
 * marges, gabarit, colonnes, entête/pied, échelle). Il est converti en
 * options CDP (pouces) par `buildPrintCdpOptions` et transmis au backend
 * qui applique `print_to_cdp` (serde camelCase → `PrintOptions`).
 *
 * Returns the output path, or null when the user cancelled the save dialog.
 */
export async function exportMarkdownPdf(
  src: string,
  theme: Theme,
  filePath: string,
  req: PrintRequest = DEFAULT_PRINT_REQUEST,
): Promise<string | null> {
  const rootPath = getRootPath();
  const html = await assembleHtml(src, theme, filePath, rootPath, req);

  // La destination est choisie AVANT le rendu headless (le backend écrit le
  // PDF directement sur disque, plus de dialogue d'impression natif).
  const outputPath = await save({
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: filePath.replace(/\.md$/i, ".pdf"),
  });
  if (!outputPath) return null;

  await invoke("export_markdown_pdf", {
    html,
    outputPath,
    rootPath,
    options: buildPrintCdpOptions(req),
  });
  return outputPath;
}

/**
 * Aperçu avant impression (décision §3.4 de next_level.md) : assemble le
 * MÊME document HTML que l'export (mêmes réglages `req`) et l'affiche dans
 * une FENÊTRE Chromium VISIBLE via la commande Rust `preview_print` —
 * browser non-headless DÉDIÉ (séparé du browser headless partagé).
 *
 * Le backend écrit le HTML dans `.azprose/tmp/print-preview-<ts>.html` (le
 * cache du vault) et ne le supprime PAS — l'aperçu reste consultable. La
 * fenêtre reste ouverte après le retour ; sa fermeture libère la connexion
 * (le prochain aperçu rouvre une fenêtre).
 *
 * Returns the path to the preview HTML file written in the vault cache.
 */
export async function previewMarkdownPdf(
  src: string,
  theme: Theme,
  filePath: string,
  req: PrintRequest = DEFAULT_PRINT_REQUEST,
): Promise<string> {
  const rootPath = getRootPath();
  const html = await assembleHtml(src, theme, filePath, rootPath, req);
  return await invoke<string>("preview_print", { html, rootPath });
}
