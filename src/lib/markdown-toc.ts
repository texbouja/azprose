/**
 * Table des matières d'un document Markdown (fichier actif).
 *
 * Parsing LOCAL du buffer (pas de LSP) : le plan doit refléter ce que
 * l'utilisateur voit dans l'éditeur (y compris les titres non sauvegardés),
 * fonctionner sans serveur et être testable sans Tauri.
 *
 * Règles : headings ATX (`#`…`######`) conformes CommonMark (0-3 espaces
 * d'indentation, au moins un espace après les dièses, `#` de fin strippés),
 * fences de code (` ``` ` / `~~~`) ignorées, frontmatter YAML en tête sauté.
 */

/** Entrée de plan : un titre du document. */
export interface TocEntry {
  /** Niveau du titre (1 = h1 … 6 = h6). */
  level: number;
  /** Numéro de ligne du titre, 1-based. */
  line: number;
  /** Texte du titre, nettoyé de la syntaxe markdown inline. */
  text: string;
}

const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)[ \t]*)?$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Nettoyage léger de la syntaxe markdown inline pour l'affichage d'un titre
 * dans le plan : images → texte alt, wikilinks → alias ou page, liens →
 * texte, gras/italique/barré/code → contenu, espaces multiples → un seul.
 */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, page: string, alias?: string) => alias ?? page)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrait le plan (liste hiérarchique des titres) d'un document Markdown.
 * Les titres dont le texte est vide (ou entièrement markdown) sont ignorés.
 */
export function parseMarkdownToc(source: string): TocEntry[] {
  const lines = source.split("\n");
  const entries: TocEntry[] = [];
  let inFence = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Frontmatter YAML : uniquement en tête de document.
    if (i === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") inFrontmatter = false;
      continue;
    }

    // Fences de code : rien à l'intérieur n'est un titre.
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = ATX_RE.exec(raw);
    if (!m) continue;
    const rawText = (m[2] ?? "").replace(/[ \t]+#+$/, "");
    const text = stripInlineMarkdown(rawText);
    if (!text) continue;
    entries.push({ level: m[1].length, line: i + 1, text });
  }

  return entries;
}
