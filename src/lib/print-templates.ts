/**
 * Gabarits d'impression (Phase 3 — PrintOverlay).
 *
 * Module PUR : pas d'import Svelte/Tauri — testable sous `bun test`.
 * Chaque gabarit = coquille HTML (variables `{{…}}` via le moteur
 * handout-layout) + CSS spécifique, ajouté APRÈS `buildPrintBaseCss`.
 *
 * Variables disponibles dans la coquille :
 *   {{content}} — HTML du document rendu (brut)
 *   {{title}}   — titre (basename sans extension, échappé)
 *   {{date}}    — date du jour (locale, échappé)
 */

import { renderTemplateText, escHtml, type TemplateResolve } from "@/lib/handout-layout";

export interface PrintTemplate {
  id: string;
  /** Clé i18n du libellé (settings.printTemplate.*). */
  labelKey: string;
  /** Coquille HTML (placeholders {{…}}). */
  html: string;
  /** CSS spécifique ajouté après le CSS de base. */
  css: string;
}

export const PRINT_TEMPLATES: Record<string, PrintTemplate> = {
  simple: {
    id: "simple",
    labelKey: "settings.printTemplate.simple",
    html: `<div class="mdv-prose">{{content}}</div>`,
    css: ``,
  },
  course: {
    id: "course",
    labelKey: "settings.printTemplate.course",
    html: `
<div class="pl-cover">
  <h1 class="pl-cover__title">{{title}}</h1>
  <div class="pl-cover__date">{{date}}</div>
</div>
<div class="mdv-prose">{{content}}</div>`,
    css: `
.pl-cover { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
.pl-cover__title { margin: 0 0 4px 0; font-size: 24px; line-height: 1.2; }
.pl-cover__date { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
.mdv-prose h1:first-child { break-before: avoid; }`,
  },
  dense: {
    id: "dense",
    labelKey: "settings.printTemplate.dense",
    html: `<div class="mdv-prose">{{content}}</div>`,
    css: `
.mdv-prose { font-size: 11px; line-height: 1.45; }
.mdv-prose h1 { font-size: 18px; }
.mdv-prose h2 { font-size: 15px; }
.mdv-prose h3 { font-size: 13px; }
.mdv-prose p { margin: 0 0 0.45em 0; }
.mdv-prose ul, .mdv-prose ol { margin: 0 0 0.45em 0; }
.mdv-prose li { margin: 0 0 0.15em 0; }
.mdv-prose pre, .mdv-prose blockquote, .mdv-prose table { margin: 0 0 0.6em 0; }`,
  },
};

export function getPrintTemplate(id: string): PrintTemplate {
  return PRINT_TEMPLATES[id] ?? PRINT_TEMPLATES.simple;
}

/**
 * Résout la coquille d'un gabarit avec le contexte d'impression.
 * `content` est inséré brut (HTML du document) ; title/date échappés.
 */
export function renderPrintTemplate(
  template: PrintTemplate,
  ctx: { content: string; title: string; date: string },
): string {
  const resolve: TemplateResolve = (name) => {
    switch (name) {
      case "content":
        return { value: ctx.content, raw: true };
      case "title":
        return { value: ctx.title, raw: false };
      case "date":
        return { value: ctx.date, raw: false };
      default:
        return null;
    }
  };
  return renderTemplateText(template.html, resolve);
}

/** Titre d'impression par défaut : basename sans extension. */
export function printTitleFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.[^.]+$/, "");
}

export { escHtml };
