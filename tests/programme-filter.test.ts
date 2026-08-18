import { describe, expect, test } from "bun:test";
import {
  ajouterCritere,
  criteresProposables,
  filtrerProgrammes,
  memeCritere,
  retirerCritere,
  retirerDernierCritere,
  type Critere,
} from "@/nav/programme-filter";
import type { EntreeProgramme } from "@/programmes/catalog";

/** Catalogue de test — plus large que le corpus réel, pour couvrir le cas
 *  « programme sans niveau » (sciences industrielles, informatique). */
const CATALOGUE: EntreeProgramme[] = [
  { fichier: "math-mpsi-mp2i.md", id: "math-mpsi-mp2i", titre: "Programme de mathématiques — MPSI, MP2I", matiere: "mathematiques", filiere: ["MPSI", "MP2I"], niveau: 1 },
  { fichier: "math-mp-mpi.md", id: "math-mp-mpi", titre: "Programme de mathématiques — MP, MPI", matiere: "mathematiques", filiere: ["MP", "MPI"], niveau: 2 },
  { fichier: "phys-mp.md", id: "phys-mp", titre: "Programme de physique — MP", matiere: "physique", filiere: ["MP"], niveau: 2 },
  { fichier: "chim-mp.md", id: "chim-mp", titre: "Programme de chimie — MP", matiere: "chimie", filiere: ["MP"], niveau: 2 },
  { fichier: "si-commun.md", id: "si-commun", titre: "Programme de sciences industrielles", matiere: "sciences industrielles", filiere: ["MPSI", "MP", "PCSI"] },
];

const c = (categorie: Critere["categorie"], valeur: string): Critere =>
  ({ categorie, valeur, libelle: valeur });

const ids = (liste: EntreeProgramme[]) => liste.map((e) => e.id).sort();

describe("filtrage des programmes", () => {
  test("sans critère ni texte : le catalogue entier", () => {
    expect(filtrerProgrammes(CATALOGUE, [])).toHaveLength(CATALOGUE.length);
  });

  test("catégories différentes : ET", () => {
    const r = filtrerProgrammes(CATALOGUE, [c("matiere", "mathematiques"), c("filiere", "mp")]);
    expect(ids(r)).toEqual(["math-mp-mpi"]);
  });

  test("valeurs d'une même catégorie : OU", () => {
    const r = filtrerProgrammes(CATALOGUE, [c("matiere", "physique"), c("matiere", "chimie")]);
    expect(ids(r)).toEqual(["chim-mp", "phys-mp"]);
  });

  test("un programme SANS niveau est retenu par tout critère de niveau", () => {
    const r = filtrerProgrammes(CATALOGUE, [c("niveau", "2")]);
    expect(ids(r)).toContain("si-commun");
    expect(ids(r)).not.toContain("math-mpsi-mp2i");
  });

  test("le texte filtre le titre, la matière et les filières — jamais le contenu", () => {
    expect(ids(filtrerProgrammes(CATALOGUE, [], "chimie"))).toEqual(["chim-mp"]);
    expect(ids(filtrerProgrammes(CATALOGUE, [], "mp2i"))).toEqual(["math-mpsi-mp2i"]);
    expect(filtrerProgrammes(CATALOGUE, [], "corrosion")).toHaveLength(0);
  });

  test("critère et texte se cumulent", () => {
    const r = filtrerProgrammes(CATALOGUE, [c("filiere", "mp")], "mathématiques");
    expect(ids(r)).toEqual(["math-mp-mpi"]);
  });
});

describe("critères proposables", () => {
  test("un critère déjà posé n'est plus proposé", () => {
    const actifs = [c("matiere", "physique")];
    const p = criteresProposables(CATALOGUE, actifs);
    expect(p.some((x) => memeCritere(x, actifs[0]))).toBe(false);
  });

  test("un critère qui ne discrimine plus n'est pas proposé", () => {
    // Après « matière : physique », un seul programme reste : plus aucun
    // critère ne retirerait quoi que ce soit.
    expect(criteresProposables(CATALOGUE, [c("matiere", "physique")])).toHaveLength(0);
  });

  test("les critères sont ordonnés matière → filière → niveau", () => {
    const p = criteresProposables(CATALOGUE, []);
    const categories = [...new Set(p.map((x) => x.categorie))];
    expect(categories).toEqual(["matiere", "filiere", "niveau"]);
  });

  test("le texte filtre aussi les critères proposés", () => {
    const p = criteresProposables(CATALOGUE, [], "chim");
    expect(p.every((x) => x.libelle.toLowerCase().includes("chim"))).toBe(true);
    expect(p.length).toBeGreaterThan(0);
  });

  test("aucun doublon dans les propositions", () => {
    const p = criteresProposables(CATALOGUE, []);
    const clefs = p.map((x) => `${x.categorie}:${x.valeur}`);
    expect(new Set(clefs).size).toBe(clefs.length);
  });
});

describe("manipulation des jetons (clavier)", () => {
  const matiere = c("matiere", "physique");
  const filiere = c("filiere", "mp");

  test("poser deux fois le même critère ne crée pas de doublon", () => {
    const a = ajouterCritere([], matiere);
    expect(ajouterCritere(a, { ...matiere })).toEqual(a);
  });

  test("Retour arrière retire le DERNIER posé, pas un autre", () => {
    const a = ajouterCritere(ajouterCritere([], matiere), filiere);
    expect(retirerDernierCritere(a)).toEqual([matiere]);
  });

  test("retirer un jeton désigné laisse les autres en place", () => {
    const a = ajouterCritere(ajouterCritere([], matiere), filiere);
    expect(retirerCritere(a, matiere)).toEqual([filiere]);
  });

  test("retirer sur une liste vide ne casse rien", () => {
    expect(retirerDernierCritere([])).toEqual([]);
    expect(retirerCritere([], matiere)).toEqual([]);
  });
});
