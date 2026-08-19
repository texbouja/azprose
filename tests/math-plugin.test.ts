import { describe, expect, test } from "bun:test";
import MarkdownIt from "markdown-it";
import { mathPlugin } from "@/markdown/math-plugin";

const md = new MarkdownIt().use(mathPlugin);
const rendu = (src: string) => md.render(src).trim();

describe("délimiteurs mathématiques reconnus", () => {
  test("les deux formes en ligne produisent le même balisage", () => {
    const dollars = rendu("$x^2$");
    const latex = rendu("\\(x^2\\)");
    expect(dollars).toContain('<span class="math-inline" data-math-source="x^2">');
    expect(latex).toBe(dollars);
  });

  test("les deux formes hors texte produisent le même balisage", () => {
    const dollars = rendu("$$x^2$$");
    const latex = rendu("\\[x^2\\]");
    expect(dollars).toContain('<p class="math-block" data-math-source="x^2">');
    expect(latex).toBe(dollars);
  });

  test("une formule LaTeX au fil du texte", () => {
    expect(rendu("texte \\( a \\le b \\) fin")).toContain("math-inline");
  });

  test("plusieurs formules sur une même ligne", () => {
    const html = rendu("a\\(x\\)b\\(y\\)c");
    expect(html.match(/math-inline/g)).toHaveLength(2);
  });

  test("une formule hors texte peut tenir sur plusieurs lignes", () => {
    expect(rendu("\\[\n\\int_0^1 f\n\\]")).toContain('data-math-source="\\int_0^1 f"');
  });
});

describe("ce qui ne doit PAS devenir une formule", () => {
  test("un délimiteur jamais fermé reste du texte", () => {
    // La règle ne consomme rien : `escape` reprend la main, comme avant.
    expect(rendu("\\(sans fermeture")).not.toContain("math-inline");
    expect(rendu("\\(sans fermeture")).toContain("(sans fermeture");
  });

  test("un antislash échappé n'ouvre pas de formule", () => {
    const html = rendu("\\\\(pas des maths\\\\)");
    expect(html).not.toContain("math-inline");
  });

  test("un dollar échappé reste un dollar", () => {
    expect(rendu("\\$12")).toContain("$12");
    expect(rendu("\\$12")).not.toContain("math-inline");
  });

  test("des délimiteurs vides ne produisent pas de formule", () => {
    expect(rendu("\\(\\)")).not.toContain("math-inline");
    expect(rendu("\\[ \\]")).not.toContain("math-block");
  });
});

describe("le contenu LaTeX traverse intact", () => {
  test("les commandes à antislash ne sont pas mangées par la règle d'échappement", () => {
    // C'est ce que la règle `escape` faisait avant qu'on passe devant elle :
    // `\le` devenait « le ».
    expect(rendu("\\(a \\le b\\)")).toContain("a \\le b");
  });

  test("souligné et étoile ne déclenchent ni emphase ni gras", () => {
    const html = rendu("\\(a_1 * b_2\\)");
    expect(html).not.toContain("<em>");
    expect(html).toContain("a_1 * b_2");
  });

  test("le markdown autour reste interprété", () => {
    expect(rendu("**gras** et \\(x\\)")).toContain("<strong>gras</strong>");
  });
});
