import { describe, expect, test } from "bun:test";
import { assemblePrintHtml, chunkPairs, PRINT_PAGE_CSS } from "../src/colles/pdf-planches";
import type { ColleReportData } from "../src/colles/email";
import { REPORT_PAGE_CSS } from "../src/colles/email";

/** Données minimale d'un rapport (fragments rendus factices). */
function data(over: Partial<ColleReportData> = {}): ColleReportData {
  return {
    meta: {
      matiere: "maths",
      eleve: "Ahmed El Moujahid",
      date: "2026-01-05",
      creneau: "14h-15h",
      salle: "Salle 3",
    },
    programme: "Suites et séries",
    bodyHtml: "<p>Énoncé de la planche.</p>",
    rubricRows: [],
    note: null,
    noteMax: 20,
    observationsHtml: "",
    colleur: "M. Boujaida",
    ...over,
  };
}

describe("chunkPairs", () => {
  test("regroupe les éléments 2 à 2", () => {
    expect(chunkPairs([1, 2, 3, 4, 5])).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("liste vide → aucun groupe", () => {
    expect(chunkPairs([])).toEqual([]);
  });
});

describe("assemblePrintHtml", () => {
  test("PAS de taille @page forcée (Chromium masquerait « More options ») + grille 2 colonnes", () => {
    const html = assemblePrintHtml([data()], false);
    // Chromium : quand une taille @page est RECONNUE (A4 l'est), le dialogue
    // d'impression verrouille le format/l'orientation et masque la section
    // papiers — l'utilisateur doit pouvoir choisir A4 paysage comme en md→PDF.
    expect(html).not.toContain("@page { size: A4 landscape; margin: 10mm; }");
    expect(html).not.toContain("@page size");
    expect(html).toContain("@page { margin: 10mm; }");
    expect(html).toContain("grid-template-columns: 1fr 1fr");
    expect(html).toContain("class=\"pl-pair\"");
  });

  test("une planche est entourée par une paire, deux planches partagent la MÊME paire", () => {
    const one = assemblePrintHtml([data()], false);
    const two = assemblePrintHtml([data(), data()], false);
    expect((one.match(/class="pl-pair"/g) ?? []).length).toBe(1);
    expect((two.match(/class="pl-pair"/g) ?? []).length).toBe(1);
    expect((two.match(/class="rp"/g) ?? []).length).toBe(2);
  });

  test("3 planches → 2 paires (2 + 1)", () => {
    const html = assemblePrintHtml([data(), data(), data()], false);
    expect((html.match(/class="pl-pair"/g) ?? []).length).toBe(2);
    expect((html.match(/class="rp"/g) ?? []).length).toBe(3);
  });

  test("sans évaluation : ni notes ni observations dans la planche", () => {
    const html = assemblePrintHtml(
      [data({ note: 15, noteMax: 20, rubricRows: [{ label: "Ex1", value: 15, maxScore: 20 }], observationsHtml: "<p>Bien.</p>" })],
      false,
    );
    expect(html).not.toContain('<section class="rp-eval">');
    expect(html).not.toContain('<div class="rp-obs">');
    expect(html).not.toContain("Bien.");
    expect(html).not.toContain("Ex1");
    // L'énoncé reste ; la SIGNATURE est retirée du PDF (retouche round 18) —
    // « M. Boujaida » ne subsiste que via la ligne « Colleur » des métadonnées.
    expect(html).toContain("Énoncé");
    expect(html).not.toContain("Bien cordialement");
    expect(html).toContain("M. Boujaida");
  });

  test("avec évaluation : la section Note + les observations sont présentes", () => {
    const html = assemblePrintHtml(
      [data({ note: 15, noteMax: 20, rubricRows: [{ label: "Ex1", value: 15, maxScore: 20 }], observationsHtml: "<p>Bien.</p>" })],
      true,
    );
    expect(html).toContain('<section class="rp-eval">');
    expect(html).toContain("rp-rubric");
    expect(html).toContain('<div class="rp-obs">');
    expect(html).toContain("Bien.");
    expect(html).toContain("Ex1");
  });

  test("le CSS du gabarit est injecté UNE seule fois dans le head (pas de bloc <style> dans les planches)", () => {
    const html = assemblePrintHtml([data(), data()], false);
    // Le gabarit `.rp` est rendu SANS son <style> embarqué (retiré par la
    // substitution) — un seul <style> global dans le document.
    expect(html.match(/<style>/g) ?? []).toHaveLength(1);
    expect((html.match(/class="rp"/g) ?? []).length).toBe(2);
    // Le CSS du gabarit est bien présent globalement (une seule fois).
    expect(html.indexOf(REPORT_PAGE_CSS)).toBe(html.lastIndexOf(REPORT_PAGE_CSS));
    expect(html.indexOf(REPORT_PAGE_CSS)).toBeGreaterThan(-1);
    expect(html.indexOf(PRINT_PAGE_CSS)).toBeGreaterThan(-1);
  });

  test("les surcharges d'impression imposent la colonne (100%, pas de ratio 16:10)", () => {
    const html = assemblePrintHtml([data()], false);
    expect(html).toContain(".pl-doc .rp { width: 100% !important; min-height: 0 !important;");
    expect(html).toContain("break-inside: avoid");
  });

  test("MathJax : config + CDN + cycle de vie (signal prêt pour le backend headless)", () => {
    const html = assemblePrintHtml([data()], false);
    expect(html).toContain("window.MathJax = {");
    expect(html).toContain("mathjax@4/tex-svg.js");
    expect(html).toContain("window.MathJax.startup.promise.then");
    // Le backend Rust (mdprinter.rs) poll document.title jusqu'à ce marqueur
    // avant de lancer print_to_pdf — plus de window.print() ni de dialogue.
    expect(html).toContain('document.title = "azprose-print-ready"');
    expect(html).not.toContain("window.print()");
    // Les extensions a11y (speech/braille/enrichissement SRE) sont désactivées
    // pour les documents autonomes chargés en maths (v4 les active par défaut).
    expect(html).toContain("enableEnrichment: false");
    expect(html).toContain("enableSpeech: false");
    expect(html).toContain("enableBraille: false");
    expect(html).toContain("enrich: false");
  });

  test("le contenu de chaque planche est bien présent et échappé", () => {
    const html = assemblePrintHtml([data()], false);
    expect(html).toContain("Ahmed El Moujahid");
    expect(html).toContain("Suites et séries");
    expect(html).toContain("Énoncé de la planche.");
    // La Salle est RETIRÉE du PDF (retouche round 18) — le rendu HTML de
    // l'app la garde, pas la feuille imprimée.
    expect(html).not.toContain("Salle 3");
  });

  test("la signature et la Salle sont retirées du PDF (retouches round 18)", () => {
    const html = assemblePrintHtml([data()], true);
    expect(html).not.toContain("Bien cordialement");
    expect(html).not.toContain("Salle 3");
    // Les autres métadonnées restent (Date, Créneau, Classe, Colleur).
    expect(html).toContain("Ahmed El Moujahid");
    expect(html).toContain("M. Boujaida");
  });

  test("préambule mathématique : injecté en math display HIDDEN en tête du document", () => {
    const preamble = "\\newcommand{\\R}{\\mathbb{R}}\\newcommand{\\N}{\\mathbb{N}}";
    const html = assemblePrintHtml([data()], false, undefined, preamble);
    expect(html).toContain("position:absolute;left:-9999px");
    expect(html).toContain("aria-hidden=\"true\"");
    expect(html).toContain(preamble);
  });

  test("préambule vide → aucun bloc caché", () => {
    const html = assemblePrintHtml([data()], false);
    expect(html).not.toContain("left:-9999px");
  });

  test("retouches de densité : gap réduit 4 mm + padding texte resserré", () => {
    expect(PRINT_PAGE_CSS).toContain("gap: 4mm;");
    expect(PRINT_PAGE_CSS).toContain(".pl-doc .rp-body { padding: 8px 10px !important; }");
  });

  test("printCss (section Printing) : injecté dans le head APRÈS le CSS du gabarit", () => {
    const css = ".rp-enonce-box, .rp-obs-content{font-size:13px;line-height:1.45;}";
    const html = assemblePrintHtml([data()], false, undefined, "", css);
    expect(html.indexOf(css)).toBeGreaterThan(-1);
    expect(html.indexOf(REPORT_PAGE_CSS)).toBeLessThan(html.indexOf(css));
    expect(html.indexOf(PRINT_PAGE_CSS)).toBeLessThan(html.indexOf(css));
    expect(html.indexOf(css)).toBeLessThan(html.indexOf("</style>"));
  });

  test("printCss vide → aucun bloc supplémentaire dans le style", () => {
    const html = assemblePrintHtml([data()], false);
    expect(html.indexOf(REPORT_PAGE_CSS)).toBeLessThan(html.indexOf(PRINT_PAGE_CSS));
    expect(html).not.toContain(".rp-enonce-box, .rp-obs-content{font-size");
  });
});
