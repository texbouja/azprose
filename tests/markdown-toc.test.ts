import { describe, expect, test } from "bun:test";
import { parseMarkdownToc, stripInlineMarkdown } from "@/lib/markdown-toc";

describe("stripInlineMarkdown", () => {
  test("garde le texte brut tel quel", () => {
    expect(stripInlineMarkdown("Introduction")).toBe("Introduction");
  });

  test("extrait le texte des liens markdown et images", () => {
    expect(stripInlineMarkdown("[voir la doc](https://ex.org)")).toBe("voir la doc");
    expect(stripInlineMarkdown("![logo](img.png)")).toBe("logo");
  });

  test("extrait le texte des wikilinks (alias ou page)", () => {
    expect(stripInlineMarkdown("[[cours/alglin]]")).toBe("cours/alglin");
    expect(stripInlineMarkdown("[[cours/alglin|Algèbre linéaire]]")).toBe("Algèbre linéaire");
  });

  test("retire gras, italique, code et barré", () => {
    expect(stripInlineMarkdown("**important**")).toBe("important");
    expect(stripInlineMarkdown("*accentué*")).toBe("accentué");
    expect(stripInlineMarkdown("__souligné__")).toBe("souligné");
    expect(stripInlineMarkdown("_italique_")).toBe("italique");
    expect(stripInlineMarkdown("`const x = 1`")).toBe("const x = 1");
    expect(stripInlineMarkdown("~~supprimé~~")).toBe("supprimé");
  });

  test("combine plusieurs syntaxes et réduit les espaces", () => {
    expect(stripInlineMarkdown("[**Algèbre** `linéaire`](x)")).toBe("Algèbre linéaire");
    expect(stripInlineMarkdown("Titre   à   espaces")).toBe("Titre à espaces");
  });
});

describe("parseMarkdownToc", () => {
  test("liste les titres avec niveau et ligne corrects", () => {
    const src = "# Intro\n\nTexte.\n\n## Section\n\n### Sous-section\n";
    expect(parseMarkdownToc(src)).toEqual([
      { level: 1, line: 1, text: "Intro" },
      { level: 2, line: 5, text: "Section" },
      { level: 3, line: 7, text: "Sous-section" },
    ]);
  });

  test("tolère 0 à 3 espaces d'indentation avant les dièses", () => {
    expect(parseMarkdownToc("## Titre").map((e) => e.text)).toEqual(["Titre"]);
    expect(parseMarkdownToc("  ## Indenté").map((e) => e.text)).toEqual(["Indenté"]);
    expect(parseMarkdownToc("   ### Trois")).toHaveLength(1);
  });

  test("exige un espace après les dièses (CommonMark)", () => {
    // #sansEspace et ###x ne sont pas des headings ATX ; 7 dièses non plus.
    expect(parseMarkdownToc("#sansEspace\n###x\n####### sept")).toHaveLength(0);
    expect(parseMarkdownToc("#")).toHaveLength(0); // titre vide ignoré
    expect(parseMarkdownToc("# ")).toHaveLength(0);
  });

  test("saute le frontmatter YAML (même s'il contient des #)", () => {
    const src = "---\ntitle: Exemple\ntags:\n  - #important\n---\n\n# Vrai titre\n";
    expect(parseMarkdownToc(src)).toEqual([{ level: 1, line: 7, text: "Vrai titre" }]);
  });

  test("ignore les dièses à l'intérieur des fences de code", () => {
    const src = "# Intro\n\n```md\n# Titre dans le code\n```\n\n## Vrai\n";
    expect(parseMarkdownToc(src).map((e) => e.text)).toEqual(["Intro", "Vrai"]);
  });

  test("gère les fences tildes", () => {
    const src = "# Intro\n\n~~~\n# Dans tilde\n~~~\n\n## Vrai\n";
    expect(parseMarkdownToc(src).map((e) => e.text)).toEqual(["Intro", "Vrai"]);
  });

  test("strippe les dièses de fin précédés d'espace", () => {
    expect(parseMarkdownToc("## Titre ##").map((e) => e.text)).toEqual(["Titre"]);
  });

  test("ignore les titres dont le texte est vide après nettoyage", () => {
    expect(parseMarkdownToc("# []()\n")).toHaveLength(0);
  });

  test("retourne [] sur un document vide ou sans titre", () => {
    expect(parseMarkdownToc("")).toEqual([]);
    expect(parseMarkdownToc("Du texte simple.\n\nPas de titre.\n")).toEqual([]);
  });

  test("nettote les titres pour l'affichage", () => {
    const src = "# [[cours/alglin|Algèbre **linéaire**]]\n\n## [TD 1](td1.md) — `valeurs`\n";
    expect(parseMarkdownToc(src)).toEqual([
      { level: 1, line: 1, text: "Algèbre linéaire" },
      { level: 2, line: 3, text: "TD 1 — valeurs" },
    ]);
  });

  test("un tiret bas au milieu d'un mot n'est pas de l'italique", () => {
    expect(stripInlineMarkdown("foo_bar_baz")).toBe("foo_bar_baz");
    expect(parseMarkdownToc("# foo_bar_baz")[0].text).toBe("foo_bar_baz");
  });
});
