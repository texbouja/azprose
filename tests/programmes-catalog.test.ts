import { describe, expect, test } from "bun:test";
import { catalogue, CORPUS_VERSION } from "@/programmes/catalog";

/**
 * Garde-fous du catalogue GÉNÉRÉ (`scripts/build-corpus.mjs`). Ils protègent
 * deux invariants du plan `../agents/azprose/programmes-nav-plan.md` : le
 * catalogue ne porte que des métadonnées, et chaque entrée est filtrable.
 */
describe("catalogue des programmes", () => {
  test("le catalogue n'est pas vide et porte une version", () => {
    expect(catalogue.length).toBeGreaterThan(0);
    expect(CORPUS_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });

  test("chaque entrée est filtrable : matière et au moins une filière", () => {
    for (const e of catalogue) {
      expect(e.matiere).not.toBe("");
      expect(e.filiere.length).toBeGreaterThan(0);
      expect(e.fichier).toMatch(/\.md$/);
      expect(e.titre.length).toBeGreaterThan(0);
    }
  });

  test("les identifiants sont uniques", () => {
    const ids = catalogue.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("un niveau déclaré vaut 1 ou 2 ; absent, il signifie « toutes les années »", () => {
    for (const e of catalogue) {
      if (e.niveau !== undefined) expect([1, 2]).toContain(e.niveau);
    }
  });

  test("AUCUN contenu de programme dans le catalogue", () => {
    // Le corpus pèse des centaines de Ko : si une entrée devenait volumineuse,
    // c'est que le contenu s'y est glissé — le module est chargé au démarrage.
    for (const e of catalogue) {
      expect(JSON.stringify(e).length).toBeLessThan(400);
    }
  });
});
