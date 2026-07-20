export interface LatexState {
  viewerPdfPath: string | null;
  latexBuilding: boolean;
  latexViewerOn: boolean;
  latexSplitOn: boolean;
  buildRev: number;
  dependencies: string[];
  savingForBuild: boolean;
  rootFilePath: string | null;
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
  };
}

export function clearLatexDeps(state: LatexState): void {
  state.dependencies = [];
}
