/**
 * Forêt de TOC (harnais de sécurité de la refonte du plan) — arbre des titres
 * du fichier « home » (index.md lié, sinon fichier de référence), étendu des
 * TOC des fichiers liés par wikilinks block-level CONFORMES traités comme des
 * TRANSCLUSIONS : leurs plans sont inclus comme branches de l'arbre (jamais
 * la transclusion elle-même dans le viewer — ce module est purement de
 * navigation).
 *
 * Règles :
 * 1. La référence est le tab VIEWER actif (side preview), sinon le .md actif
 *    de l'éditeur — décidé par l'appelant (`referencePath`).
 * 2. Le fichier affiché est `findLinkedIndexMd` (même mécanisme que le bouton
 *    Home du preview) : si la recherche réussit → TOC de l'index.md ; sinon
 *    TOC du fichier de référence. `referenceSource` (buffer live) évite la
 *    lecture disque quand on affiche le fichier de référence lui-même.
 * 3. Seuls les wikilinks block-level conformes à la convention d'impression
 *    (`findBlockWikilinks`, source de vérité unique) déclenchent une branche
 *    transcluse — même logique que l'export PDF (`expandWikilinksForPrint`).
 *    Le fichier lié est résolu : relatif au fichier contenant, repli vault par
 *    basename (getFileIndex, DI). Sa TOC devient une branche de l'arbre,
 *    insérée à la position du lien dans le document hôte.
 * 4. Récursion bornée (maxDepth) + anti-cycle (ancestors). Toutes les
 *    branches (propres et transcluses) sont foldables côté UI.
 *
 * DI : `readText`/`getIndex` injectés — module PUR, testable sous bun.
 */

import { findBlockWikilinks } from "@/markdown/print-expand";
import { parseMarkdownToc, type TocEntry } from "@/lib/markdown-toc";
import { findLinkedIndexMd, normIndexPath, stem } from "@/lib/index-home";
import { basename, dirname } from "@/lib/paths-utils";

/** Nœud titre : un heading d'un fichier (propre ou transclu). */
export interface TocHeadingNode {
  kind: "heading";
  /** Fichier contenant ce titre (cible du saut). */
  path: string;
  entry: TocEntry;
  children: TocNode[];
}

/** Nœud fichier : racine de l'arbre ou branche transcluse. */
export interface TocFileNode {
  kind: "file";
  /** Fichier source de cette branche. */
  path: string;
  /** Label affiché : alias du wikilink hôte (`[[file|title]]`) quand présent,
   *  sinon basename sans extension. */
  label: string;
  /** Racine (fichier affiché) vs branche transcluse. */
  root: boolean;
  /** Ligne (1-based) du wikilink hôte qui a créé cette branche — position
   *  dans le document parent, pour l'ordre d'insertion. Absent sur la racine. */
  linkLine?: number;
  children: TocNode[];
}

export type TocNode = TocHeadingNode | TocFileNode;

export interface TocForest {
  /** Racine de l'arbre (null si aucun contenu lisible). */
  root: TocFileNode | null;
  /** Chemin du fichier effectivement affiché (index.md trouvé, sinon
   *  referencePath). */
  displayPath: string;
}

export interface BuildTocForestOptions {
  /** Racine du vault (borne de la remontée de findLinkedIndexMd). */
  rootPath: string;
  /** Fichier de référence (viewer md actif, sinon éditeur actif). */
  referencePath: string;
  /** Contenu LIVE du fichier de référence (frappes non sauvegardées) — utilisé
   *  à la place de readText quand aucun index.md lié n'est trouvé. */
  referenceSource?: string;
  /** Lit un fichier texte ; rejette si le fichier n'existe pas. */
  readText: (path: string) => Promise<string>;
  /** Résolution basename → chemin (repli vault). Défaut réel : getFileIndex. */
  getIndex?: (rootPath: string) => Promise<Map<string, string>>;
  /** Nombre maximal de niveaux de transclusion (0 = racine seule). */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 3;

function dirnameOf(p: string): string {
  return dirname(p);
}

function resolveRelative(baseDir: string, target: string, sep: string): string {
  const isAbs = baseDir.startsWith(sep);
  const parts = (baseDir + sep + target).split(sep).filter((s) => s !== "");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") { resolved.pop(); continue; }
    resolved.push(p);
  }
  return (isAbs ? sep : "") + resolved.join(sep);
}

/** Ajoute `.md` au basename si celui-ci n'a pas d'extension — un dossier
 *  contenant un point ne déclenche pas d'extension (`./chapitre-1` →
 *  `./chapitre-1.md`, `dossier.fin/note` → `dossier.fin/note.md`). */
function ensureMdExtension(target: string): string {
  const last = target.split(/[\\/]/).pop() ?? "";
  return last.includes(".") ? target : `${target}.md`;
}

async function tryRead(
  path: string,
  readText: (path: string) => Promise<string>,
): Promise<string | null> {
  try {
    return await readText(path);
  } catch {
    return null; // absent ou illisible → non candidat
  }
}

/** Résout la cible d'un wikilink conforme vers `{path, content}` :
 *  relatif au fichier hôte, puis repli vault par basename. null si introuvable
 *  ou si la cible est un PDF (jamais transclu). */
async function loadTarget(
  target: string,
  fromPath: string,
  rootPath: string,
  readText: (path: string) => Promise<string>,
  getIndex: (rootPath: string) => Promise<Map<string, string>>,
): Promise<{ path: string; content: string } | null> {
  const fileName = target.split("#")[0].trim();
  if (!fileName || fileName.toLowerCase().endsWith(".pdf")) return null;

  const sep = fromPath.includes("\\") ? "\\" : "/";
  let abs = resolveRelative(dirnameOf(fromPath), ensureMdExtension(fileName), sep);
  let content = await tryRead(abs, readText);

  if (content === null && rootPath) {
    const index = await getIndex(rootPath);
    const base = fileName.replace(/\.[^.]+$/, "");
    const found = index.get(base) ?? index.get(fileName) ?? index.get(ensureMdExtension(fileName));
    if (found) {
      abs = found;
      content = await tryRead(abs, readText);
    }
  }

  return content === null ? null : { path: normIndexPath(abs), content };
}

function labelOf(path: string): string {
  return stem(basename(path));
}

/** Construit l'arbre hiérarchique des titres (liste plate → arbre), avec une
 *  carte ligne → nœud pour l'insertion des branches transcluses. */
function buildHeadingTree(
  headings: TocEntry[],
  path: string,
): { roots: TocHeadingNode[]; byLine: Map<number, TocHeadingNode> } {
  const roots: TocHeadingNode[] = [];
  const byLine = new Map<number, TocHeadingNode>();
  const stack: TocHeadingNode[] = [];
  for (const entry of headings) {
    const node: TocHeadingNode = { kind: "heading", path, entry, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].entry.level >= entry.level) stack.pop();
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
    byLine.set(entry.line, node);
  }
  return { roots, byLine };
}

/** Position d'un nœud dans le document hôte : ligne du titre pour un heading,
 *  ligne du wikilink pour une branche (racine → +∞, toujours après). */
function childPos(c: TocNode): number {
  if (c.kind === "heading") return c.entry.line;
  return c.linkLine ?? Number.POSITIVE_INFINITY;
}

/** Insère une branche transcluse à la position du lien : enfant du dernier
 *  heading qui le précède (racine sinon), APRÈS les children (headings et
 *  branches) qui le précèdent — l'ordre suit l'ordre des liens. */
function insertBranch(
  roots: TocNode[],
  byLine: Map<number, TocHeadingNode>,
  headings: TocEntry[],
  linkLine: number,
  branch: TocFileNode,
): void {
  let hostEntry: TocEntry | null = null;
  for (const h of headings) {
    if (h.line < linkLine) hostEntry = h;
    else break; // headings triés par ligne
  }

  if (hostEntry) {
    const host = byLine.get(hostEntry.line);
    if (!host) return;
    const idx = host.children.filter((c) => childPos(c) < linkLine).length;
    host.children.splice(idx, 0, branch);
  } else {
    const idx = roots.filter((c) => childPos(c) < linkLine).length;
    roots.splice(idx, 0, branch);
  }
}

interface BuildCtx {
  rootPath: string;
  readText: (path: string) => Promise<string>;
  getIndex: (rootPath: string) => Promise<Map<string, string>>;
  maxDepth: number;
}

/** Construit le nœud fichier d'un document : arbre de ses titres + branches
 *  transcluses (récursives, anti-cycle, bornées par maxDepth). */
async function buildFileNode(
  path: string,
  content: string,
  depth: number,
  ancestors: Set<string>,
  ctx: BuildCtx,
  linkLine?: number,
  labelOverride?: string,
): Promise<TocFileNode> {
  const headings = parseMarkdownToc(content);
  const { roots, byLine } = buildHeadingTree(headings, path);

  if (depth < ctx.maxDepth) {
    for (const link of findBlockWikilinks(content)) {
      const target = await loadTarget(link.target, path, ctx.rootPath, ctx.readText, ctx.getIndex);
      if (!target || ancestors.has(target.path)) continue; // absent ou cycle
      const childAncestors = new Set(ancestors);
      childAncestors.add(path);
      const branch = await buildFileNode(target.path, target.content, depth + 1, childAncestors, ctx, link.line, link.alias);
      insertBranch(roots, byLine, headings, link.line, branch);
    }
  }

  return {
    kind: "file",
    path,
    label: labelOverride ?? labelOf(path),
    root: false,
    linkLine,
    children: roots,
  };
}

/**
 * Construit la forêt de TOC du fichier « home » :
 * 1. `findLinkedIndexMd` (même mécanisme que le bouton Home du preview) ;
 * 2. contenu = readText(index) ou `referenceSource`/readText(référence) ;
 * 3. arbre récursif (titres + branches transcluses conformes).
 */
export async function buildTocForest(
  opts: BuildTocForestOptions,
): Promise<TocForest> {
  const { rootPath, referencePath, referenceSource, readText } = opts;
  const getIndex = opts.getIndex;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const rootNorm = normIndexPath(rootPath);
  const refNorm = normIndexPath(referencePath);

  // 1. Home : index.md lié au fichier de référence (si la recherche réussit,
  //    c'est la TOC de CE fichier qui est affichée).
  const index = await findLinkedIndexMd({
    rootPath,
    currentFilePath: refNorm,
    readText,
    maxLevels: 3,
  });
  const displayPath = index ?? refNorm;

  // 2. Contenu du fichier affiché : buffer live du fichier de référence quand
  //    on l'affiche lui-même, sinon lecture disque.
  const content = displayPath === refNorm
    ? (referenceSource ?? await tryRead(displayPath, readText))
    : await tryRead(displayPath, readText);
  if (content === null) return { root: null, displayPath };

  // 3. Arbre récursif. Le fichier racine est marqué `root: true`.
  const ancestors = new Set<string>([rootNorm === refNorm ? refNorm : displayPath]);
  const ctx: BuildCtx = { rootPath, readText, getIndex: getIndex ?? (() => Promise.resolve(new Map())), maxDepth };
  const node = await buildFileNode(displayPath, content, 0, ancestors, ctx);
  return { root: { ...node, root: true }, displayPath };
}
