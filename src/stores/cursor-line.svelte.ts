/**
 * Dernière position du curseur de chaque éditeur CodeMirror, indexée par
 * chemin de fichier. Consommée par app.svelte au moment du save : la vue
 * Preview suit la ligne du curseur via `azprose:preview-jump-line`.
 *
 * Conventions : la ligne est 0-BASED (identique à `data-sline` stampé par la
 * règle `source_lines` et à `jumpToLine` de l'éditeur). Un map par chemin
 * évite qu'un save sur le fichier ACTIF utilise la ligne d'un autre onglet :
 * chaque onglet garde sa dernière position de curseur, et `getCursorLine`
 * est interrogé avec `activePath`.
 */

let byPath = $state<Record<string, number>>({});

/** Enregistre la ligne 0-based du curseur de l'éditeur pour `path`. */
export function reportCursor(path: string, line: number): void {
  if (!path || !Number.isFinite(line) || line < 0) return;
  byPath[path] = line;
}

/** Dernière ligne 0-based connue pour `path` (null si jamais rapportée). */
export function getCursorLine(path: string): number | null {
  const line = byPath[path];
  return typeof line === "number" && Number.isFinite(line) ? line : null;
}
