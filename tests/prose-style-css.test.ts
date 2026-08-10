import { describe, expect, test } from "bun:test";
import {
  buildPreviewProseCss,
  buildProseStyleCss,
  buildReportPrintCss,
  type PreviewProseStyleSettings,
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

/** Réglages d'aperçu (PreviewStyle du store markdown-settings, forme structurelle). */
function previewStyle(over: Partial<PreviewProseStyleSettings> = {}): PreviewProseStyleSettings {
  return {
    ...style(),
    h1FontFamily: "custom",
    h1CustomFontName: "Source Serif 4",
    h2FontFamily: "inherit",
    h2CustomFontName: "",
    h3FontFamily: "inherit",
    h3CustomFontName: "",
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

describe("buildPreviewProseCss", () => {
  test("scope .mdv-prose fixe : police, taille, interligne, max-width (comme MarkdownPreview)", () => {
    const css = buildPreviewProseCss(previewStyle());
    expect(css).toContain(
      ".mdv-prose{font-family:'Fira Sans', -apple-system, BlinkMacSystemFont, sans-serif;font-size:15px;line-height:1.65;max-width:800px;}",
    );
    expect(css).toContain(".mdv-prose code,.mdv-prose pre{font-family:'Fira Code',");
  });

  test("police de TITRES dédiée (h1FontFamily + custom) — absente du builder d'impression", () => {
    const css = buildPreviewProseCss(previewStyle());
    // h1 = police de titres (custom) ; h2/h3 = inherit (police du document).
    expect(css).toContain(".mdv-prose h1{font-size:2.1em;text-align:left;font-family:'Source Serif 4',");
    expect(css).toContain(".mdv-prose h2{font-size:1.55em;text-align:left;font-family:inherit;");
    expect(css).toContain(".mdv-prose h3{font-size:1.25em;text-align:left;font-family:inherit;");
  });

  test("marges des titres présentes (champs H du builder d'impression)", () => {
    const css = buildPreviewProseCss(previewStyle());
    expect(css).toContain("margin:0em 0 0.5em;");
    expect(css).toContain("margin:2em 0 0.5em;");
    expect(css).toContain("margin:1.6em 0 0.5em;");
  });

  test("listes ordonnées imbriquées (3 niveaux)", () => {
    const css = buildPreviewProseCss(previewStyle());
    expect(css).toContain(".mdv-prose ol{list-style-type:decimal;}");
    expect(css).toContain(".mdv-prose ol ol{list-style-type:lower-alpha;}");
    expect(css).toContain(".mdv-prose ol ol ol{list-style-type:lower-roman;}");
  });

  test("customCss ajouté en fin de bloc", () => {
    const css = buildPreviewProseCss(previewStyle({ customCss: ".mdv-prose p{margin:0}" }));
    expect(css.trimEnd().endsWith(".mdv-prose p{margin:0}")).toBe(true);
  });

  test("une instance PreviewStyle du store est assignable (structure)", () => {
    // Vérification structurelle : toutes les clés PreviewStyle requises par
    // PreviewProseStyleSettings existent (le store doit compiler sans erreur).
    const keys = [
      "fontFamily", "customFontName", "monoFont", "fontSize", "lineHeight", "maxWidth",
      "customCss",
      "h1FontFamily", "h1CustomFontName", "h1Size", "h1Align", "h1MarginTop", "h1MarginBottom",
      "h2FontFamily", "h2CustomFontName", "h2Size", "h2Align", "h2MarginTop", "h2MarginBottom",
      "h3FontFamily", "h3CustomFontName", "h3Size", "h3Align", "h3MarginTop", "h3MarginBottom",
      "olLevel1", "olLevel2", "olLevel3",
    ] as const;
    const p = previewStyle();
    for (const k of keys) expect(k in p).toBe(true);
  });
});
