/**
 * Gabarits d'impression (Phase 3 — PrintOverlay) + logos front matter.
 *
 * Module PUR : pas d'import Svelte/Tauri — testable sous `bun test`.
 * Chaque gabarit = coquille HTML (variables `{{…}}` via le moteur
 * handout-layout) + CSS spécifique, ajouté APRÈS `buildPrintBaseCss`.
 *
 * Variables disponibles dans la coquille :
 *   {{content}} — HTML du document rendu (brut)
 *   {{title}}   — titre (basename sans extension, échappé)
 *   {{date}}    — date du jour (locale, échappé)
 *   {{logo}}    — src du logo (data URI / URL), invisible si absent
 *   {{altlogo}} — texte alternatif du logo (échappé)
 *
 * Le logo vient des métadonnées YAML du document (`logo:` dans le front
 * matter, `altlogo:` pour l'attribut alt) ; `resolveLogoValue` le résout en
 * data URI via un lecteur de fichier INJECTABLE (tests sans Tauri).
 */

import { renderTemplateText, escHtml, type TemplateResolve } from "@/lib/handout-layout";
import { imgMime, uint8ToBase64 } from "@/lib/image-uri";
import { dirname, joinPath } from "@/lib/paths-utils";

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
    html: `{{#if logo}}<div class="pl-logo"><img src="{{logo}}" alt="{{altlogo}}"></div>{{/if}}
<div class="mdv-prose">{{content}}</div>`,
    css: `
.pl-logo { margin-bottom: 14px; }
.pl-logo img { max-height: 64px; width: auto; }`,
  },
  course: {
    id: "course",
    labelKey: "settings.printTemplate.course",
    html: `
<div class="pl-cover">
  {{#if logo}}<img class="pl-cover__logo" src="{{logo}}" alt="{{altlogo}}">{{/if}}
  <h1 class="pl-cover__title">{{title}}</h1>
  <div class="pl-cover__date">{{date}}</div>
</div>
<div class="mdv-prose">{{content}}</div>`,
    css: `
.pl-cover { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
.pl-cover__logo { display: block; max-height: 64px; width: auto; margin: 0 0 10px 0; }
.pl-cover__title { margin: 0 0 4px 0; font-size: 24px; line-height: 1.2; }
.pl-cover__date { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
.mdv-prose h1:first-child { break-before: avoid; }`,
  },
  dense: {
    id: "dense",
    labelKey: "settings.printTemplate.dense",
    html: `{{#if logo}}<div class="pl-logo"><img src="{{logo}}" alt="{{altlogo}}"></div>{{/if}}
<div class="mdv-prose">{{content}}</div>`,
    css: `
.pl-logo { margin-bottom: 10px; }
.pl-logo img { max-height: 48px; width: auto; }
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

/** Contexte d'impression d'un gabarit (variables {{…}} résolues). */
export interface PrintTemplateContext {
  /** HTML du document rendu (inséré brut). */
  content: string;
  /** Titre (échappé). */
  title: string;
  /** Date du jour (échappée). */
  date: string;
  /** src du logo (data URI / URL / chemin résolu) — absent → invisible. */
  logo?: string | null;
  /** Texte alternatif du logo (échappé). */
  altlogo?: string | null;
}

/**
 * Résout la coquille d'un gabarit avec le contexte d'impression.
 * `content` est inséré brut (HTML du document) ; title/date/altlogo échappés ;
 * `logo` est échappé aussi (il est inséré dans l'attribut `src` — l'échappage
 * est inoffensif pour les data URI et correct pour les URL).
 */
export function renderPrintTemplate(
  template: PrintTemplate,
  ctx: PrintTemplateContext,
): string {
  const resolve: TemplateResolve = (name) => {
    switch (name) {
      case "content":
        return { value: ctx.content, raw: true };
      case "title":
        return { value: ctx.title, raw: false };
      case "date":
        return { value: ctx.date, raw: false };
      case "logo":
        return ctx.logo ? { value: ctx.logo, raw: false } : null;
      case "altlogo":
        return ctx.altlogo ? { value: ctx.altlogo, raw: false } : null;
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

// ── Résolution des logos (front matter) ──────────────────────────────────────

/** Lecteur de fichier image (injectable — les tests n'ont pas Tauri). */
export type ImageReader = (absPath: string) => Promise<Uint8Array>;

/**
 * Résout la valeur d'une métadonnée logo (chemin d'image) vers un `src`
 * d'image prêt pour `<img src>` :
 *  - vide/espaces → null (variable invisible dans le gabarit) ;
 *  - URL distante (http/https) ou data URI → pass-through tel quel ;
 *  - chemin local (absolu ou relatif au document) → data URI
 *    `data:<mime>;base64,…` via le lecteur injecté ;
 *  - fichier illisible ou lecture échouée → null (même sémantique qu'une
 *    variable non renseignée : jamais de `<img>` cassé à l'impression).
 */
export async function resolveLogoValue(
  value: string | undefined,
  filePath: string,
  readImage: ImageReader,
): Promise<string | null> {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^(https?:\/\/|data:)/i.test(v)) return v;

  const abs = v.startsWith("/") ? v : joinPath(dirname(filePath), v);
  try {
    const bytes = await readImage(abs);
    if (!bytes.byteLength) return null;
    const dot = abs.lastIndexOf(".");
    const ext = dot >= 0 ? abs.slice(dot + 1) : "";
    return `data:${imgMime(ext)};base64,${uint8ToBase64(bytes)}`;
  } catch {
    return null;
  }
}

export { escHtml };
