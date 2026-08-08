/**
 * Home dynamique du Preview md — recherche de l'`index.md` lié au fichier courant.
 *
 * Le bouton Home du preview navigue par défaut vers `<rootPath>/index.md`. Ce
 * module affine le comportement : on remonte depuis le dossier du fichier
 * courant (au plus `maxLevels` niveaux, borné par le rootPath) et on retourne
 * le PREMIER `index.md` dont le contenu contient un lien vers le fichier
 * courant (wikilink `[[…]]` ou lien markdown `[text](href)`). S'il n'y en a
 * pas, repli sur l'`index.md` à la racine du vault ; sinon `null`.
 *
 * DI : `readText` est injecté (implémentation réelle : `tauri-apps/plugin-fs`)
 * — le module est PUR, testable sous bun sans Tauri.
 */

import { basename, dirname, joinPath } from "@/lib/paths-utils";

export interface FindIndexMdOptions {
  rootPath: string;
  currentFilePath: string;
  /** Lit un fichier texte ; rejette (throw) si le fichier n'existe pas. */
  readText: (path: string) => Promise<string>;
  /** Nombre maximal de niveaux remontés depuis le dossier courant. */
  maxLevels?: number;
}

/** Normalise un chemin pour les comparaisons : antislash → `/`, résolution
 *  de `.` et `..` (comme POSIX), suppression des doubles `/`. */
export function normIndexPath(p: string): string {
  const abs = p.startsWith("/");
  const segs: string[] = [];
  for (const s of p.replace(/\\/g, "/").split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") {
      segs.pop();
      continue;
    }
    segs.push(s);
  }
  return (abs ? "/" : "") + segs.join("/");
}

/** Nom de fichier sans extension (`suites.md` → `suites`). */
export function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Tous les targets des wikilinks `[[page]]`, `[[page#heading]]`,
 * `[[page|alias]]`, `[[page#heading|alias]]` — le target est la partie avant
 * le premier `#` ou `|`, nettoyée. Les wikilinks imbriqués/échappés
 * (`\[\[` littéral) ne sont pas extraits (régex conservatrice).
 */
export function extractWikilinkTargets(content: string): string[] {
  const out: string[] = [];
  const re = /(?<!\\)\[\[([^\[\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const target = m[1].split(/[#|]/)[0].trim();
    if (target) out.push(target);
  }
  return out;
}

/**
 * Résout le href d'un lien markdown en chemin absolu normalisé.
 * - fragment/query retirés (`#…`, `?…`) ;
 * - `file://` décodé ;
 * - `/…` interprété comme relatif à la racine du vault ;
 * - `./…` / `../…` / relatif résolus depuis `fromDir` ;
 * - protocoles externes (`http:`, `mailto:`, …) et ancres `#…` → `""`.
 */
export function resolveMdLinkHref(href: string, fromDir: string, rootPath: string): string {
  if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(href)) return "";
  if (href.startsWith("file://")) {
    return normIndexPath(decodeURIComponent(href.slice(7)));
  }
  const clean = href.replace(/[#?].*$/, "");
  if (!clean) return "";
  // `/…` = relatif à la racine du vault (joinPath produit un double `/` que
  // normIndexPath efface) ; les chemins de l'app sont des chemins absolus.
  if (clean.startsWith("/")) return normIndexPath(joinPath(rootPath, clean));
  return normIndexPath(joinPath(fromDir, clean));
}

/**
 * Un contenu d'`index.md` est-il lié au fichier courant ?
 * - wikilink dont le basename (sans extension) égale celui du fichier courant,
 *   ou dont le chemin (sans extension) égale le chemin du fichier courant ;
 * - lien markdown résolu (relatif au dossier de l'index ou à la racine du
 *   vault) dont le chemin normalisé égale le chemin du fichier courant.
 */
export function isLinkedToFile(
  content: string,
  currentFilePath: string,
  indexDir: string,
  rootPath: string,
): boolean {
  const cur = normIndexPath(currentFilePath);
  const curStem = stem(basename(cur));

  for (const target of extractWikilinkTargets(content)) {
    const t = normIndexPath(target);
    if (stem(basename(t)) === curStem) return true;
    if (t === cur.replace(/\.[^/]+$/, "")) return true;
  }

  const linkRe = /\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(content)) !== null) {
    const resolved = resolveMdLinkHref(m[1], indexDir, rootPath);
    if (resolved && normIndexPath(resolved) === cur) return true;
  }
  return false;
}

async function tryRead(
  path: string,
  readText: (path: string) => Promise<string>,
): Promise<string | null> {
  try {
    return await readText(path);
  } catch {
    return null; // fichier absent ou illisible → non candidat
  }
}

/**
 * Trouve l'index.md « home » du fichier courant :
 * 1. remonte depuis `dirname(currentFilePath)` (au plus `maxLevels` niveaux,
 *    sans jamais dépasser le rootPath) et retourne le PREMIER `index.md` lié ;
 * 2. sinon `rootPath/index.md` s'il existe (défaut historique du bouton Home) ;
 * 3. sinon `null` (no-op silencieux — l'appelant n'ouvre rien).
 */
export async function findLinkedIndexMd(
  opts: FindIndexMdOptions,
): Promise<string | null> {
  const { rootPath, currentFilePath, readText, maxLevels = 3 } = opts;
  const root = normIndexPath(rootPath);
  const cur = normIndexPath(currentFilePath);

  const rootIndex = joinPath(root, "index.md");

  // Hors du vault (ou au vault lui-même) → repli immédiat sur l'index racine.
  if (cur === root || !cur.startsWith(root + "/")) {
    return (await tryRead(rootIndex, readText)) !== null ? rootIndex : null;
  }

  let dir = dirname(cur);
  for (let level = 0; level < maxLevels; level++) {
    const idx = joinPath(dir, "index.md");
    const content = await tryRead(idx, readText);
    if (content !== null && isLinkedToFile(content, cur, dir, root)) return idx;
    if (dir === root) break;
    const parent = dirname(dir);
    if (!parent.startsWith(root + "/") && parent !== root) break; // borné par le vault
    dir = parent;
  }

  return (await tryRead(rootIndex, readText)) !== null ? rootIndex : null;
}
