import type { LatexState } from "./types";

/**
 * Transitions d'état du build LaTeX — module PUR (aucun import Tauri ni store
 * svelte) : `build.ts` orchestre (save, invoke, diagnostics, console), ce
 * module décide de l'état du viewer. Isolé pour rester testable sans
 * `mock.module` (interdit : process-global, empoisonne les autres tests).
 */

/** Fichier réellement compilé (R7 — MÉCANISME MAÎTRE) : toujours le maître
 *  connu, même si le build est déclenché depuis un `\input`. */
export function latexBuildTarget(state: LatexState, activePath: string): string {
  return state.rootFilePath ?? activePath;
}

/**
 * Applique le RÉSULTAT d'un build au state. D5 « dernier buffer valide » : un
 * ÉCHEC (aucun PDF produit) ne touche NI `viewerPdfPath` NI `buildRev` — le
 * viewer garde le dernier PDF valide et ne recharge pas (le reload est
 * déclenché par `rev` : garde-fou « pas de reload si inchangé ») ; le
 * container affiche le message d'échec via `buildFailed`.
 */
export function applyLatexBuildResult(
  state: LatexState,
  res: { pdf_path: string | null; dependencies?: string[] },
  buildPath: string,
): void {
  if (res.pdf_path) {
    state.viewerPdfPath = res.pdf_path;
    state.buildFailed = false;
    state.buildRev++;
    state.dependencies = res.dependencies ?? [];
    state.rootFilePath = buildPath;
  } else {
    state.buildFailed = true;
    if (res.dependencies?.length) state.dependencies = res.dependencies;
  }
}
