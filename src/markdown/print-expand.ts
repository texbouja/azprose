/**
 * Expansion des wikilinks block-level pour l'impression (chantier 4).
 *
 * CONVENTION (décision utilisateur) : un `[[wikilink]]` simple n'est transclu
 * à l'impression QUE s'il est SEUL SUR SA LIGNE, encadré de lignes vides,
 * hors liste, hors fence (indentation 0-3 espaces tolérée). Au milieu d'un
 * paragraphe ou dans une liste, il reste une RÉFÉRENCE cliquable — jamais
 * une inclusion. Le positionnement syntaxique est le signal d'inclusion.
 *
 * Ce module est une simple RÉÉCRITURE SYNTAXIQUE : il transforme les liens
 * block-level conformes en `![[…]]` (transclusions explicites), que le flux
 * existant `resolveTransclusions` (transclusion.ts) résout ensuite dans
 * `renderMarkdown` — fragments, récursion, anti-cycle, placeholders,
 * MAX_DEPTH : tout est déjà implémenté et testé. Rien n'est dupliqué ici.
 *
 * Règles appliquées :
 * - `[[cible|alias]]` → transclusion de `cible` (l'alias est ignoré à
 *   l'impression ; `resolveTransclusions` ne connaît pas la syntaxe `|`).
 * - `[[fichier.pdf#page=…&rect=…]]` → JAMAIS transformé : laissé en lien
 *   (géré par pdf-rect-embed), conforme au plan.
 * - `![[…]]` déjà présents → intouchés (idempotence : le regex ne matche
 *   pas le préfixe `!`).
 * - Blocs de code (fences ``` et ~~~) → jamais touchés.
 *
 * En preview/éditeur, un wikilink block-level reste un lien cliquable
 * ordinaire : la convention n'agit qu'à l'impression (option `expandLinks`).
 */

/** Un wikilink simple seul sur sa ligne, indentation 0-3 espaces. */
const BLOCK_WIKILINK_RE = /^( {0,3})\[\[([^\[\]]+?)\]\][ \t]*$/;

function isFenceLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("```") || t.startsWith("~~~");
}

/**
 * Récrit les wikilinks block-level conformes à la convention en `![[…]]`.
 * Module PUR : aucune dépendance (ni Tauri, ni fichiers) — testable sous bun.
 */
export function expandWikilinksForPrint(src: string): string {
  const lines = src.split("\n");
  let inFence = false;
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isFenceLine(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }

    const m = BLOCK_WIKILINK_RE.exec(line);
    if (m && !inFence) {
      const prevEmpty = i === 0 || lines[i - 1].trim() === "";
      const nextEmpty = i === lines.length - 1 || lines[i + 1].trim() === "";
      if (prevEmpty && nextEmpty) {
        const indent = m[1];
        const target = m[2].trim();
        // Ignore l'alias (`[[cible|alias]]` → cible seule).
        const bare = target.includes("|") ? target.slice(0, target.indexOf("|")) : target;
        const fileName = bare.split("#")[0].trim();
        if (!fileName.toLowerCase().endsWith(".pdf")) {
          out.push(`${indent}![[${bare.trim()}]]`);
          continue;
        }
      }
    }

    out.push(line);
  }

  return out.join("\n");
}
