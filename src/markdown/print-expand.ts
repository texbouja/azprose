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

/** Un wikilink block-level conforme à la convention d'impression. */
export interface BlockWikilink {
  /** Ligne 1-based du wikilink dans `src`. */
  line: number;
  /** Indentation (0-3 espaces) de la ligne. */
  indent: string;
  /** Cible « nue » : alias retiré (`[[cible|alias]]` → `cible`), fragment
   *  conservé. Correspond exactement au contenu du `![[…]]` produit. */
  target: string;
  /** Alias (`[[cible|alias]]`) — présent UNIQUEMENT si la syntaxe `|` a été
   *  utilisée. Ignoré à l'impression (l'expansion construit `![[target]]`) ;
   *  utilisé par la TOC transcluse comme label de branche. */
  alias?: string;
}

/**
 * Identifie les wikilinks block-level CONFORMES à la convention d'impression
 * (décision utilisateur) : seul sur sa ligne, encadré de lignes vides, hors
 * liste, hors fence (indentation 0-3 espaces tolérée), fichier non-PDF.
 *
 * Source de vérité UNIQUE de la convention — consommée par
 * `expandWikilinksForPrint` (réécriture syntaxique `[[x]]` → `![[x]]`) ET par
 * la TOC transcluse (les cibles conformes deviennent des branches de l'arbre).
 * Module PUR : aucune dépendance — testable sous bun.
 */
export function findBlockWikilinks(src: string): BlockWikilink[] {
  const lines = src.split("\n");
  const out: BlockWikilink[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }

    const m = BLOCK_WIKILINK_RE.exec(line);
    if (m && !inFence) {
      const prevEmpty = i === 0 || lines[i - 1].trim() === "";
      const nextEmpty = i === lines.length - 1 || lines[i + 1].trim() === "";
      if (prevEmpty && nextEmpty) {
        const target = m[2].trim();
        // Sépare l'alias (`[[cible|alias]]` → cible + alias). À l'impression
        // seul `target` est utilisé (`![[cible]]`) ; l'alias est conservé pour
        // la TOC transcluse (label de branche).
        const pipe = target.indexOf("|");
        const bare = pipe >= 0 ? target.slice(0, pipe) : target;
        const alias = pipe >= 0 ? target.slice(pipe + 1).trim() : undefined;
        const fileName = bare.split("#")[0].trim();
        if (!fileName.toLowerCase().endsWith(".pdf")) {
          out.push({
            line: i + 1,
            indent: m[1],
            target: bare.trim(),
            ...(alias ? { alias } : {}),
          });
        }
      }
    }
  }

  return out;
}

/**
 * Récrit les wikilinks block-level conformes à la convention en `![[…]]`.
 * Module PUR : aucune dépendance (ni Tauri, ni fichiers) — testable sous bun.
 */
export function expandWikilinksForPrint(src: string): string {
  const lines = src.split("\n");
  const hits = new Map(findBlockWikilinks(src).map((h) => [h.line - 1, h]));
  const out = lines.map((line, i) => {
    const h = hits.get(i);
    if (h) return `${h.indent}![[${h.target}]]`;
    return line;
  });
  return out.join("\n");
}
