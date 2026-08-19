import { describe, expect, test } from "bun:test";
import {
  assemblePrintHtml,
  buildPlanchesPrintCss,
  chunkPairs,
  PRINT_PAGE_CSS,
} from "../src/printing/colle/planches";
import type { ColleReportData } from "../src/printing/colle/email";
import { REPORT_PAGE_CSS } from "../src/printing/colle/email";
import { DEFAULT_PLANCHES_PRINT_REQUEST, HEADER_FOOTER_RESERVE_MM, type PrintRequest } from "../src/lib/print-request";

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
  test("regroupe les éléments 2 à 2 (défaut)", () => {
    expect(chunkPairs([1, 2, 3, 4, 5])).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("liste vide → aucun groupe", () => {
    expect(chunkPairs([])).toEqual([]);
  });

  test("cols=1 → une planche par rangée", () => {
    expect(chunkPairs([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  test("cols=3 → rangées de trois", () => {
    expect(chunkPairs([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]]);
  });

  test("cols invalide (0, 9, NaN) → repli 2 (la configuration actuelle)", () => {
    expect(chunkPairs([1, 2, 3], 0 as never)).toEqual([[1, 2], [3]]);
    expect(chunkPairs([1, 2, 3], 9 as never)).toEqual([[1, 2], [3]]);
    expect(chunkPairs([1, 2, 3], Number.NaN as never)).toEqual([[1, 2], [3]]);
  });
});

describe("buildPlanchesPrintCss", () => {
  test("défaut (DEFAULT_PLANCHES_PRINT_REQUEST) : marges 10 mm, 2 colonnes, gap 4 mm", () => {
    const css = buildPlanchesPrintCss();
    expect(css).toContain("@page { margin: 10mm 10mm 10mm 10mm; }");
    expect(css).toContain("grid-template-columns: repeat(2, 1fr)");
    expect(css).toContain("gap: 4mm;");
    expect(css).not.toContain("@page size");
  });

  test("marges personnalisées → valeurs mm dans @page", () => {
    const css = buildPlanchesPrintCss({
      ...DEFAULT_PLANCHES_PRINT_REQUEST,
      margins: { top: 5, bottom: 8, left: 12, right: 15 },
    });
    expect(css).toContain("@page { margin: 5mm 15mm 8mm 12mm; }");
  });

  test("1 colonne → grille à une colonne ; 3 colonnes → repeat(3, 1fr)", () => {
    const one = buildPlanchesPrintCss({ ...DEFAULT_PLANCHES_PRINT_REQUEST, columns: 1 });
    expect(one).toContain("grid-template-columns: repeat(1, 1fr)");
    const three = buildPlanchesPrintCss({ ...DEFAULT_PLANCHES_PRINT_REQUEST, columns: 3 });
    expect(three).toContain("grid-template-columns: repeat(3, 1fr)");
  });

  test("gap personnalisé", () => {
    const css = buildPlanchesPrintCss({ ...DEFAULT_PLANCHES_PRINT_REQUEST, columnGap: 10 });
    expect(css).toContain("gap: 10mm;");
  });

  test("entête demandé → réserve ~10 mm dans la marge haut (le rendu CDP dessine dans la zone de marge)", () => {
    const css = buildPlanchesPrintCss({
      ...DEFAULT_PLANCHES_PRINT_REQUEST,
      header: "Colle de maths",
    });
    expect(css).toContain(`@page { margin: ${10 + HEADER_FOOTER_RESERVE_MM}mm 10mm 10mm 10mm; }`);
  });

  test("pied demandé → réserve ~10 mm dans la marge bas", () => {
    const css = buildPlanchesPrintCss({
      ...DEFAULT_PLANCHES_PRINT_REQUEST,
      footer: "{page}/{pages}",
    });
    expect(css).toContain(`@page { margin: 10mm 10mm ${10 + HEADER_FOOTER_RESERVE_MM}mm 10mm; }`);
  });
});

describe("assemblePrintHtml", () => {
  test("PAS de taille @page forcée (options CDP = source de vérité) + grille 2 colonnes par défaut", () => {
    const html = assemblePrintHtml([data()], false);
    // Le format/orientation sont portés par buildPrintCdpOptions → print_to_pdf ;
    // la marge @page reste la source de vérité du contenu.
    expect(html).not.toContain("@page { size: A4 landscape; margin: 10mm; }");
    expect(html).not.toContain("@page size");
    expect(html).toContain("@page { margin: 10mm 10mm 10mm 10mm; }");
    expect(html).toContain("grid-template-columns: repeat(2, 1fr)");
    expect(html).toContain("class=\"pl-pair\"");
  });

  test("req personnalisé (marges + 1 colonne + gap) : appliqué au CSS ET au groupement", () => {
    const req: PrintRequest = {
      ...DEFAULT_PLANCHES_PRINT_REQUEST,
      margins: { top: 6, bottom: 6, left: 9, right: 9 },
      columns: 1,
      columnGap: 0,
    };
    const html = assemblePrintHtml([data(), data(), data()], false, undefined, "", "", undefined, req);
    expect(html).toContain("@page { margin: 6mm 9mm 6mm 9mm; }");
    expect(html).toContain("grid-template-columns: repeat(1, 1fr)");
    // Une planche par rangée → 3 paires pour 3 planches.
    expect((html.match(/class="pl-pair"/g) ?? []).length).toBe(3);
  });

  test("entête/pied : réserve dans @page + options CDP displayHeaderFooter", () => {
    const req: PrintRequest = {
      ...DEFAULT_PLANCHES_PRINT_REQUEST,
      header: "Colle de maths",
      footer: "{page}/{pages}",
    };
    const html = assemblePrintHtml([data()], false, undefined, "", "", undefined, req);
    expect(html).toContain(
      `@page { margin: ${10 + HEADER_FOOTER_RESERVE_MM}mm 10mm ${10 + HEADER_FOOTER_RESERVE_MM}mm 10mm; }`,
    );
    // Les templates CDP sont émis par buildPrintCdpOptions (export) — le HTML
    // assembleur ne contient que la réserve de marge, pas le template.
    expect(html).not.toContain("pageNumber");
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
    // Variante `-nofont` : la configuration des planches NOMME sa police
    // (`output.font`), donc le moteur est chargé sans police embarquée — c'est
    // ce qui permet au réglage de l'application de suivre jusqu'au papier.
    expect(html).toContain("mathjax@4/tex-svg-nofont.js");
    expect(html).toContain("output: { font: 'mathjax-newcm' }");
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
