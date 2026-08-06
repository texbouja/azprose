/**
 * Tests des gabarits email des rapports de colles (src/colles/email.ts).
 *
 * Depuis le round 10 le CORPS de l'email est une IMAGE PNG (le format SVG
 * est supprimé au round 16 ; la capture est faite par headless Chrome depuis
 * le round 19) : les tests couvrent donc les deux gabarits purs :
 *  - `buildReportContent` : la PAGE du rapport (ce qui est capturé) —
 *    largeur 640px, styles 100 % inline, couleurs fixes, échappement de tout
 *    texte libre, note globale calculée au rendu (jamais stockée) ;
 *  - `buildReportEmailHtml` : le wrapper EMAIL minimal (pièce jointe inline
 *    `cid:rapport@azprose`) — Gmail-safe : le wrapper ne produit JAMAIS de
 *    `<style>`/`<script>`/`<svg>`.
 */
import { describe, expect, it } from "bun:test";
import {
  REPORT_CID,
  REPORT_PAGE_CSS,
  assembleReportImageHtml,
  buildReportContent,
  buildReportEmailHtml,
  buildReportEnonce,
  buildReportEval,
  buildReportHead,
  buildReportMetaRows,
  buildReportProgramme,
  buildReportSubject,
  escHtml,
  formatNoteValue,
  formatReportDate,
  type ColleReportData,
} from "@/colles/email";

const base: ColleReportData = {
  meta: {
    matiere: "maths",
    // Règle mémoire : les fixtures utilisent des noms ARABISÉS (Maroc) —
    // même élève que l'exemple canonique d'archivage Boujaida-El_Moujahid_Ahmed.
    eleve: "Ahmed El Moujahid",
    date: "2026-08-10",
    creneau: "09:00-10:00",
    salle: "B12",
    classe: "MPSI 1",
    email_eleve: "ahmed.elmoujahid@lycee.ma",
  },
  programme: "",
  bodyHtml: "<p>Résoudre $x^2 = 4$.</p>",
  rubricRows: [],
  note: null,
  noteMax: 20,
  observationsHtml: "",
  colleur: "M. Boujaida",
};

describe("escHtml", () => {
  it("échappe les cinq caractères HTML", () => {
    expect(escHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });
  it("laisse passer le texte simple", () => {
    expect(escHtml("é à ç ù")).toBe("é à ç ù");
  });
});

describe("formatNoteValue", () => {
  it("convertit le point décimal en virgule", () => {
    expect(formatNoteValue(12.5)).toBe("12,5");
  });
  it("laisse les entiers tels quels", () => {
    expect(formatNoteValue(12)).toBe("12");
  });
  it("gère les chaînes saisies à la française", () => {
    expect(formatNoteValue("12,5")).toBe("12,5");
    expect(formatNoteValue("—")).toBe("—");
  });
});

describe("formatReportDate", () => {
  it("renvoie une date française non vide", () => {
    const out = formatReportDate("2026-08-10");
    expect(out).not.toBe("");
    expect(out.toLowerCase()).toContain("août".toLowerCase());
  });
  it("laisse passer les dates invalides telles quelles", () => {
    expect(formatReportDate("invalide")).toBe("invalide");
    expect(formatReportDate("")).toBe("");
  });
});

describe("buildReportSubject", () => {
  it("inclut la matière et l'élève", () => {
    expect(buildReportSubject(base)).toBe("Colle de maths — Ahmed El Moujahid");
  });
  it("repli sans matière", () => {
    expect(buildReportSubject({ ...base, meta: { eleve: "Ahmed" } })).toBe("Colle — Ahmed");
  });
});

describe("buildReportContent (la page capturée en image)", () => {
  it("est une page de rapport 640px contenant les métadonnées", () => {
    const html = buildReportContent(base);
    expect(html).toContain("--rp-w:640px");
    expect(html).toContain("maths — Ahmed El Moujahid");
    expect(html).toContain("MPSI 1");
    expect(html).toContain("B12");
    expect(html).toContain("M. Boujaida");
    expect(html).toContain("09:00-10:00");
  });

  it("échappe les valeurs libres des métadonnées (injection XSS)", () => {
    const html = buildReportContent({
      ...base,
      meta: {
        matiere: "<img src=x onerror=alert(1)>",
        eleve: "</div><script>alert(1)</script>",
      },
      programme: "<b>injection</b>",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("&lt;b&gt;injection&lt;/b&gt;");
  });

  it("affiche la note globale et le détail des rubriques saisies", () => {
    const html = buildReportContent({
      ...base,
      note: 15.5,
      noteMax: 20,
      rubricRows: [
        { label: "Maîtrise du cours", value: 8.5, maxScore: 10 },
        { label: "Clarté", value: 7, maxScore: 10 },
      ],
    });
    expect(html).toContain("15,5");
    expect(html).toContain("20");
    expect(html).toContain("Maîtrise du cours");
    expect(html).toContain("8,5 / 10");
    expect(html).toContain("7 / 10");
  });

  it("inclut le programme quand renseigné", () => {
    const html = buildReportContent({ ...base, programme: "Chapitre 4 : suites" });
    expect(html).toContain("Programme");
    expect(html).toContain("Chapitre 4 : suites");
  });

  it("inclut les observations rendues quand présentes", () => {
    const html = buildReportContent({
      ...base,
      observationsHtml: "<p>Très bon travail.</p>",
    });
    expect(html).toContain("Observations");
    expect(html).toContain("Très bon travail.");
  });

  it("omet le bloc évaluation quand aucune note n'est saisie", () => {
    const html = buildReportContent(base);
    expect(html).not.toContain(">Note<");
  });

  it("insère les fragments markdown verbatim (les maths SVG y vivent)", () => {
    // Contrairement au wrapper email, la page CAPTURÉE peut contenir des SVG
    // MathJax : c'est elle que le navigateur headless transforme en image.
    const html = buildReportContent({ ...base, bodyHtml: "<p>a <mjx-container>b</mjx-container></p>" });
    expect(html).toContain("<mjx-container>b</mjx-container>");
  });
});

describe("REPORT_PAGE_CSS (CSS embarqué du gabarit, round 15)", () => {
  it("calcule la hauteur minimale au ratio 16:10 depuis la largeur (--rp-w × 16/10)", () => {
    // 640px CSS × 16/10 = 1024px → capture pixelRatio 2 = 1280×2048 (image).
    expect(REPORT_PAGE_CSS).toMatch(/\.rp\s*\{[^}]*--rp-w:\s*640px/);
    expect(REPORT_PAGE_CSS).toMatch(/\.rp\s*\{[^}]*width:\s*var\(--rp-w\)/);
    expect(REPORT_PAGE_CSS).toContain("min-height:calc(var(--rp-w) * 16 / 10)");
  });

  it("affiche le Programme sur UNE ligne (flex, label + contenu, ellipsis)", () => {
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-prog\s*\{[^}]*display:\s*flex/);
    expect(REPORT_PAGE_CSS).toContain("text-overflow:ellipsis");
  });

  it("métadonnées sur UNE LIGNE (flex wrap + séparateurs), notes inline séparées par big dot", () => {
    // Round 15 : plus de grid pour les infos colle (espace vertical gâché) —
    // dl en flex wrap compact avec séparateurs « : » et « · ». Les notes sont
    // en spans INLINE (retour utilisateur) : largeur libre, chacune dans un
    // bloc incassable, séparées par un big dot « · ».
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-meta\s*\{[^}]*display:\s*flex/);
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-meta\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(REPORT_PAGE_CSS).toContain(".rp-meta dd::after");
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-rubric \+ \.rp-rubric::before\s*\{[^}]*content:"·"/);
    // Retour utilisateur : le big dot (#d1d5db) se fondait dans le fond du
    // bloc — foncé en #6b7280 ; « : » avec ESPACES NORMALES de part et d'autre
    // (typographie française, espace avant + après le deux-points).
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-rubric-label::after\s*\{[^}]*content:" : "/);
    expect(REPORT_PAGE_CSS).not.toMatch(/\.rp-rubric \+ \.rp-rubric::before\s*\{[^}]*color:#d1d5db/);
    expect(REPORT_PAGE_CSS).not.toMatch(/\.rp-rubrics\s*\{[^}]*width:100%/);
    expect(REPORT_PAGE_CSS).not.toContain("border-collapse");
  });

  it("notes détaillées : INLINE (largeur libre, spans incassables, big dot)", () => {
    // Trois bugs évités : (1) une div wrapper par rubrique devenait la cellule
    // d'une grid → label et note collés sans espace ; (2) la grid des spans
    // inline ne survivait pas au clone html-to-image (display computed
    // "inline" + gap perdus sous WebKitGTK — l'ère du clone est révolue, le
    // choix est conservé pour la stabilité des rendus) ; (3) la TABLE étirait
    // chaque rubrique sur une ligne entière (une note par ligne dans les
    // images — retour utilisateur).
    // Solution : span inline-block + white-space:nowrap par rubrique,
    // séparateur via pseudo-élément « · ».
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-rubric\s*\{[^}]*display:\s*inline-block/);
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-rubric\s*\{[^}]*white-space:\s*nowrap/);
    expect(REPORT_PAGE_CSS).toContain(".rp-rubric-label");
    expect(REPORT_PAGE_CSS).toContain(".rp-rubric-value");
    expect(REPORT_PAGE_CSS).not.toContain(".rp-rubrics{display:grid");
    expect(REPORT_PAGE_CSS).not.toContain("table");
  });

  it("couleur FIXE sur le contenu markdown (.rp-enonce-box/.rp-obs-content) — hors thème", () => {
    // Sans `color`, le contenu héritait de `body { color: var(--fg) }` de l'app :
    // en thème sombre le texte clair devenait INVISIBLE sur le fond clair fixe
    // du gabarit dans les PNG (les rendus hors écran copient les styles
    // calculés du document live — era html-to-image, comportement conservé).
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-enonce-box\s*\{[^}]*color:#111827/);
    expect(REPORT_PAGE_CSS).toMatch(/\.rp-obs-content\s*\{[^}]*color:#111827/);
  });
});

describe("builders de sections (round 15, une source de vérité)", () => {
  it("buildReportHead : titre matière — élève + date, repli « Colle »", () => {
    const h = buildReportHead(base.meta);
    expect(h).toContain("maths — Ahmed El Moujahid");
    expect(h).toContain(" · lun. 10 août");
    expect(buildReportHead({})).toContain("Colle");
    expect(buildReportHead({})).toContain("Rapport de colle");
  });

  it("buildReportMetaRows : une ligne label/valeur par champ, '' si vide", () => {
    const dl = buildReportMetaRows(base.meta, "M. Boujaida");
    expect(dl).toContain("<dl");
    expect(dl).toContain("MPSI 1");
    expect(dl).toContain("B12");
    expect(dl).toContain("M. Boujaida");
    expect(buildReportMetaRows({}, "")).toBe("");
  });

  it("buildReportMetaRows : includeSalle=false omet la Salle, garde les autres champs", () => {
    const dl = buildReportMetaRows(base.meta, "M. Boujaida", false);
    expect(dl).not.toContain("Salle");
    expect(dl).not.toContain("B12");
    // Les autres lignes subsistent (Date, Créneau, Classe, Colleur).
    expect(dl).toContain("MPSI 1");
    expect(dl).toContain("M. Boujaida");
    expect(dl).toContain("<dt>Date</dt>");
  });

  it("buildReportProgramme : label + contenu sur UNE ligne, '' si absent, XSS échappé", () => {
    const p = buildReportProgramme("Chapitre 4 : suites");
    expect(p).toContain("rp-prog");
    expect(p).toContain(">Programme</span>");
    expect(p).toContain("Chapitre 4 : suites");
    expect(buildReportProgramme("")).toBe("");
    expect(buildReportProgramme("<b>injection</b>")).toContain("&lt;b&gt;injection&lt;/b&gt;");
  });

  it("buildReportEnonce : fragments verbatim, '' si absent", () => {
    expect(buildReportEnonce("<p>a <mjx-container>b</mjx-container></p>")).toContain(
      "<mjx-container>b</mjx-container>",
    );
    expect(buildReportEnonce("  ")).toBe("");
  });

  it("buildReportEval : note + détail rubriques (grid) + observations, '' sans note", () => {
    const e = buildReportEval(15.5, 20, [
      { label: "Maîtrise du cours", value: 8.5, maxScore: 10 },
      { label: "Clarté", value: 7, maxScore: 10 },
    ], "<p>Très bon travail.</p>");
    expect(e).toContain("15,5");
    expect(e).toContain("Maîtrise du cours");
    expect(e).toContain("8,5 / 10");
    expect(e).toContain("Très bon travail.");
    expect(buildReportEval(null, 20, [], "")).toBe("");
  });

  it("buildReportEval : notes en spans INLINE incassables (largeur libre)", () => {
    const e = buildReportEval(15.5, 20, [
      { label: "Maîtrise du cours", value: 8.5, maxScore: 10 },
      { label: "Clarté", value: 7, maxScore: 10 },
    ], "");
    // Retour utilisateur : « J'ai toujours une note par ligne dans les images »
    // — la table étirait chaque rubrique sur une ligne entière. Les notes sont
    // désormais des spans inline-block nowrap dans le flux, séparées par le
    // big dot du CSS. Plus de table, de td ni de grid.
    expect(e).toContain('<div class="rp-rubrics">');
    expect(e).toContain('<span class="rp-rubric">');
    expect(e).toContain('<span class="rp-rubric-label">Maîtrise du cours</span>');
    expect(e).toContain('<span class="rp-rubric-value">8,5 / 10</span>');
    expect(e).toContain("Clarté");
    expect(e).not.toContain("<table");
    expect(e).not.toContain("<td");
    expect(e).not.toContain("grid");
    // Chaque rubrique est UN SEUL bloc incassable : pas de div wrapper interne.
    expect(e).not.toContain('<div class="rp-rubric"');
  });
});

describe("assembleReportImageHtml (document autonome capturé par headless, round 19)", () => {
  const DOC = assembleReportImageHtml(base);

  it("est un document HTML complet auto-suffisant (head + body)", () => {
    expect(DOC.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(DOC).toContain('<html lang="fr">');
    expect(DOC).toContain("<head>");
    expect(DOC).toContain("<body");
  });

  it("porte le CSS complet dans le <head> (gabarit + printCss en dernier)", () => {
    const withPrint = assembleReportImageHtml(base, {
      printCss: ".rp-enonce-box{font-size:16px}",
    });
    // Le style embarqué du gabarit est déplacé dans le head (includeCss false
    // sur le bloc), le printCss est collé APRÈS (dernier bloc gagne).
    const styleBlock = withPrint.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleBlock).not.toBeNull();
    expect(styleBlock![1]).toContain(".rp{--rp-w:640px");
    expect(styleBlock![1]).toContain(".rp-enonce-box{font-size:16px}");
    // Le corps ne doit PAS re-porter son propre <style> embarqué.
    const body = DOC.slice(DOC.indexOf("<body"));
    expect(body).not.toContain("<style>");
  });

  it("charge MathJax (config + CDN tex-svg) seulement si la config est fournie", () => {
    const withM = assembleReportImageHtml(base, {
      mathjaxConfig: 'window.MathJax = { startuptypeset: true };',
    });
    expect(withM).toContain('window.MathJax = { startuptypeset: true };');
    expect(withM).toContain('src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js"');
    // Sans config : aucune ASSIGNATION window.MathJax ni CDN (défaut du
    // document — le lifecycle script référence `window.MathJax`, pas ça).
    expect(DOC).not.toContain("window.MathJax =");
    expect(DOC).not.toContain("tex-svg.js");
  });

  it("injecte le préambule mathématique en span caché si fourni", () => {
    const withP = assembleReportImageHtml(base, { preamble: "\\newcommand{\\R}{\\mathbb{R}}" });
    expect(withP).toContain("$$\\newcommand{\\R}{\\mathbb{R}}$$");
    expect(withP).toContain('left:-9999px');
    expect(DOC).not.toContain("$$");
  });

  it("pose le marqueur de fin de rendu azprose-report-ready (pollé par Rust)", () => {
    expect(DOC).toContain('document.title = "azprose-report-ready"');
    // Le bloc <script> du lifecycle doit être FERMÉ dans le document final
    // (le backslash d'échappement dans le source `<\/script>` résout en
    // `</script>` — sinon headless Chrome avalerait le reste du body).
    const idx = DOC.indexOf("azprose-report-ready");
    expect(DOC.slice(idx)).toContain("</script>");
  });

  it("omet la Salle (contexte image — includeSalle false, retouche round 18)", () => {
    expect(DOC).not.toContain("B12");
  });
});

describe("buildReportEmailHtml (le wrapper Gmail-safe)", () => {
  it("est un document HTML complet avec l'image inline cid", () => {
    const html = buildReportEmailHtml(base);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(`src="cid:${REPORT_CID}"`);
    expect(html).toContain("maths — Ahmed El Moujahid");
  });

  it("n'émet jamais NI <style>, NI <script>, NI <svg> de son propre cru (Gmail-safe)", () => {
    // Tout le markup est en style="" inline ; le corps du rapport est une
    // IMAGE référencée par cid, jamais le HTML du rapport lui-même.
    const html = buildReportEmailHtml({
      ...base,
      bodyHtml: "<svg><script>alert(1)</script></svg>",
      observationsHtml: "<svg></svg>",
    });
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<svg");
  });

  it("échappe le texte alternatif de l'image", () => {
    const html = buildReportEmailHtml({
      ...base,
      meta: { matiere: "<x>", eleve: "\"</i>\"" },
    });
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain("&quot;&lt;/i&gt;&quot;");
  });
});
