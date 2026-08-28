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

/** Comparaison de chemins tolérante aux séparateurs (Windows). */
function memeChemin(a: string | null, b: string | null): boolean {
  const n = (p: string | null) => (p ? p.replace(/\\/g, "/") : null);
  return n(a) === n(b);
}

/**
 * Applique la racine détectée pour le fichier ACTIF, et invalide ce qui
 * appartenait à l'ancienne. Rend `true` si la racine a changé.
 *
 * ⚠️ **La racine ne s'hérite JAMAIS d'un document à l'autre.** Jusqu'au
 * 2026-08-28, la détection était gardée par `!rootFilePath` : une fois une
 * racine connue, elle ne bougeait plus. Ouvrir `B/master.tex` après avoir
 * compilé `A/master.tex` laissait donc `rootFilePath` sur A — et le bouton
 * « compiler » recompilait **A**, en affichant `A/master.pdf`. Les deux
 * fichiers portant le même nom, le défaut passait pour une confusion de
 * `basename` ; il n'en était rien, le dédoublonnage des onglets se fait bien
 * par chemin complet.
 *
 * L'EXCURSION reste intacte : éditer un fichier inclus rend la même racine,
 * donc rien n'est invalidé. Elle marche même mieux qu'avant — un fichier
 * inclus jamais compilé est désormais rattaché à sa racine, alors que
 * l'ancienne garde ne le voyait pas.
 *
 * Ce qui est jeté au changement de racine :
 * - `viewerPdfPath` — sans quoi le viewer garde le PDF de l'AUTRE document,
 *   c'est-à-dire précisément le symptôme constaté ;
 * - `dependencies` — elles décrivaient l'ancienne racine ; les garder ferait
 *   déclencher `autoBuildIfDepChanged` sur la sauvegarde d'un fichier
 *   étranger à la nouvelle.
 */
export function applyDetectedRoot(state: LatexState, root: string | null): boolean {
  if (memeChemin(root, state.rootFilePath)) return false;
  state.rootFilePath = root;
  state.viewerPdfPath = null;
  state.buildFailed = false;
  state.dependencies = [];
  return true;
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
