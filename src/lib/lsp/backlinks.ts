/**
 * Backlinks — fichiers qui référencent la note active.
 *
 * La brique LSP : markdown-oxide implémente `textDocument/references`. En lui
 * demandant les références à la position 0:0 d'un fichier, le serveur retombe
 * sur `Referenceable::File` et renvoie TOUS les emplacements qui référencent ce
 * fichier (confirmé dans vault/mod.rs `select_referenceable_at_position`).
 *
 * DI : la fonction de requête LSP est INJECTÉE (le réel est
 * `requestMarkdownOxide` de ./markdown-oxide) — ce module reste PUR pour les
 * tests bun (markdown-oxide.ts charge des stores svelte, incompatibles).
 */

/** Signature de la fonction de requête LSP injectable. */
export type LspRequest = <T = unknown>(
  method: string,
  params?: unknown,
  timeoutMs?: number,
) => Promise<T>;

export interface BacklinkRef {
  /** Chemin absolu du fichier référençant. */
  path: string;
  /** Ligne de la référence (1-based, prête pour l'affichage et le jump). */
  line: number;
  /** Fin de la plage de la référence (1-based, inclus). */
  endLine: number;
}

interface LspPosition {
  line: number;
  character: number;
}

interface LspLocation {
  uri: string;
  range: { start: LspPosition; end: LspPosition };
}

/** Chemin de fichier → URI `file://` (protocole LSP). */
export function toFileUri(path: string): string {
  return "file://" + encodeURI(path.replace(/\\/g, "/"));
}

/** URI LSP → chemin de fichier (décodé). */
export function fromFileUri(uri: string): string {
  return uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
}

/** Normalise un chemin pour les comparaisons (anti-doublons, casse windows). */
export function normPath(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter((s) => s !== ".").join("/");
}

/** Convertit le résultat LSP `Location[] | Location | null` en BacklinkRef[]. */
export function parseLocations(
  result: LspLocation | LspLocation[] | null,
): BacklinkRef[] {
  const locations = Array.isArray(result) ? result : result ? [result] : [];
  return locations.map((loc) => ({
    path: fromFileUri(loc.uri),
    line: loc.range.start.line + 1,
    endLine: loc.range.end.line + 1,
  }));
}

/** Retire les références vers le fichier lui-même (une note peut se citer). */
export function filterSelf(refs: BacklinkRef[], targetPath: string): BacklinkRef[] {
  const target = normPath(targetPath);
  return refs.filter((r) => normPath(r.path) !== target);
}

/** Trie : par chemin puis par ligne. */
export function sortRefs(refs: BacklinkRef[]): BacklinkRef[] {
  return [...refs].sort(
    (a, b) => normPath(a.path).localeCompare(normPath(b.path)) || a.line - b.line,
  );
}

export interface BacklinkGroup {
  path: string;
  refs: BacklinkRef[];
}

/** Groupe les références par fichier (ordre : chemin, puis ligne). */
export function groupBacklinks(refs: BacklinkRef[]): BacklinkGroup[] {
  const byPath = new Map<string, BacklinkRef[]>();
  for (const ref of sortRefs(refs)) {
    const list = byPath.get(ref.path) ?? [];
    list.push(ref);
    byPath.set(ref.path, list);
  }
  return [...byPath.entries()].map(([path, list]) => ({ path, refs: list }));
}

/**
 * Interroge markdown-oxide : toutes les références au fichier `targetPath`.
 * Position 0:0 → repli `Referenceable::File` → backlinks de la note entière.
 * Rejette si le serveur n'est pas démarré ou en cas de timeout.
 */
export async function fetchBacklinks(
  targetPath: string,
  request: LspRequest,
  timeoutMs = 8000,
): Promise<BacklinkRef[]> {
  const uri = toFileUri(targetPath);
  const result = await request<LspLocation | LspLocation[] | null>(
    "textDocument/references",
    {
      textDocument: { uri },
      position: { line: 0, character: 0 },
      context: { includeDeclaration: true },
    },
    timeoutMs,
  );
  return filterSelf(parseLocations(result), targetPath);
}
