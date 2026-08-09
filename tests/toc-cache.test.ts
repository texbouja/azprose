import { describe, expect, test } from "bun:test";
import { makeTocMemo, structuralTocHash } from "@/lib/toc-cache";

/**
 * Hash STRUCTURAL de la TOC (phases 6/6bis) : seuls les headings et les
 * wikilinks block-level conformes structurent le plan. Tout le reste
 * (paragraphes, YAML de colles, math, fences, images…) ne change pas le hash
 * → la forêt reste mémoïsée pendant la frappe.
 */

const DOC = `# Manuel

Bienvenue dans le [[manuel]].

> [!note] Une note de corps
> Du texte qui ne structure pas le plan.

## Section 1

[[chapitre-1]]

\`\`\`colle
date: 2026-01-07
matiere: maths
notes:
  rub1: 3.5
  rub2: 4
\`\`\`

## Section 2

Texte libre avec [[lien-inline]] au milieu.
`;

describe("structuralTocHash — stabilité", () => {
  test("déterministe : même contenu → même hash", () => {
    expect(structuralTocHash(DOC)).toBe(structuralTocHash(DOC));
  });

  test("changement de CORPS (paragraphe) → même hash", () => {
    const edited = DOC.replace("Bienvenue dans le [[manuel]].", "Bienvenue dans le manuel, modifié au milieu.");
    expect(structuralTocHash(edited)).toBe(structuralTocHash(DOC));
  });

  test("changement dans une fence (évaluation de colle) → même hash", () => {
    const edited = DOC.replace("  rub1: 3.5", "  rub1: 2.5").replace("  rub2: 4", "  rub2: 4.5");
    expect(structuralTocHash(edited)).toBe(structuralTocHash(DOC));
  });

  test("changement dans un callout → même hash", () => {
    const edited = DOC.replace("Du texte qui ne structure pas le plan.", "Autre texte de corps.");
    expect(structuralTocHash(edited)).toBe(structuralTocHash(DOC));
  });

  test("wikilink INLINE (non conforme) → même hash", () => {
    const edited = DOC.replace("[[lien-inline]]", "[[autre-inline]]");
    expect(structuralTocHash(edited)).toBe(structuralTocHash(DOC));
  });
});

describe("structuralTocHash — sensibilité structurelle", () => {
  test("titre renommé → hash différent", () => {
    const edited = DOC.replace("## Section 1", "## Section Un");
    expect(structuralTocHash(edited)).not.toBe(structuralTocHash(DOC));
  });

  test("titre ajouté → hash différent", () => {
    const edited = DOC.replace("## Section 2", "## Section 1.5\n\n## Section 2");
    expect(structuralTocHash(edited)).not.toBe(structuralTocHash(DOC));
  });

  test("niveau de titre changé → hash différent", () => {
    const edited = DOC.replace("## Section 1", "### Section 1");
    expect(structuralTocHash(edited)).not.toBe(structuralTocHash(DOC));
  });

  test("lien block-level ajouté/retiré → hash différent", () => {
    const added = DOC.replace("## Section 2", "## Section 2\n\n[[chapitre-2]]");
    expect(structuralTocHash(added)).not.toBe(structuralTocHash(DOC));
    const removed = DOC.replace("\n[[chapitre-1]]\n", "\n");
    expect(structuralTocHash(removed)).not.toBe(structuralTocHash(DOC));
  });

  test("alias de lien changé → hash différent", () => {
    const edited = DOC.replace("[[chapitre-1]]", "[[chapitre-1|Le Chapitre]]");
    expect(structuralTocHash(edited)).not.toBe(structuralTocHash(DOC));
  });

  test("ligne d'un heading décalée → hash différent", () => {
    const shifted = DOC.replace("## Section 1\n", "## Section 1\n\nLigne de corps ajoutée.\n");
    expect(structuralTocHash(shifted)).not.toBe(structuralTocHash(DOC));
  });
});

describe("makeTocMemo", () => {
  test("instance initiale : jamais de hit (clé vide)", () => {
    const memo = makeTocMemo();
    expect(memo.key).toBe("");
    expect(memo.hash).toBe("");
    expect(memo.forest).toBeNull();
  });
});
