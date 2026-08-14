import MarkdownIt from "markdown-it";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";
import mark from "markdown-it-mark";
import taskLists from "markdown-it-task-lists";
import callouts from "markdown-it-obsidian-callouts";
import footnote from "markdown-it-footnote";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Theme } from "@/lib/theme";
import { wikilinkPlugin } from "./wikilinks";
import { resolveTransclusions, type TransclusionRange } from "./transclusion";
import { shiftRangesToSource, unshiftTransclusionLine } from "./transclusion-lines";
import type { CalloutDef } from "@/stores/callout-settings.svelte";
import { slugify } from "./slugify";
import { stripColleSeparators } from "@/colles";
import { DOC_FIELD_LABELS, DOC_TYPE_HINTS, DOC_TYPE_LABELS, parseMetaFence, type DocType } from "@/lib/doc-meta";
import { parseFrontMatter } from "@/lib/front-matter";
import { renderBodyTemplates, templateDocSource } from "@/lib/doc-template";
import { imgMime, uint8ToBase64 } from "@/lib/image-uri";
// Infrastructure Shiki + échappement HTML : EXTRAITE dans highlight.ts
// (partagée avec le pipeline chat sans les imports lourds d'ici). Le plugin
// math vit dans math-plugin.ts, même motif.
import {
  escapeAttr,
  escapeHtml,
  getHighlighter,
  prepareShiki,
  shikiFence,
} from "./highlight";
import { mathPlugin } from "./math-plugin";

export { escapeAttr, escapeHtml };

const CHEVRON_ICON = `<path d="m9 18 6-6-6-6"/>`;
const DIAMOND_ICON = `<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/>`;
// html: true — pass raw HTML blocks through, consistent with ProseMark's htmlBlockExtension.
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight: (code, lang) => shikiFence(code, lang),
});

md.use(taskLists, { enabled: false, label: true });
md.use(mark);
md.use(mathPlugin);
md.use(wikilinkPlugin);

// Callout icons: mutable reference — updated by updateCalloutIcons() before each render.
const calloutOptions = { icons: {} as Record<string, string> };
md.use(callouts, calloutOptions);

md.use(footnote);

// ── Fences de métadonnées (```meta / ```colle) — carte d'en-tête lisible ────

/**
 * Carte d'en-tête d'un fence de métadonnées. Les libellés viennent du
 * registre UNIQUE `DOC_FIELD_LABELS` (doc-meta) — l'ancienne distinction
 * meta/colle est supprimée ; les champs absents sont simplement filtrés.
 */
function renderMetaPlaceholder(index: number, type: DocType, meta: Record<string, string>): string {
  const metaJson = escapeAttr(JSON.stringify(meta));
  const hint = DOC_TYPE_HINTS[type]
    ? `<p class="colle-block__hint">${escapeHtml(DOC_TYPE_HINTS[type])}</p>`
    : "";
  const fields = DOC_FIELD_LABELS
    .filter(([k]) => meta[k] != null && meta[k] !== "")
    .map(([k, label]) => {
      const v = meta[k];
      return (
        `<span class="colle-block__field">` +
        `<span class="colle-block__label">${escapeHtml(label)}</span>` +
        `<span class="colle-block__value">${escapeHtml(v)}</span>` +
        `</span>`
      );
    })
    .join("");
  return (
    `<div class="colle-block" data-colle-index="${index}" data-colle-meta="${metaJson}">` +
    `<div class="colle-block__head">` +
    `<span class="colle-block__badge">${escapeHtml(DOC_TYPE_LABELS[type])}</span>${fields}` +
    `</div>` +
    hint +
    `</div>`
  );
}

// Fenced code blocks — Shiki highlighting
md.renderer.rules.fence = ((tokens, idx, _options, env, _self) => {
  const token = tokens[idx];
  const lang = (token.info.trim().split(/\s+/)[0]) || "text";

  // ```colle / ```meta — métadonnées YAML → carte d'en-tête lisible. Un fence
  // ```colle est une SPÉCIALISATION de ```meta (type forcé "colle").
  if (lang === "colle" || lang === "meta") {
    const fence = parseMetaFence(lang, token.content);
    const rEnv = env as Record<string, unknown>;
    const pIndex = (rEnv.colleIndex as number) ?? 0;
    rEnv.colleIndex = pIndex + 1;
    return renderMetaPlaceholder(pIndex, fence.type, fence.meta);
  }

  return shikiFence(token.content, lang);
}) as RenderRule;

// Stamp block tokens with source line range for potential editor↔preview sync.
// `fmOffset` (front matter line count) is injected via `state.env` by `renderMarkdown`.
md.core.ruler.push("source_lines", (state) => {
  const fmOffset: number = (state.env as any).fmOffset ?? 0;
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1) {
      token.attrSet("data-sline", String(token.map[0] + fmOffset));
      token.attrSet("data-eline", String(token.map[1] + fmOffset));
    }
  }
  return true;
});

// GitHub-style heading anchors.
md.renderer.rules.heading_open = ((tokens, idx, options, _env, self) => {
  const inline = tokens[idx + 1];
  if (inline?.type === "inline") {
    const id = slugify(inline.content);
    if (id) tokens[idx].attrSet("id", id);
  }
  return self.renderToken(tokens, idx, options);
}) as RenderRule;

export async function ensurePreviewReady(): Promise<void> {
  await getHighlighter();
}

// ── YAML front matter ──────────────────────────────────────────────────────
// Le parsing vit dans src/lib/front-matter.ts (module PUR testable) ;
// renderMarkdown n'en retient que l'en-tête lisible et le décalage de lignes.

function renderFrontMatterHeader(meta: Record<string, string>): string {
  const { title, subtitle, author, date } = meta;
  if (!title && !author && !date) return "";

  let html = `<header class="mdv-fm">`;
  if (title)    html += `<h1 class="mdv-fm__title">${escapeHtml(title)}</h1>`;
  if (subtitle) html += `<p class="mdv-fm__subtitle">${escapeHtml(subtitle)}</p>`;
  if (author || date) {
    html += `<p class="mdv-fm__byline">`;
    if (author) html += `<span class="mdv-fm__author">${escapeHtml(author)}</span>`;
    if (author && date) html += `<span class="mdv-fm__sep" aria-hidden="true"> · </span>`;
    if (date)   html += `<time class="mdv-fm__date">${escapeHtml(date)}</time>`;
    html += `</p>`;
  }
  html += `</header>`;
  return html;
}

export interface RenderResult {
  html: string;
  ranges: TransclusionRange[];
}

/** Update callout icons from definitions — mutate shared object before each render. */
export function updateCalloutIcons(defs: CalloutDef[]): void {
  for (const def of defs) {
    calloutOptions.icons[def.name] =
      `<span class="callout-type-label">${escapeHtml(def.label)}</span>`;
  }
}

export async function renderMarkdown(
  src: string,
  theme: Theme,
  filePath?: string,
  rootPath?: string,
): Promise<RenderResult> {
  const { meta, values, body, fmLineCount } = parseFrontMatter(src);
  // Templating AU RENDU : les variables YAML du front-matter (`{{var}}`,
  // blocs `{{#if}}`/`{{#each}}`) sont résolues dans le corps à chaque rendu —
  // modifier le front-matter change le rendu, la source .md n'est jamais
  // écrite. Les fences de code sont sautés (code verbatim).
  let content = renderBodyTemplates(body, values);
  const ranges: TransclusionRange[] = [];

  // Resolve ![[file]] transclusions before markdown-it rendering. Les
  // `{{var}}` d'un fichier transclu se résolvent d'abord avec les valeurs du
  // FICHIER MAÎTRE, en repli avec celles du fichier transclu.
  if (filePath) {
    content = await resolveTransclusions(
      content, filePath, 0, new Set(), rootPath, ranges, undefined, undefined,
      (s) => templateDocSource(s, values),
    );
  }
  // Ranges are computed in BODY coordinates (front matter already stripped);
  // data-sline is stamped in ORIGINAL source coordinates (map[0] + fmOffset).
  // Align them so markTranscludedBlocks can compare and unshift correctly.
  shiftRangesToSource(ranges, fmLineCount);

  await prepareShiki(content, theme);
  // Les `---` structurels des colles (annonce de section + séparateurs de
  // planches) ne doivent pas devenir des `<hr>` dans le rendu HTML.
  const rendered = stripColleSeparators(content);
  const html = renderFrontMatterHeader(meta) + md.render(rendered, { fmOffset: fmLineCount });
  return { html, ranges };
}

// Le pipeline « chat » (panneau agent) vit dans chat-render.ts — même
// infrastructure (highlight.ts, math-plugin.ts), sans les imports lourds
// d'ici, pour rester testable sous bun.

// ── Post-render DOM helpers ────────────────────────────────────────────────
// `imgMime`/`uint8ToBase64` vivent dans src/lib/image-uri.ts (PUR partagé
// avec les gabarits d'impression — resolveLogoValue).

// Resolve relative image paths to data URIs so Tauri's WebView can display them.
/** Inline local images as data URLs. Returns the relative srcs that couldn't be
 *  resolved (missing files) so callers can surface them as diagnostics. */
export async function resolveLocalImages(article: HTMLElement, filePath: string): Promise<string[]> {
  const lastSep = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  const dir = filePath.slice(0, lastSep);
  const sep = filePath.includes("\\") ? "\\" : "/";
  const broken: string[] = [];
  await Promise.all(
    Array.from(article.querySelectorAll("img")).map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || /^(?:https?:|data:|tauri:|asset:)/.test(src)) return;
      const decoded = decodeURIComponent(src.startsWith("./") ? src.slice(2) : src);
      const absPath = dir + sep + decoded.replace(/\//g, sep);
      const dot = decoded.lastIndexOf(".");
      const ext = dot >= 0 ? decoded.slice(dot + 1) : "png";
      try {
        const bytes = await readFile(absPath);
        img.src = `data:${imgMime(ext)};base64,${uint8ToBase64(bytes)}`;
      } catch {
        broken.push(src); // missing file — leave src as-is, report it
      }
    }),
  );
  return broken;
}

/**
 * Post-render: walk elements with data-sline and check if they fall within
 * a transclusion range. If so, replace data-sline/data-eline with
 * data-transcluded-from + data-transcluded-line so double-click opens the
 * original source file at the correct line.
 *
 * Ranges are in ORIGINAL source coordinates (renderMarkdown shifted them by
 * the front matter line count). Host blocks BELOW a range keep a data-sline
 * shifted by the expansion ((end - start - 1) extra lines per range) — those
 * are unshifted back to the true raw source line so inverse sync and the
 * [data-sline] queries land on the right line even after a ![[…]].
 */
export function markTranscludedBlocks(article: HTMLElement, ranges: TransclusionRange[]): void {
  if (ranges.length === 0) return;
  const els = article.querySelectorAll<HTMLElement>("[data-sline]");
  for (const el of els) {
    const line = Number(el.dataset.sline);
    if (!Number.isFinite(line)) continue;
    const range = ranges.find(r => line >= r.startLine && line < r.endLine);
    if (range) {
      el.removeAttribute("data-sline");
      el.removeAttribute("data-eline");
      el.setAttribute("data-transcluded-from", range.filePath);
      el.setAttribute("data-transcluded-line", String(line - range.startLine));
      continue;
    }
    // Host block at or below the first expansion — unshift the stamped lines.
    if (line >= ranges[0].startLine) {
      const adjusted = unshiftTransclusionLine(line, ranges);
      if (adjusted !== line) {
        el.setAttribute("data-sline", String(adjusted));
        const eLine = Number(el.dataset.eline);
        if (Number.isFinite(eLine)) {
          el.setAttribute("data-eline", String(unshiftTransclusionLine(eLine, ranges)));
        }
      }
    }
  }
}

const COPY_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

export function decorateCodeBlocks(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  root.querySelectorAll<HTMLPreElement>("pre.shiki").forEach((pre) => {
    if (pre.parentElement?.classList.contains("mdv-codeblock")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "mdv-codeblock";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mdv-copy";
    btn.setAttribute("aria-label", "copier le code");
    btn.innerHTML =
      `<span class="mdv-copy__icon mdv-copy__icon--default">${COPY_ICON}copier</span>` +
      `<span class="mdv-copy__icon mdv-copy__icon--done">${CHECK_ICON}copié</span>`;
    wrapper.appendChild(btn);

    const onClick = async () => {
      try { await navigator.clipboard.writeText(pre.textContent ?? ""); } catch { /* ignore */ }
      btn.classList.add("is-done");
      window.setTimeout(() => btn.classList.remove("is-done"), 1400);
    };
    btn.addEventListener("click", onClick);
    cleanups.push(() => btn.removeEventListener("click", onClick));
  });
  return () => cleanups.forEach((fn) => fn());
}

/**
 * Post-render: strip auto-generated callout titles.
 * If the title text matches the default for its type (e.g. "Note" for [!note]),
 * it is removed so the user only sees manually-titled callouts.
 */
export function stripAutoCalloutTitles(container: HTMLElement): void {
  for (const el of container.querySelectorAll<HTMLElement>(".callout")) {
    const inner = el.querySelector<HTMLElement>(".callout-title-inner");
    if (!inner) continue;
    const type = el.dataset.callout ?? "";
    const auto = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    if (inner.textContent?.trim() === auto) inner.textContent = "";
  }
}

/** Build the right-side chevron SVG shown on every collapsible callout. */
function createCalloutChevron(): SVGSVGElement {
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("class", "callout-chevron");
  chevron.setAttribute("width", "16");
  chevron.setAttribute("height", "16");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("fill", "none");
  chevron.setAttribute("stroke", "currentColor");
  chevron.setAttribute("stroke-width", "2");
  chevron.setAttribute("stroke-linecap", "round");
  chevron.setAttribute("stroke-linejoin", "round");
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = CHEVRON_ICON;
  return chevron;
}

/**
 * Post-render: make EVERY callout collapsible with a chevron on the right,
 * matching the Obsidian convention (all callouts fold on a title click; the
 * `+`/`-` fold marker only sets the default state).
 *
 * 1. Convert plain `<div class="callout">` (no fold marker) into
 *    `<details open>`.
 * 2. Callouts written with a fold marker (`[!note]+` / `[!note]-`) are already
 *    rendered as `<details>` by markdown-it-obsidian-callouts — give their
 *    empty `<div class="callout-fold">` the same chevron.
 */
export function makeCalloutsCollapsible(article: HTMLElement): void {
  const divs = article.querySelectorAll<HTMLDivElement>("div.callout");
  for (const div of divs) {
    const title = div.querySelector<HTMLElement>(":scope > .callout-title");
    const content = div.querySelector<HTMLElement>(":scope > .callout-content");
    if (!title || !content) continue;

    const details = document.createElement("details");
    details.className = div.className;
    for (const attr of div.attributes) {
      details.setAttribute(attr.name, attr.value);
    }
    details.open = true;

    const summary = document.createElement("summary");
    summary.className = title.className;
    for (const child of Array.from(title.childNodes)) {
      summary.appendChild(child);
    }

    // Insert diamond separator before .callout-type-label
    const iconWrap = summary.querySelector<HTMLElement>(".callout-title-icon");
    const label = iconWrap?.querySelector<HTMLElement>(".callout-type-label");
    if (iconWrap && label) {
      const diamond = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      diamond.setAttribute("class", "callout-diamond");
      diamond.setAttribute("width", "0.55em");
      diamond.setAttribute("height", "0.55em");
      diamond.setAttribute("viewBox", "0 0 24 24");
      diamond.setAttribute("fill", "none");
      diamond.setAttribute("stroke", "currentColor");
      diamond.setAttribute("stroke-width", "2");
      diamond.setAttribute("stroke-linecap", "round");
      diamond.setAttribute("stroke-linejoin", "round");
      diamond.setAttribute("aria-hidden", "true");
      diamond.innerHTML = DIAMOND_ICON;
      iconWrap.insertBefore(diamond, label);
    }

    summary.appendChild(createCalloutChevron());

    details.appendChild(summary);
    details.appendChild(content);
    div.replaceWith(details);
  }

  // Fold-marker callouts ([!name]+ / [!name]-): the plugin leaves an empty
  // `.callout-fold` div in the summary — swap it for the chevron. The divs
  // converted above already carry one (guard skips them).
  const details = article.querySelectorAll<HTMLDetailsElement>("details.callout");
  for (const det of details) {
    const summary = det.querySelector<HTMLElement>(":scope > summary");
    if (!summary || summary.querySelector(".callout-chevron")) continue;
    const fold = summary.querySelector<HTMLElement>(":scope > .callout-fold");
    const chevron = createCalloutChevron();
    if (fold) {
      fold.replaceWith(chevron);
    } else {
      summary.appendChild(chevron);
    }
  }
}
