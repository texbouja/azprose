/**
 * Tests PUR du modèle d'impression (Phase 3) :
 *   src/lib/print-request.ts  — formats, conversion mm→pouces, CSS @page,
 *                                templates CDP entête/pied ;
 *   src/lib/print-templates.ts — gabarits, titre, rendu de coquille.
 */
import { describe, expect, it } from "bun:test";
import {
  DEFAULT_PRINT_REQUEST,
  DEFAULT_PLANCHES_PRINT_REQUEST,
  PAPER_FORMATS,
  MM_TO_INCH,
  HEADER_FOOTER_RESERVE_MM,
  buildPrintBaseCss,
  buildCdpHeaderFooterTemplate,
  buildPrintCdpOptions,
  hasHeaderFooter,
  paperToInches,
} from "@/lib/print-request";
import {
  PRINT_TEMPLATES,
  getPrintTemplate,
  renderPrintTemplate,
  printTitleFromPath,
  resolveLogoValue,
} from "@/lib/print-templates";

describe("DEFAULT_PLANCHES_PRINT_REQUEST", () => {
  it("reproduit la configuration actuelle des planches : A4 paysage, marges 10 mm, 2 colonnes, gap 4 mm", () => {
    expect(DEFAULT_PLANCHES_PRINT_REQUEST.orientation).toBe("landscape");
    expect(DEFAULT_PLANCHES_PRINT_REQUEST.paper).toBe("a4");
    expect(DEFAULT_PLANCHES_PRINT_REQUEST.margins).toEqual({ top: 10, bottom: 10, left: 10, right: 10 });
    expect(DEFAULT_PLANCHES_PRINT_REQUEST.columns).toBe(2);
    expect(DEFAULT_PLANCHES_PRINT_REQUEST.columnGap).toBe(4);
  });

  it("paysage en CDP : landscape true + mêmes dimensions A4", () => {
    const o = buildPrintCdpOptions(DEFAULT_PLANCHES_PRINT_REQUEST);
    expect(o.landscape).toBe(true);
    expect(o.paperWidth).toBeCloseTo(8.27, 2);
    expect(o.paperHeight).toBeCloseTo(11.69, 2);
  });

  it("diffère du défaut md→PDF (orientation et marges)", () => {
    expect(DEFAULT_PLANCHES_PRINT_REQUEST.orientation).not.toBe(DEFAULT_PRINT_REQUEST.orientation);
    expect(DEFAULT_PLANCHES_PRINT_REQUEST.columns).toBe(2);
    expect(DEFAULT_PRINT_REQUEST.columns).toBe(1);
  });
});

describe("paperToInches", () => {
  it("A4 portrait → 8.27 × 11.69 pouces", () => {
    const { width, height } = paperToInches(DEFAULT_PRINT_REQUEST);
    expect(width).toBeCloseTo(8.27, 2);
    expect(height).toBeCloseTo(11.69, 2);
  });

  it("reste en portrait quand l'orientation est landscape (rotation par CDP)", () => {
    const req = { ...DEFAULT_PRINT_REQUEST, orientation: "landscape" as const };
    const { width, height } = paperToInches(req);
    expect(width).toBeCloseTo(PAPER_FORMATS.a4.width * MM_TO_INCH, 5);
    expect(height).toBeCloseTo(PAPER_FORMATS.a4.height * MM_TO_INCH, 5);
    expect(width).toBeLessThan(height);
  });

  it("papier custom (mm) converti en pouces", () => {
    const req = {
      ...DEFAULT_PRINT_REQUEST,
      paper: "custom" as const,
      customPaper: { width: 100, height: 200 },
    };
    const { width, height } = paperToInches(req);
    expect(width).toBeCloseTo(100 * MM_TO_INCH, 5);
    expect(height).toBeCloseTo(200 * MM_TO_INCH, 5);
  });

  it("papier custom absent → repli A4", () => {
    const req = { ...DEFAULT_PRINT_REQUEST, paper: "custom" as const, customPaper: null };
    const { width } = paperToInches(req);
    expect(width).toBeCloseTo(8.27, 2);
  });

  it("letter = 8.5 × 11", () => {
    const { width, height } = paperToInches({ ...DEFAULT_PRINT_REQUEST, paper: "letter" as const });
    expect(width).toBeCloseTo(8.5, 2);
    expect(height).toBeCloseTo(11, 2);
  });
});

describe("hasHeaderFooter", () => {
  it("faux quand les deux champs sont vides", () => {
    expect(hasHeaderFooter(DEFAULT_PRINT_REQUEST)).toBe(false);
  });
  it("vrai dès qu'un champ est non vide (espaces seuls ignorés)", () => {
    expect(hasHeaderFooter({ ...DEFAULT_PRINT_REQUEST, footer: "  " })).toBe(false);
    expect(hasHeaderFooter({ ...DEFAULT_PRINT_REQUEST, header: "titre" })).toBe(true);
  });
});

describe("buildPrintBaseCss", () => {
  it("marges par défaut = 8.5 mm haut/bas, 12.7 mm gauche/droite (héritage 32px/48px)", () => {
    const css = buildPrintBaseCss(DEFAULT_PRINT_REQUEST);
    expect(css).toContain("@page { margin: 8.5mm 12.7mm 8.5mm 12.7mm; }");
  });

  it("réserve 10 mm au haut quand l'entête est actif", () => {
    const css = buildPrintBaseCss({ ...DEFAULT_PRINT_REQUEST, header: "cours" });
    expect(css).toContain(`@page { margin: ${8.5 + HEADER_FOOTER_RESERVE_MM}mm 12.7mm 8.5mm 12.7mm; }`);
  });

  it("réserve 10 mm au bas quand le pied est actif", () => {
    const css = buildPrintBaseCss({ ...DEFAULT_PRINT_REQUEST, footer: "{page}/{pages}" });
    expect(css).toContain(`@page { margin: 8.5mm 12.7mm ${8.5 + HEADER_FOOTER_RESERVE_MM}mm 12.7mm; }`);
  });

  it("marges personnalisées (mm) transmises telles quelles", () => {
    const req = {
      ...DEFAULT_PRINT_REQUEST,
      margins: { top: 15, bottom: 20, left: 25, right: 30 },
    };
    const css = buildPrintBaseCss(req);
    expect(css).toContain("@page { margin: 15mm 30mm 20mm 25mm; }");
  });

  it("h1 : saut de page, sauf premier", () => {
    const css = buildPrintBaseCss(DEFAULT_PRINT_REQUEST);
    expect(css).toContain(".mdv-prose h1 { break-before: page; }");
    expect(css).toContain(".mdv-prose h1:first-child { break-before: avoid; }");
  });

  it("saut de page EXPLICITE : .page-break (invisible à l'écran, saut dans le PDF)", () => {
    const css = buildPrintBaseCss(DEFAULT_PRINT_REQUEST);
    expect(css).toContain(".mdv-prose .page-break { break-after: page; }");
  });

  it("annulation du saut implicite d'un h1 : .no-page-break → break-before: auto", () => {
    const css = buildPrintBaseCss(DEFAULT_PRINT_REQUEST);
    expect(css).toContain(".mdv-prose h1.no-page-break { break-before: auto; }");
  });

  it("callouts repliés imprimés dépliés", () => {
    const css = buildPrintBaseCss(DEFAULT_PRINT_REQUEST);
    expect(css).toContain(".mdv-prose details.callout { display: block !important; }");
  });

  it("1 colonne → aucun bloc multicol", () => {
    const css = buildPrintBaseCss(DEFAULT_PRINT_REQUEST);
    expect(css).not.toContain("column-count");
  });

  it("2 colonnes → column-count, column-gap mm, breaks évités", () => {
    const css = buildPrintBaseCss({ ...DEFAULT_PRINT_REQUEST, columns: 2, columnGap: 10 });
    expect(css).toContain("column-count: 2");
    expect(css).toContain("column-gap: 10mm");
    expect(css).toContain(".mdv-prose .callout { break-inside: avoid; }");
  });
});

describe("buildCdpHeaderFooterTemplate", () => {
  it("placeholder {page} → span.pageNumber, {pages} → span.totalPages", () => {
    const tpl = buildCdpHeaderFooterTemplate("p. {page} / {pages}");
    expect(tpl).toContain('<span class="pageNumber"></span>');
    expect(tpl).toContain('<span class="totalPages"></span>');
  });

  it("{title} et {date} mappés sur les classes réservées", () => {
    const tpl = buildCdpHeaderFooterTemplate("{title} — {date}");
    expect(tpl).toContain('<span class="title"></span>');
    expect(tpl).toContain('<span class="date"></span>');
  });

  it("texte échappé (pas d'injection dans le header du PDF)", () => {
    const tpl = buildCdpHeaderFooterTemplate("<script>alert(1)</script>");
    expect(tpl).not.toContain("<script>");
    expect(tpl).toContain("&lt;script&gt;");
  });

  it("élément racine unique", () => {
    const tpl = buildCdpHeaderFooterTemplate("x");
    const opens = (tpl.match(/<div/g) ?? []).length;
    const closes = (tpl.match(/<\/div>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

describe("buildPrintCdpOptions", () => {
  it("défauts : portrait A4, fond imprimé, pas d'entête/pied", () => {
    const o = buildPrintCdpOptions(DEFAULT_PRINT_REQUEST);
    expect(o.landscape).toBe(false);
    expect(o.paperWidth).toBeCloseTo(8.27, 2);
    expect(o.paperHeight).toBeCloseTo(11.69, 2);
    expect(o.printBackground).toBe(true);
    expect(o.displayHeaderFooter).toBe(false);
    expect(o.headerTemplate).toBeUndefined();
    expect(o.footerTemplate).toBeUndefined();
  });

  it("landscape + échelle + fond off transmis", () => {
    const o = buildPrintCdpOptions({
      ...DEFAULT_PRINT_REQUEST,
      orientation: "landscape",
      scale: 0.8,
      printBackground: false,
    });
    expect(o.landscape).toBe(true);
    expect(o.scale).toBe(0.8);
    expect(o.printBackground).toBe(false);
  });

  it("entête + pied → displayHeaderFooter true et templates résolus", () => {
    const o = buildPrintCdpOptions({
      ...DEFAULT_PRINT_REQUEST,
      header: "{title}",
      footer: "{page}/{pages}",
    });
    expect(o.displayHeaderFooter).toBe(true);
    expect(o.headerTemplate).toContain('<span class="title"></span>');
    expect(o.footerTemplate).toContain('<span class="pageNumber"></span>');
  });

  it("entête seul (pied vide) → footerTemplate absent", () => {
    const o = buildPrintCdpOptions({ ...DEFAULT_PRINT_REQUEST, header: "t" });
    expect(o.displayHeaderFooter).toBe(true);
    expect(o.footerTemplate).toBeUndefined();
  });
});

describe("print-templates", () => {
  it("trois gabarits enregistrés", () => {
    expect(Object.keys(PRINT_TEMPLATES).sort()).toEqual(["course", "dense", "simple"]);
  });

  it("getPrintTemplate replie sur simple pour un id inconnu", () => {
    expect(getPrintTemplate("nope").id).toBe("simple");
  });

  it("simple : coquille .mdv-prose avec logo conditionnel, CSS du logo", () => {
    const t = getPrintTemplate("simple");
    expect(t.html).toContain('class="mdv-prose"');
    expect(t.html).toContain("{{#if logo}}");
    expect(t.css).toContain(".pl-logo");
  });

  it("course : bloc couverture + contenu, titre/date échappés", () => {
    const t = getPrintTemplate("course");
    const html = renderPrintTemplate(t, {
      content: "<p>contenu</p>",
      title: "Algèbre <Linéaire>",
      date: "1er janvier",
    });
    expect(html).toContain('class="pl-cover__title"');
    expect(html).toContain("Algèbre &lt;Linéaire&gt;");
    expect(html).toContain("1er janvier");
    expect(html).toContain("<p>contenu</p>");
  });

  it("content inséré brut (HTML du document)", () => {
    const t = getPrintTemplate("simple");
    const html = renderPrintTemplate(t, { content: "<div class=x>é</div>", title: "t", date: "d" });
    expect(html).toContain('<div class=x>é</div>');
  });

  it("printTitleFromPath : basename sans extension", () => {
    expect(printTitleFromPath("/vault/notes/Chapitre 1.md")).toBe("Chapitre 1");
    expect(printTitleFromPath("sans-ext")).toBe("sans-ext");
    expect(printTitleFromPath("/a/b/C.D.md")).toBe("C.D");
  });

  it("logo absent → aucun bloc <img> rendu (variable invisible)", () => {
    const t = getPrintTemplate("simple");
    const html = renderPrintTemplate(t, { content: "<p>c</p>", title: "t", date: "d" });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("pl-logo");
    expect(html).toContain("<p>c</p>");
  });

  it("logo présent → bloc <img> avec src et alt, src échappé", () => {
    const t = getPrintTemplate("course");
    const html = renderPrintTemplate(t, {
      content: "<p>c</p>",
      title: "t",
      date: "d",
      logo: "data:image/png;base64,QUJD",
      altlogo: 'Logo "AMP" & co',
    });
    expect(html).toContain('<img class="pl-cover__logo"');
    expect(html).toContain('src="data:image/png;base64,QUJD"');
    expect(html).toContain('alt="Logo &quot;AMP&quot; &amp; co"');
  });

  it("altlogo absent → attribut alt vide (décoratif)", () => {
    const t = getPrintTemplate("simple");
    const html = renderPrintTemplate(t, { content: "x", title: "t", date: "d", logo: "L" });
    expect(html).toContain('alt="">');
    expect(html).not.toContain("{{");
  });
});

describe("resolveLogoValue", () => {
  const fakeRead = async (abs: string) => {
    if (abs.endsWith("missing.png")) throw new Error("ENOENT");
    return new TextEncoder().encode("ABC"); // "ABC" → base64 QUJD
  };

  it("vide / espaces → null", async () => {
    expect(await resolveLogoValue(undefined, "/v/m.md", fakeRead)).toBeNull();
    expect(await resolveLogoValue("   ", "/v/m.md", fakeRead)).toBeNull();
  });

  it("URL distante et data URI → pass-through", async () => {
    expect(await resolveLogoValue("https://ex.com/logo.png", "/v/m.md", fakeRead)).toBe("https://ex.com/logo.png");
    expect(await resolveLogoValue("data:image/png;base64,AAAA", "/v/m.md", fakeRead)).toBe("data:image/png;base64,AAAA");
  });

  it("chemin relatif → résolu contre le dossier du document, data URI", async () => {
    const seen: string[] = [];
    const read = async (abs: string) => { seen.push(abs); return new Uint8Array([65, 66, 67]); };
    const src = await resolveLogoValue("assets/logo.png", "/vault/notes/cours.md", read);
    expect(seen).toEqual(["/vault/notes/assets/logo.png"]);
    expect(src).toBe("data:image/png;base64,QUJD");
  });

  it("chemin absolu → lu tel quel, MIME selon extension", async () => {
    const src = await resolveLogoValue("/etc/logo.svg", "/v/m.md", fakeRead);
    expect(src).toBe("data:image/svg+xml;base64,QUJD");
  });

  it("chemin Windows (\\ dans le document) → jointure cohérente", async () => {
    const seen: string[] = [];
    const read = async (abs: string) => { seen.push(abs); return new Uint8Array([1]); };
    await resolveLogoValue("imgs\\logo.png", "C:\\vault\\cours.md", read);
    expect(seen).toEqual(["C:\\vault\\imgs\\logo.png"]);
  });

  it("fichier illisible → null (jamais de <img> cassé)", async () => {
    expect(await resolveLogoValue("missing.png", "/v/m.md", fakeRead)).toBeNull();
  });

  it("lecture vide → null", async () => {
    const read = async () => new Uint8Array(0);
    expect(await resolveLogoValue("a.png", "/v/m.md", read)).toBeNull();
  });
});
