import { describe, expect, test } from "bun:test";
import {
  buildProseStyleCss,
  buildReportPrintCss,
  type ProseStyleSettings,
} from "../src/lib/prose-style-css";

/** Réglages complets (forme structurelle partagée avec le store print). */
function style(over: Partial<ProseStyleSettings> = {}): ProseStyleSettings {
  return {
    fontFamily: "fira-sans",
    customFontName: "",
    monoFont: "fira-code",
    fontSize: 15,
    lineHeight: 1.65,
    maxWidth: 800,
    customCss: "",
    h1Size: 2.1,
    h1Align: "left",
    h1MarginTop: 0,
    h1MarginBottom: 0.5,
    h2Size: 1.55,
    h2Align: "left",
    h2MarginTop: 2.0,
    h2MarginBottom: 0.5,
    h3Size: 1.25,
    h3Align: "left",
    h3MarginTop: 1.6,
    h3MarginBottom: 0.5,
    olLevel1: "decimal",
    olLevel2: "lower-alpha",
    olLevel3: "lower-roman",
    ...over,
  };
}

describe("buildProseStyleCss", () => {
  test("scope par défaut .mdv-prose : police, taille, interligne, max-width", () => {
    const css = buildProseStyleCss(style());
    expect(css).toContain(
      ".mdv-prose{font-family:'Fira Sans', -apple-system, BlinkMacSystemFont, sans-serif;font-size:15px;line-height:1.65;max-width:800px;}",
    );
  });

  test("police custom → nom saisi (échappé entre guillemets) + mono", () => {
    const css = buildProseStyleCss(style({ fontFamily: "custom", customFontName: "Lora" }));
    expect(css).toContain("font-family:'Lora', -apple-system");
    expect(css).toContain(".mdv-prose code,.mdv-prose pre{font-family:'Fira Code',");
  });

  test("titres H1-H3 : taille em, alignement, marges", () => {
    const css = buildProseStyleCss(style());
    expect(css).toContain(".mdv-prose h1{font-size:2.1em;text-align:left;margin:0em 0 0.5em;}");
    expect(css).toContain(".mdv-prose h2{font-size:1.55em;text-align:left;margin:2em 0 0.5em;}");
    expect(css).toContain(".mdv-prose h3{font-size:1.25em;text-align:left;margin:1.6em 0 0.5em;}");
  });

  test("titres centrés + marges custom propagées", () => {
    const css = buildProseStyleCss(
      style({ h1Align: "center", h1MarginTop: 1, h1MarginBottom: 0.25 }),
    );
    expect(css).toContain(".mdv-prose h1{font-size:2.1em;text-align:center;margin:1em 0 0.25em;}");
  });

  test("listes ordonnées imbriquées (3 niveaux)", () => {
    const css = buildProseStyleCss(style());
    expect(css).toContain(".mdv-prose ol{list-style-type:decimal;}");
    expect(css).toContain(".mdv-prose ol ol{list-style-type:lower-alpha;}");
    expect(css).toContain(".mdv-prose ol ol ol{list-style-type:lower-roman;}");
  });

  test("scope en LISTE : sélecteurs descendants expansés pour CHAQUE élément (pas de sélecteur nu)", () => {
    const css = buildProseStyleCss(style(), ".rp-enonce-box, .rp-obs-content");
    // Règle de base : la liste entière (les deux boîtes).
    expect(css).toContain(".rp-enonce-box, .rp-obs-content{font-family:");
    // Descendants : chaque boîte a SON propre sélecteur — jamais `a, b h2`
    // (le `a` NU matcherait toute la boîte : bug rendu impression).
    expect(css).toContain(".rp-enonce-box h2,.rp-obs-content h2{");
    expect(css).toContain(".rp-enonce-box ol ol,.rp-obs-content ol ol{");
    expect(css).toContain(".rp-enonce-box code,.rp-obs-content code,.rp-enonce-box pre,.rp-obs-content pre{");
    // Le scope nu ne doit JAMAIS matcher la boîte entière pour ces règles.
    expect(css).not.toContain(".rp-enonce-box, .rp-obs-content h2{");
    expect(css).not.toContain(".rp-enonce-box, .rp-obs-content code{");
  });

  test("includeMaxWidth=false → pas de max-width (gabarit à largeur fixe)", () => {
    const css = buildProseStyleCss(style(), ".rp-enonce-box, .rp-obs-content", false);
    expect(css).not.toContain("max-width");
  });
});

describe("buildReportPrintCss", () => {
  test("scope énoncé + observations, sans max-width", () => {
    const css = buildReportPrintCss(style());
    expect(css).toContain(".rp-enonce-box, .rp-obs-content{font-family:");
    expect(css).not.toContain("max-width");
  });

  test("customCss ajouté tel quel à la fin", () => {
    const css = buildReportPrintCss(style({ customCss: ".rp-enonce-box{margin-bottom:4px}" }));
    expect(css.trimEnd().endsWith(".rp-enonce-box{margin-bottom:4px}")).toBe(true);
  });

  test("customCss vide → pas de ligne parasite", () => {
    const css = buildReportPrintCss(style());
    expect(css.trim().split("\n").every((l) => l.includes("{"))).toBe(true);
  });
});
