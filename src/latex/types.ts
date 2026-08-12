export interface LatexState {
  viewerPdfPath: string | null;
  latexBuilding: boolean;
  latexViewerOn: boolean;
  latexSplitOn: boolean;
  buildRev: number;
  dependencies: string[];
  savingForBuild: boolean;
  rootFilePath: string | null;
  /** Dernier build en ÉCHEC (aucun PDF produit — Phase C, D5) : le viewer
   *  garde le DERNIER BUFFER VALIDE (`viewerPdfPath`/`buildRev` inchangés),
   *  le container affiche le message d'échec ; `false` après un build réussi. */
  buildFailed: boolean;
}

export function createLatexState(): LatexState {
  return {
    viewerPdfPath: null,
    latexBuilding: false,
    latexViewerOn: false,
    latexSplitOn: false,
    buildRev: 0,
    dependencies: [],
    savingForBuild: false,
    rootFilePath: null,
    buildFailed: false,
  };
}

export function clearLatexDeps(state: LatexState): void {
  state.dependencies = [];
}
