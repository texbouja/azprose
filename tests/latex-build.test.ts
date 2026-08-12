/**
 * Phase C — D5/R7 : « dernier buffer valide » (garde-fou de reload) et
 * mécanisme MAÎTRE. Les fonctions exercées sont PURES (`applyLatexBuildResult`,
 * `latexBuildTarget`) — aucun `mock.module` (process-global, empoisonne les
 * autres fichiers de tests) : `handleLatexBuild` n'est pas touché ici, seule
 * sa logique d'état l'est.
 */
import { expect, test } from "bun:test";
import { applyLatexBuildResult, latexBuildTarget } from "../src/latex/build-state";
import { createLatexState } from "../src/latex/types";

test("échec : buildFailed true, garde-fou — buildRev et viewerPdfPath inchangés (dernier buffer valide)", () => {
  const ls = createLatexState();
  ls.viewerPdfPath = "/out/main.pdf";
  ls.buildRev = 7;
  ls.dependencies = ["/dep.tex"];

  applyLatexBuildResult(ls, { pdf_path: null }, "/main.tex");

  expect(ls.buildFailed).toBe(true);
  // Pas de reload : le PDFViewer n'est pas régénéré (rev inchangée) et
  // l'ancien PDF (valide) est conservé — jamais effacé par un échec.
  expect(ls.buildRev).toBe(7);
  expect(ls.viewerPdfPath).toBe("/out/main.pdf");
});

test("échec : les dépendances retournées sont conservées (auto-build), pas écrasées par une liste vide", () => {
  const ls = createLatexState();
  ls.dependencies = ["/dep.tex"];

  applyLatexBuildResult(ls, { pdf_path: null, dependencies: [] }, "/main.tex");
  expect(ls.dependencies).toEqual(["/dep.tex"]);

  applyLatexBuildResult(ls, { pdf_path: null, dependencies: ["/a.tex", "/b.tex"] }, "/main.tex");
  expect(ls.dependencies).toEqual(["/a.tex", "/b.tex"]);
});

test("succès : buildFailed false, buildRev++ et viewerPdfPath mis à jour (reload)", () => {
  const ls = createLatexState();
  ls.buildFailed = true;
  ls.buildRev = 2;

  applyLatexBuildResult(ls, { pdf_path: "/out/main.pdf", dependencies: ["/dep.tex"] }, "/main.tex");

  expect(ls.buildFailed).toBe(false);
  expect(ls.buildRev).toBe(3);
  expect(ls.viewerPdfPath).toBe("/out/main.pdf");
  expect(ls.rootFilePath).toBe("/main.tex");
  expect(ls.dependencies).toEqual(["/dep.tex"]);
});

test("mécanisme maître (R7) : le build vise rootFilePath même déclenché depuis une dépendance", () => {
  const ls = createLatexState();
  ls.rootFilePath = "/root.tex";
  expect(latexBuildTarget(ls, "/dep.tex")).toBe("/root.tex");

  // Aucun maître connu : le fichier actif fait foi (premier build).
  const fresh = createLatexState();
  expect(latexBuildTarget(fresh, "/dep.tex")).toBe("/dep.tex");
});
