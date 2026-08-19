import { describe, expect, test } from "bun:test";
import {
  cssEspacementMaths,
  espacementEm,
  espacementValide,
  MATH_SPACING_DEFAUT,
  MATH_SPACINGS,
} from "@/lib/mathjax-spacing";

describe("espacement des formules hors texte", () => {
  test("les trois valeurs sont acceptées", () => {
    for (const v of MATH_SPACINGS) expect(espacementValide(v)).toBe(v);
  });

  test("toute autre valeur retombe sur le défaut, qui est l'espacement d'origine", () => {
    expect(espacementValide("huge")).toBe(MATH_SPACING_DEFAUT);
    expect(espacementValide(null)).toBe(MATH_SPACING_DEFAUT);
    expect(MATH_SPACING_DEFAUT).toBe("large");
    // 1,2em : la valeur mesurée dans l'aperçu avant que le réglage existe.
    expect(espacementEm("large")).toBe(1.2);
  });

  test("les trois densités sont strictement croissantes", () => {
    expect(espacementEm("small")).toBeLessThan(espacementEm("medium"));
    expect(espacementEm("medium")).toBeLessThan(espacementEm("large"));
  });
});

describe("CSS pour les documents sans preview.css (impression, export)", () => {
  test("l'espace demandé est écrit sur le porteur de formule", () => {
    expect(cssEspacementMaths("small")).toContain(".mdv-prose .math-block{margin:0.3em 0;}");
  });

  test("la marge propre de MathJax est remise à zéro", () => {
    // Sans cela, les marges FUSIONNENT et la plus grande gagne : tout réglage
    // sous 0,7em serait sans effet.
    expect(cssEspacementMaths("small")).toContain('mjx-container[display="true"]{margin:0;}');
  });

  test("la marge du paragraphe qui précède est effacée", () => {
    // Sans cela, le blanc AU-DESSUS reste celui du paragraphe voisin (1em) et
    // le réglage n'agit que sous la formule — mesuré 16 px contre 5 px.
    expect(cssEspacementMaths("small")).toContain(".mdv-prose p:has(+ .math-block){margin-bottom:0;}");
  });

  test("la portée est paramétrable — les planches de colles ont la leur", () => {
    const css = cssEspacementMaths("medium", ".rp-enonce-box");
    expect(css).toContain(".rp-enonce-box .math-block{margin:0.7em 0;}");
    expect(css).not.toContain(".mdv-prose");
  });
});
