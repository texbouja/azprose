/**
 * Forêt de TOC de l'AIDE INTÉGRÉE — traitement spécial de la vue « Sommaire » :
 * comme dans un MANUEL, la TOC reflète TOUT le contenu de la documentation (le
 * CATALOGUE), quel que soit l'article affiché dans le lecteur.
 *
 * Contrairement à `buildTocForest` (vault : fichier « home » + branches
 * transcluses par wikilinks), la forêt d'aide est pilotée par le catalogue
 * généré (`@/help/catalog`, source de vérité de l'ordre du guide) :
 * 1. `index.md` (page de garde + sommaire) est la RACINE de l'arbre ;
 * 2. Chaque article du catalogue devient une BRANCHE DE CHAPITRE (label =
 *    titre du catalogue), ses titres de niveau 2+ (parseMarkdownToc — le H1
 *    est EXCLU : le titre de la page est déjà le label de la branche, sinon
 *    le chapitre répéterait son titre) deviennent ses enfants ;
 * 3. La forêt est un VRAI sommaire de manuel : la racine index.md porte les
 *    chapitres, chaque chapitre porte ses sections (H2, H3…).
 *
 * La forêt est IDENTIQUE quelle que soit la note affichée (la seule variable
 * est la surbrillance, gérée côté UI par la prop `helpActivePath`).
 *
 * DI : `readText` injecté — module PUR, testable sous bun (aucun import
 * svelte/tauri ; les types viennent de toc-forest, effacés à la compilation).
 */

import { catalog } from "@/help/catalog";
import { parseMarkdownToc } from "@/lib/markdown-toc";
import type { TocFileNode, TocHeadingNode, TocForest } from "@/lib/toc-forest";
import { joinPath } from "@/lib/paths-utils";

/** Hash djb2 (32 bits non signé, hex) — même convention que toc-cache. */
function djb2(parts: string[]): string {
  let h = 5381;
  for (const s of parts) {
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    }
  }
  return h.toString(16);
}

/** Hash STRUCTURAL de la forêt d'aide : dérive du CATALOGUE (chemins + titres
 *  des articles, qui structurent l'arbre). Le catalogue est figé au build
 *  (une évolution de la doc → nouveau HELP_VERSION → réinstallation → nouvelle
 *  session), mais le hash reste honnête : il change si l'ordre ou les titres
 *  du guide changent. La forêt d'aide n'est jamais mémoïsée via toc-cache
 *  (le catalogue est déjà statique), le champ est informatif. */
function helpStructuralHash(): string {
  const parts: string[] = [];
  for (const a of catalog) parts.push(`${a.path}::${a.title}`);
  return djb2(parts);
}

export interface BuildHelpTocOptions {
  /** Dossier d'installation de l'aide (absolu) : `<racine>/.azprose/help`. */
  helpDir: string;
  /** Lit un fichier texte ; rejette si le fichier n'existe pas. */
  readText: (path: string) => Promise<string>;
}

/** Construit l'arbre hiérarchique des titres d'un article (liste plate → arbre). */
function buildHeadingTree(headings: { level: number; line: number; text: string }[], path: string): TocHeadingNode[] {
  const roots: TocHeadingNode[] = [];
  const stack: TocHeadingNode[] = [];
  for (const entry of headings) {
    const node: TocHeadingNode = { kind: "heading", path, entry, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].entry.level >= entry.level) stack.pop();
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

interface LoadedArticle {
  /** Chemin relatif au dossier help (`index.md`, `03-wikilinks.md`…). */
  rel: string;
  /** Titre du catalogue. */
  title: string;
  /** Chemin absolu (helpDir + rel). */
  abs: string;
  content: string;
}

/** Branche fichier d'un CHAPITRE : ses titres de niveau 2+ comme enfants (le
 *  H1 est exclu — le titre de l'article est déjà le label de la branche). */
function chapterBranch(a: LoadedArticle): TocFileNode {
  const headings = parseMarkdownToc(a.content).filter((h) => h.level >= 2);
  return {
    kind: "file",
    path: a.abs,
    label: a.title,
    root: false,
    children: buildHeadingTree(headings, a.abs),
  };
}

/**
 * Construit la forêt de TOC de l'aide intégrée :
 * 1. lit chaque article du catalogue (absent/illisible → écarté) ;
 * 2. `index.md` est la RACINE de l'arbre (page de garde + sommaire) ;
 * 3. les autres articles sont des BRANCHES DE CHAPITRE dans l'ordre du
 *    catalogue, chacun portant ses titres H2+.
 *
 * Retourne une forêt compatible avec TocPanel (`root` rendu comme rangée de
 * premier niveau en mode aide, `root.children` en mode vault). `root` vaut
 * null si AUCUN article n'est lisible.
 */
export async function buildHelpForest(opts: BuildHelpTocOptions): Promise<TocForest> {
  const { helpDir, readText } = opts;

  const articles: LoadedArticle[] = [];
  for (const a of catalog) {
    const abs = joinPath(helpDir, a.path);
    try {
      articles.push({ rel: a.path, title: a.title, abs, content: await readText(abs) });
    } catch {
      /* article absent ou illisible → écarté (le reste du guide reste navigable) */
    }
  }

  const indexPath = joinPath(helpDir, "index.md");
  if (articles.length === 0) return { root: null, displayPath: indexPath, structuralHash: helpStructuralHash() };

  const indexArt = articles.find((a) => a.rel === "index.md") ?? null;
  const chapters = articles.filter((a) => a.rel !== "index.md").map(chapterBranch);

  return {
    root: {
      kind: "file",
      path: indexPath,
      label: indexArt?.title ?? "AZprose",
      root: true,
      children: chapters,
    },
    displayPath: indexArt ? indexArt.abs : articles[0].abs,
    structuralHash: helpStructuralHash(),
  };
}
