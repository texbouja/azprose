import { describe, expect, test } from "bun:test";
import { grouperParMatiere, groupeOuvert } from "@/lib/programmes-groupes";

const P = (id: string, matiere?: string) => ({ id, matiere });

describe("regroupement des programmes par matière", () => {
  test("un groupe par matière, dans l'ordre alphabétique", () => {
    const g = grouperParMatiere([
      P("math-mpsi", "mathématiques"),
      P("phys-mp", "physique"),
      P("chim-mp", "chimie"),
      P("math-mp", "mathématiques"),
    ]);
    expect(g.map((x) => x.matiere)).toEqual(["chimie", "mathématiques", "physique"]);
    expect(g[1].items.map((p) => p.id)).toEqual(["math-mpsi", "math-mp"]);
  });

  test("l'ordre d'entrée est préservé DANS un groupe", () => {
    // Le composant trie déjà par filière avant d'appeler : le regroupement ne
    // doit pas défaire ce classement.
    const g = grouperParMatiere([P("b", "si"), P("a", "si")]);
    expect(g[0].items.map((p) => p.id)).toEqual(["b", "a"]);
  });

  test("les programmes sans matière forment un groupe, placé en DERNIER", () => {
    // Fourre-tout : il ne doit pas ouvrir la liste.
    const g = grouperParMatiere([P("x"), P("math", "mathématiques")]);
    expect(g.map((x) => x.matiere)).toEqual(["mathématiques", ""]);
  });

  test("une matière vide ou en espaces compte comme absente", () => {
    const g = grouperParMatiere([P("a", "   "), P("b", "")]);
    expect(g).toHaveLength(1);
    expect(g[0].matiere).toBe("");
  });

  test("une liste vide ne produit aucun groupe", () => {
    expect(grouperParMatiere([])).toEqual([]);
  });
});

describe("ouverture d'un groupe", () => {
  const groupe = { matiere: "mathématiques", items: [P("math-mpsi"), P("math-mp")] };

  test("fermé par défaut", () => {
    expect(groupeOuvert(groupe, new Set(), [])).toBe(false);
  });

  test("ouvert quand l'utilisateur l'a déplié", () => {
    expect(groupeOuvert(groupe, new Set(["mathématiques"]), [])).toBe(true);
  });

  test("ouvert d'office si un de ses programmes est retenu", () => {
    // C'est la matière de l'utilisateur : lui cacher ce qu'il a choisi serait
    // absurde.
    expect(groupeOuvert(groupe, new Set(), ["math-mp"])).toBe(true);
  });

  test("une sélection ailleurs n'ouvre pas ce groupe", () => {
    expect(groupeOuvert(groupe, new Set(), ["phys-mp"])).toBe(false);
  });
});
