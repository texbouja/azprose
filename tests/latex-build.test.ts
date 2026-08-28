/**
 * Phase C — D5/R7 : « dernier buffer valide » (garde-fou de reload) et
 * mécanisme MAÎTRE. Les fonctions exercées sont PURES (`applyLatexBuildResult`,
 * `latexBuildTarget`) — aucun `mock.module` (process-global, empoisonne les
 * autres fichiers de tests) : `handleLatexBuild` n'est pas touché ici, seule
 * sa logique d'état l'est.
 */
import { expect, test } from "bun:test";
import { applyDetectedRoot, applyLatexBuildResult, latexBuildTarget } from "../src/latex/build-state";
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

// ── La racine ne s'hérite pas d'un document à l'autre (2026-08-28) ──────────
// Défaut constaté : après compilation de `A/master.tex`, ouvrir `B/master.tex`
// laissait la racine sur A — « compiler » recompilait A et le viewer montrait
// `A/master.pdf`. Les deux fichiers portant le même nom, cela passait pour une
// confusion de `basename` ; la cause était l'état LaTeX global jamais réinitialisé.

test("changer de document change la racine ET libère le viewer de l'ancienne", () => {
  const ls = createLatexState();
  applyLatexBuildResult(ls, { pdf_path: "/A/master.pdf", dependencies: ["/A/ch1.tex"] }, "/A/master.tex");
  expect(latexBuildTarget(ls, "/A/master.tex")).toBe("/A/master.tex");

  // On ouvre un AUTRE document, homonyme.
  expect(applyDetectedRoot(ls, "/B/master.tex")).toBe(true);

  expect(ls.rootFilePath).toBe("/B/master.tex");
  // Le cœur du défaut : sans cette libération, le viewer garderait A/master.pdf.
  expect(ls.viewerPdfPath).toBeNull();
  // Les dépendances décrivaient A : les garder ferait auto-compiler B à la
  // sauvegarde d'un fichier de A.
  expect(ls.dependencies).toEqual([]);
  expect(latexBuildTarget(ls, "/B/master.tex")).toBe("/B/master.tex");
});

test("EXCURSION : un fichier inclus rend la MÊME racine, rien n'est invalidé", () => {
  const ls = createLatexState();
  applyLatexBuildResult(ls, { pdf_path: "/A/master.pdf", dependencies: ["/A/ch1.tex"] }, "/A/master.tex");

  // On édite un fichier inclus : la détection rend la racine du document.
  expect(applyDetectedRoot(ls, "/A/master.tex")).toBe(false);

  expect(ls.viewerPdfPath).toBe("/A/master.pdf");
  expect(ls.dependencies).toEqual(["/A/ch1.tex"]);
  // Et « compiler » depuis le fichier inclus vise toujours la racine.
  expect(latexBuildTarget(ls, "/A/ch1.tex")).toBe("/A/master.tex");
});

test("séparateurs Windows : le même chemin n'est pas pris pour un changement", () => {
  const ls = createLatexState();
  ls.rootFilePath = "C:/proj/master.tex";
  ls.viewerPdfPath = "C:/proj/master.pdf";

  expect(applyDetectedRoot(ls, "C:\\proj\\master.tex")).toBe(false);
  expect(ls.viewerPdfPath).toBe("C:/proj/master.pdf");
});

test("racine indétectable : on retombe sur le fichier actif, jamais sur l'ancienne", () => {
  const ls = createLatexState();
  ls.rootFilePath = "/A/master.tex";
  ls.viewerPdfPath = "/A/master.pdf";

  applyDetectedRoot(ls, null);

  expect(ls.rootFilePath).toBeNull();
  expect(ls.viewerPdfPath).toBeNull();
  expect(latexBuildTarget(ls, "/B/isole.tex")).toBe("/B/isole.tex");
});
