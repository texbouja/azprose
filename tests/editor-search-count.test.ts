import { describe, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { compter, libelleComptage } from "@/lib/editor-search-panel";

const etat = (doc: string) => EditorState.create({ doc });
const nulle = { from: 0, to: 0 };

describe("comptage des correspondances", () => {
  test("compte toutes les occurrences du document", () => {
    const c = compter(new SearchQuery({ search: "cible" }), etat("cible et cible, puis cible"), nulle);
    expect(c.total).toBe(3);
    expect(c.tronque).toBe(false);
  });

  test("situe le curseur dans la liste", () => {
    // La correspondance « courante » est celle que la sélection recouvre —
    // c'est ainsi que se déplacent `findNext` / `findPrevious`.
    const doc = etat("cible et cible, puis cible");
    const c = compter(new SearchQuery({ search: "cible" }), doc, { from: 9, to: 14 });
    expect(c.courante).toBe(2);
    expect(libelleComptage(c, "Aucun résultat")).toBe("2/3");
  });

  test("curseur hors correspondance : le total seul", () => {
    const doc = etat("cible et cible");
    const c = compter(new SearchQuery({ search: "cible" }), doc, { from: 6, to: 6 });
    expect(c.courante).toBe(0);
    expect(libelleComptage(c, "Aucun résultat")).toBe("2");
  });

  test("aucune correspondance : le libellé le dit", () => {
    const c = compter(new SearchQuery({ search: "absent" }), etat("cible"), nulle);
    expect(c.total).toBe(0);
    expect(libelleComptage(c, "Aucun résultat")).toBe("Aucun résultat");
  });

  test("la casse et le mot entier sont respectés", () => {
    const doc = etat("Cible cible cibles");
    expect(compter(new SearchQuery({ search: "cible", caseSensitive: true }), doc, nulle).total).toBe(2);
    expect(compter(new SearchQuery({ search: "cible", wholeWord: true }), doc, nulle).total).toBe(2);
  });

  test("une expression régulière invalide ne compte rien", () => {
    // Le motif est en cours de frappe : ne rien compter vaut mieux que lever.
    const c = compter(new SearchQuery({ search: "(", regexp: true }), etat("(a)"), nulle);
    expect(c.total).toBe(0);
  });
});

describe("plafond de comptage", () => {
  // Le comptage parcourt le document à CHAQUE frappe : sans plafond, une
  // recherche d'une lettre sur un gros fichier balaierait tout le texte à
  // chaque caractère tapé.
  const doc = etat("a ".repeat(50));

  test("s'arrête au plafond et le signale", () => {
    const c = compter(new SearchQuery({ search: "a" }), doc, nulle, 10);
    expect(c.total).toBe(10);
    expect(c.tronque).toBe(true);
    expect(libelleComptage(c, "—")).toBe("10+");
  });

  test("le rang du curseur survit au plafond", () => {
    const c = compter(new SearchQuery({ search: "a" }), doc, { from: 2, to: 3 }, 10);
    expect(libelleComptage(c, "—")).toBe("2/10+");
  });
});
