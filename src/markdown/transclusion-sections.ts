import { slugify } from "./slugify";

/**
 * Extraction de sections/blocs pour les transclusions — module PUR partagé
 * entre transclusion.ts (transclusions `![[…]]` du preview) et print-expand.ts
 * (expansion `[[…]]` block-level à l'impression). Aucune dépendance Tauri :
 * testable sous bun.
 */

/**
 * Extrait une section : du heading ciblé (par slug) jusqu'au prochain heading
 * de niveau identique ou supérieur (inclus), ou EOF. Placeholder commentaire
 * si le heading est introuvable.
 */
export function extractSection(content: string, heading: string): string {
  const slug = slugify(heading);
  const lines = content.split("\n");

  // Find the heading line
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (m && slugify(m[2]) === slug) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start < 0) return `<!-- transclusion: heading "${heading}" not found -->`;

  // Find end: next heading at same or higher level
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) {
      return lines.slice(start, i).join("\n");
    }
  }
  return lines.slice(start).join("\n");
}

/**
 * Extrait un bloc référencé par ancre `^blockId` : de la ligne contenant
 * l'ancre (sans l'ancre elle-même) jusqu'au prochain heading ou EOF.
 * Placeholder commentaire si l'ancre est introuvable.
 */
export function extractBlock(content: string, blockId: string): string {
  const lines = content.split("\n");
  const anchor = `^${blockId}`;

  // Find the block marker
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(anchor)) {
      // Return from this line (minus the anchor) until next heading or EOF
      const text = lines[i].replace(new RegExp(`\\s*\\S*${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "").trimEnd();
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,6}\s+/.test(lines[j])) {
          return text + "\n" + lines.slice(i + 1, j).join("\n");
        }
      }
      return text + "\n" + lines.slice(i + 1).join("\n");
    }
  }
  return `<!-- transclusion: block ^${blockId} not found -->`;
}
