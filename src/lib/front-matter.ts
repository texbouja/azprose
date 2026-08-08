/**
 * Front matter YAML — parsing PUR des métadonnées d'en-tête (`---…---`).
 * Module sans dépendance Svelte/Tauri : testable sous `bun test`.
 *
 * Parseur LÉGER volontairement : les métadonnées du front matter sont des
 * paires `clé: valeur` sur une ligne (title, subtitle, author, date, logo,
 * altlogo, …). N'importe quelle clé est préservée — le catalogue doc-meta
 * (fences ```meta) est une aide pour l'UI, pas une restriction ici.
 */

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface FrontMatter {
  meta: Record<string, string>;
  body: string;
  /** Number of lines the front matter occupies in the original source (0 if none). */
  fmLineCount: number;
}

export function parseFrontMatter(src: string): FrontMatter {
  const m = FM_RE.exec(src);
  if (!m) return { meta: {}, body: src, fmLineCount: 0 };

  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    // Strip optional surrounding quotes from value
    const raw = line.slice(colon + 1).trim();
    meta[key] = raw.replace(/^["']|["']$/g, "");
  }
  // Count lines consumed by the front matter block so that data-sline
  // values (relative to the body) can be shifted back to absolute
  // positions in the original source.
  const fmLineCount = (m[0].match(/\r?\n/g) || []).length;
  return { meta, body: src.slice(m[0].length), fmLineCount };
}
