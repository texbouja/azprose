/**
 * TOC déclarative de la fenêtre NAV (chantier fenêtre NAV, phase 3 — R8).
 *
 * AUCUNE analyse de liens : la structure multi-fichiers est ce que
 * l'utilisateur affirme dans le front-matter, jamais ce qu'un algorithme
 * déduit. Deux champs :
 *   - `sommaire:` (ou son synonyme `toc:`) — DESCENDANT : liste ordonnée de
 *     fichiers enfants (chaîne = basename/chemin, ou objet `{ fichier, titre }`
 *     pour un libellé explicite) ;
 *   - `parent:` — MONTANT : chemin d'un seul fichier parent (jamais une liste).
 *
 * Algorithme (déterministe, aucune exception remontée à l'UI — tout échec
 * dégrade vers le repli) :
 *   1. Remontée par `parent:` depuis le document monté, jusqu'au dernier
 *      fichier atteint (celui sans `parent:`, ou le dernier résolu si la
 *      chaîne s'arrête en cours de route) → RACINE candidate.
 *   2. Si la racine déclare un `sommaire:` → arbre construit récursivement
 *      depuis elle (origin: "declared").
 *   3. Sinon → repli : TOC du seul document MONTÉ, ses propres titres
 *      (origin: "single") — cas nominal d'un document isolé, pas une erreur.
 *
 * Garde-fous : profondeur 8 (remontée ET récursion, indépendamment), anti-cycle
 * sur les deux, cible non résolvable → dégradation (jamais de throw).
 *
 * Module PUR (aucun import svelte/tauri) — DI readText/getIndex, testable
 * sous bun, sur le modèle de `@/lib/toc-forest`.
 */

import { parseFrontMatter } from "@/lib/front-matter";
import { parseMarkdownToc } from "@/lib/markdown-toc";
import { basename, dirname, normIndexPath } from "@/lib/paths-utils";
import type { TocFileNode, TocHeadingNode, TocNode } from "@/lib/toc-forest";

export interface DeclaredTocOptions {
  /** Document monté dans l'onglet actif (chemin absolu). */
  documentPath: string;
  /** Contenu LIVE du document monté (évite une lecture disque). */
  documentSource?: string;
  /** Racine du vault — borne de résolution des basenames. */
  rootPath: string;
  /** DI : lit un fichier texte ; rejette si absent. */
  readText: (path: string) => Promise<string>;
  /** DI : index basename → chemin (implémentation réelle : getFileIndex). */
  getIndex: (rootPath: string) => Promise<Map<string, string>>;
  /** Profondeur maximale — remontée `parent:` ET récursion `sommaire:`,
   *  INDÉPENDAMMENT (même valeur, deux garde-fous distincts). Défaut : 8. */
  maxDepth?: number;
}

/** Source ayant produit l'arbre — AFFICHÉE dans le panneau (exigence
 *  d'ergonomie, phase 5) : un arbre qui apparaît sans dire d'où il vient est
 *  ce qui a fait échouer le mécanisme précédent (analyse de liens). */
export type TocOrigin = "declared" | "single";

export interface DeclaredToc {
  root: TocFileNode | null;
  /** Document monté (celui demandé par l'appelant). */
  displayPath: string;
  /** Fichier racine de l'arbre (== displayPath en mode "single"). */
  rootPath: string;
  origin: TocOrigin;
  /** Hash djb2 (même convention que toc-forest/toc-cache) de la forme
   *  affichée — permet à l'appelant de mémoïser sans reconstruire l'arbre. */
  structuralHash: string;
}

const DEFAULT_MAX_DEPTH = 8;

/** Hash djb2 (32 bits non signé, hex) — déterministe, pas cryptographique.
 *  Copie locale volontaire (cf. `toc-cache.ts`) : le hash structural de la TOC
 *  déclarative porte sur des entrées différentes (chemins/libellés déclarés,
 *  pas seulement titres + liens block-level). */
function djb2(parts: string[]): string {
  let h = 5381;
  for (const s of parts) {
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    }
  }
  return h.toString(16);
}

async function tryRead(
  path: string,
  readText: (path: string) => Promise<string>,
): Promise<string | null> {
  try {
    return await readText(path);
  } catch {
    return null;
  }
}

/** Ajoute `.md` au basename si celui-ci n'a pas d'extension (mêmes règles que
 *  `toc-forest` : un dossier contenant un point ne déclenche pas d'extension). */
function ensureMdExtension(target: string): string {
  const last = target.split(/[\\/]/).pop() ?? "";
  return last.includes(".") ? target : `${target}.md`;
}

/** `true` si `p` est un chemin ABSOLU (POSIX `/...`, Windows `C:\...`/`C:/...`
 *  ou UNC `\\...`) — l'une des trois formes de cible admises (§3.1). */
function isAbsolutePath(p: string): boolean {
  return /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
}

function resolveRelative(baseDir: string, target: string, sep: string): string {
  const isAbs = baseDir.startsWith(sep);
  const parts = (baseDir + sep + target).split(/[\\/]/).filter((s) => s !== "");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") { resolved.pop(); continue; }
    resolved.push(p);
  }
  return (isAbs ? sep : "") + resolved.join(sep);
}

interface ResolvedTarget {
  path: string;
  source: string;
}

/**
 * Résout une CIBLE déclarée (`parent:` ou entrée de `sommaire:`) — §3.1,
 * ordre fixé : chemin absolu tel quel → chemin relatif au fichier déclarant
 * (existant) → index du vault par basename → échec (entrée ignorée,
 * journalisée — jamais d'exception).
 */
async function resolveDeclaredTarget(
  raw: string,
  fromPath: string,
  rootPath: string,
  readText: (path: string) => Promise<string>,
  getIndex: (rootPath: string) => Promise<Map<string, string>>,
): Promise<ResolvedTarget | null> {
  const target = raw.trim();
  if (!target) return null;
  const withExt = ensureMdExtension(target);
  const sep = fromPath.includes("\\") ? "\\" : "/";
  const candidate = isAbsolutePath(withExt) ? withExt : resolveRelative(dirname(fromPath), withExt, sep);

  let path = normIndexPath(candidate);
  let source = await tryRead(path, readText);

  if (source === null) {
    const index = await getIndex(rootPath);
    const base = target.replace(/\.[^.]+$/, "");
    const found = index.get(base) ?? index.get(target) ?? index.get(withExt);
    if (found) {
      path = normIndexPath(found);
      source = await tryRead(path, readText);
    }
  }

  if (source === null) {
    console.warn(`[toc-declared] cible introuvable : "${raw}" (référencée depuis ${fromPath})`);
    return null;
  }
  return { path, source };
}

/** Lecture du `parent:` — UNE seule valeur, jamais une liste (§3.1). Une
 *  valeur invalide (absente, liste, chaîne vide) = « pas de parent ». */
function readParentField(values: Record<string, unknown>): string | null {
  const raw = values.parent;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Entrée brute d'un `sommaire:`/`toc:` — chaîne ou objet `{fichier,titre}`. */
type RawSommaireEntry = unknown;

/** Lecture du `sommaire:` (`toc:` synonyme, `sommaire:` gagne SUR PRÉSENCE —
 *  §2 : si les deux sont là, `sommaire:` l'emporte même si son contenu est
 *  invalide, auquel cas la dégradation se fait naturellement vers le repli). */
function readSommaireField(values: Record<string, unknown>): RawSommaireEntry[] | null {
  if ("sommaire" in values) return Array.isArray(values.sommaire) ? values.sommaire : [];
  if ("toc" in values) return Array.isArray(values.toc) ? values.toc : [];
  return null;
}

/** Cible + libellé EXPLICITE (forme objet) d'une entrée de `sommaire:`. */
function parseSommaireEntry(entry: RawSommaireEntry): { target: string; label?: string } | null {
  if (typeof entry === "string") {
    const target = entry.trim();
    return target ? { target } : null;
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const rec = entry as Record<string, unknown>;
    const target = typeof rec.fichier === "string" ? rec.fichier.trim() : "";
    if (!target) return null;
    const label = typeof rec.titre === "string" && rec.titre.trim() ? rec.titre.trim() : undefined;
    return { target, label };
  }
  return null;
}

/** Libellé d'un nœud (§3.1) : titre EXPLICITE (forme objet) si présent, sinon
 *  le premier `# H1` du fichier cible, sinon son basename. */
function labelOf(path: string, source: string, explicit: string | undefined): string {
  if (explicit) return explicit;
  for (const entry of parseMarkdownToc(source)) {
    if (entry.level === 1) return entry.text;
  }
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

interface BuildCtx {
  rootPath: string;
  readText: (path: string) => Promise<string>;
  getIndex: (rootPath: string) => Promise<Map<string, string>>;
  maxDepth: number;
}

/** Construit l'arbre des titres PROPRES d'un fichier (pas de transclusion —
 *  ce n'est pas le sujet de la TOC déclarative). */
function buildHeadingChildren(source: string, path: string): TocNode[] {
  const headings = parseMarkdownToc(source);
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

/**
 * Construit récursivement le nœud fichier d'une entrée de `sommaire:` : ses
 * propres titres, puis (si elle déclare elle-même un `sommaire:`) ses
 * sous-entrées, APPENDÉES après (aucune position de ligne à respecter, à la
 * différence des branches transcluses de `toc-forest` — un `sommaire:` est
 * une liste, pas des liens inline).
 */
async function buildDeclaredNode(
  path: string,
  source: string,
  label: string,
  depth: number,
  visited: Set<string>,
  ctx: BuildCtx,
): Promise<TocFileNode> {
  const children = buildHeadingChildren(source, path);

  if (depth < ctx.maxDepth) {
    const fm = parseFrontMatter(source);
    const sommaire = readSommaireField(fm.values);
    if (sommaire) {
      for (const raw of sommaire) {
        const parsed = parseSommaireEntry(raw);
        if (!parsed) continue; // entrée malformée → ignorée, le reste construit
        const resolved = await resolveDeclaredTarget(parsed.target, path, ctx.rootPath, ctx.readText, ctx.getIndex);
        if (!resolved || visited.has(resolved.path)) continue; // introuvable ou cycle
        const childVisited = new Set(visited);
        childVisited.add(resolved.path);
        const childLabel = labelOf(resolved.path, resolved.source, parsed.label);
        const child = await buildDeclaredNode(resolved.path, resolved.source, childLabel, depth + 1, childVisited, ctx);
        children.push(child);
      }
    }
  }

  return { kind: "file", path, label, root: depth === 0, children };
}

/** Hash STRUCTURAL de l'arbre construit (même convention djb2 que
 *  toc-forest/toc-cache) : sérialise chemins/libellés/titres dans l'ordre de
 *  parcours — un changement de forme (nouvelle entrée, titre renommé, ordre
 *  modifié) le change ; un edit de CORPS sans effet sur la TOC ne le change
 *  pas (le contenu n'y participe qu'à travers les titres eux-mêmes). */
function hashTree(root: TocFileNode | null): string {
  if (!root) return "";
  const parts: string[] = [];
  const walk = (node: TocNode) => {
    if (node.kind === "file") parts.push(`F:${node.path}:${node.label}`);
    else parts.push(`H:${node.entry.level}:${node.entry.line}:${node.entry.text}`);
    for (const c of node.children) walk(c);
  };
  walk(root);
  return djb2(parts);
}

/** Repli (origin: "single") : TOC du seul document MONTÉ — ses propres
 *  titres, aucune remontée. Cas nominal d'un document isolé (§3.2, point 4). */
function buildSingleToc(documentPath: string, source: string): DeclaredToc {
  const children = buildHeadingChildren(source, documentPath);
  const root: TocFileNode = { kind: "file", path: documentPath, label: labelOf(documentPath, source, undefined), root: true, children };
  return {
    root,
    displayPath: documentPath,
    rootPath: documentPath,
    origin: "single",
    structuralHash: hashTree(root),
  };
}

export async function buildDeclaredToc(opts: DeclaredTocOptions): Promise<DeclaredToc> {
  const { documentPath, documentSource, rootPath, readText, getIndex } = opts;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const docPath = normIndexPath(documentPath);

  const mountedSource = documentSource ?? await tryRead(docPath, readText);
  if (mountedSource === null) {
    return { root: null, displayPath: docPath, rootPath: docPath, origin: "single", structuralHash: "" };
  }

  // 1. Remontée par `parent:`, bornée et anti-cycle — le DERNIER fichier
  //    atteint (sans parent, ou le dernier résolu si la chaîne s'arrête) est
  //    la racine candidate.
  const visited = new Set<string>([docPath]);
  let rootCandidatePath = docPath;
  let rootCandidateSource = mountedSource;
  for (let depth = 0; depth < maxDepth; depth++) {
    const fm = parseFrontMatter(rootCandidateSource);
    const parentRaw = readParentField(fm.values);
    if (!parentRaw) break; // pas de parent → remontée terminée ici
    const resolved = await resolveDeclaredTarget(parentRaw, rootCandidatePath, rootPath, readText, getIndex);
    if (!resolved || visited.has(resolved.path)) break; // non résolvable ou cycle → dernier résolu = racine
    visited.add(resolved.path);
    rootCandidatePath = resolved.path;
    rootCandidateSource = resolved.source;
  }

  // 2. La racine trouvée déclare-t-elle un sommaire ?
  const rootFm = parseFrontMatter(rootCandidateSource);
  const sommaire = readSommaireField(rootFm.values);
  if (!sommaire || sommaire.length === 0) {
    // 3. Repli : TOC du document MONTÉ (pas de la racine résolue) — §3.2 pt.4.
    return buildSingleToc(docPath, mountedSource);
  }

  const ctx: BuildCtx = { rootPath, readText, getIndex, maxDepth };
  const rootLabel = labelOf(rootCandidatePath, rootCandidateSource, undefined);
  const root = await buildDeclaredNode(rootCandidatePath, rootCandidateSource, rootLabel, 0, new Set([rootCandidatePath]), ctx);

  return {
    root,
    displayPath: docPath,
    rootPath: rootCandidatePath,
    origin: "declared",
    structuralHash: hashTree(root),
  };
}
