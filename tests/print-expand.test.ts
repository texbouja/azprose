import { describe, expect, test } from "bun:test";
import { expandWikilinksForPrint } from "../src/markdown/print-expand";

/**
 * Tests du chantier 4 : expansion des wikilinks block-level à l'impression.
 *
 * CONVENTION (décision utilisateur) : un `[[wikilink]]` simple n'est transclu
 * QUE s'il est SEUL SUR SA LIGNE, encadré de lignes vides, hors liste, hors
 * fence (indentation 0-3 espaces tolérée). Le module est une réécriture
 * syntaxique pure (`[[x]]` → `![[x]]`) : la résolution (fragments, récursion,
 * cycles, placeholders, PDF) est testée côté `resolveTransclusions`
 * (transclusion.test.ts) — pas dupliquée ici.
 */

describe("expandWikilinksForPrint", () => {
  test("lien seul sur sa ligne encadré de lignes vides → transclusion", () => {
    const src = "# Titre\n\n[[chapitre]]\n\nSuite du texte\n";
    expect(expandWikilinksForPrint(src)).toBe("# Titre\n\n![[chapitre]]\n\nSuite du texte\n");
  });

  test("début de document (pas de ligne vide avant) → transclusion", () => {
    expect(expandWikilinksForPrint("[[note]]\n\ntexte\n")).toBe("![[note]]\n\ntexte\n");
  });

  test("fin de document (pas de ligne vide après) → transclusion", () => {
    expect(expandWikilinksForPrint("texte\n\n[[note]]\n")).toBe("texte\n\n![[note]]\n");
  });

  test("au milieu d'un paragraphe → référence conservée", () => {
    const src = "Voir [[chapitre]] pour les détails.\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("précédé d'une ligne non vide → référence conservée", () => {
    const src = "paragraphe\n[[chapitre]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("suivi d'une ligne non vide → référence conservée", () => {
    const src = "texte\n\n[[chapitre]]\nparagraphe\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("dans une liste (préfixe -) → jamais transclu", () => {
    const src = "- [[chapitre]]\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("dans une liste numérotée → jamais transclu", () => {
    const src = "1. [[chapitre]]\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("indentation 0-3 espaces tolérée → transclusion", () => {
    expect(expandWikilinksForPrint("texte\n\n   [[chapitre]]\n\ntexte\n")).toBe("texte\n\n   ![[chapitre]]\n\ntexte\n");
  });

  test("indentation 4 espaces (bloc code) → jamais touché", () => {
    const src = "texte\n\n    [[chapitre]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("deux wikilinks sur la même ligne → référence conservée", () => {
    const src = "[[a]] et [[b]]\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("dans une fence de code → jamais touché", () => {
    const src = "```markdown\n[[exemple]]\n```\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("fence tilde ~```~``` → jamais touché", () => {
    const src = "~~~\n[[exemple]]\n~~~\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("après la fermeture d'une fence → transclusion", () => {
    const src = "```\ncode\n```\n\n[[chapitre]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe("```\ncode\n```\n\n![[chapitre]]\n\ntexte\n");
  });

  test("alias `[[cible|alias]]` → target seul (alias ignoré)", () => {
    const src = "\n[[chapitre|Voir le chapitre]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe("\n![[chapitre]]\n\ntexte\n");
  });

  test("fragment `[[fichier#section]]` → conservé dans la transclusion", () => {
    const src = "\n[[chapitre#conclusion]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe("\n![[chapitre#conclusion]]\n\ntexte\n");
  });

  test("fragment ancre de bloc `[[fichier#^bloc]]` → conservé", () => {
    const src = "\n[[chapitre#^b1]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe("\n![[chapitre#^b1]]\n\ntexte\n");
  });

  test("fichier PDF → jamais transformé (reste un lien, géré par pdf-rect-embed)", () => {
    const src = "\n[[cours.pdf#page=3&rect=10,10,100,100]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("`![[…]]` déjà présents → intouchés (idempotence)", () => {
    const src = "\n![[chapitre]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("contenu avec crochets imbriqués illégal → ligne conservée verbatim", () => {
    const src = "\n[[a [b] c]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe(src);
  });

  test("fence fermée ouvrant la porte à la transclusion suivante", () => {
    const src = "```\n[[x]]\n```\n\n[[y]]\n\ntexte\n";
    expect(expandWikilinksForPrint(src)).toBe("```\n[[x]]\n```\n\n![[y]]\n\ntexte\n");
  });

  test("string vide → identité", () => {
    expect(expandWikilinksForPrint("")).toBe("");
  });
});
