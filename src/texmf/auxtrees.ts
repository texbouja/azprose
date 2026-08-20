/**
 * La valeur de `TEXMFAUXTREES` — logique PURE.
 *
 * MODULE PUR : aucun import svelte/tauri. Il n'encode qu'une chose, mais elle
 * a trois consommateurs et se paie cher si on l'oublie.
 */

/**
 * Assemble la liste d'arbres en une valeur d'environnement, ou rend `null`
 * s'il n'y a rien à annoncer.
 *
 * **La virgule finale est obligatoire.** kpathsea ignore la liste sans elle,
 * SILENCIEUSEMENT : la compilation échoue alors sur un `\usepackage` introuvable,
 * à cent lignes de la vraie cause. Trois appelants en dépendent — `latexmk`,
 * texlab et le terminal intégré — d'où cette fonction plutôt que trois
 * concaténations qu'il faudrait redécouvrir une par une.
 */
export function valeurTexmfAuxTrees(arbres: readonly string[]): string | null {
  const vivants = arbres.map((t) => t.trim()).filter((t) => t !== "");
  return vivants.length === 0 ? null : `${vivants.join(",")},`;
}
