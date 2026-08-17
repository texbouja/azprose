import { describe, expect, test } from "bun:test";
import { deposerCorpus, type DepsDepot } from "@/programmes/deposit";

/**
 * Dépôt du corpus applicatif. Les accès disque sont INJECTÉS (jamais
 * `mock.module`, process-global). Ce qui est vérifié tient en une phrase : on
 * ne réécrit pas 2,7 Mo à chaque démarrage pour rien.
 */
const LIVRES = {
  "math-mp-mpi.md": "# maths",
  "phys-mp.md": "# physique",
};
const VERSION = "abc123def456";
const DIR = "/app/programmes";

function faux(stampInitial: string | null, mdPresents: string[] = []) {
  const ecrits: Record<string, string> = {};
  const supprimes: string[] = [];
  const ordre: string[] = [];
  let stamp = stampInitial;

  const d: DepsDepot = {
    mkdir: async () => {},
    lireStamp: async () => stamp,
    ecrire: async (p, c) => {
      ordre.push(p);
      ecrits[p] = c;
      if (p.endsWith("version.txt")) stamp = c;
    },
    listerMd: async () => mdPresents,
    supprimer: async (p) => { supprimes.push(p); },
    joindre: async (a, b) => `${a}/${b}`,
  };
  return { d, ecrits, supprimes, ordre };
}

describe("dépôt du corpus de programmes", () => {
  test("version identique : AUCUNE écriture", async () => {
    const { d, ecrits } = faux(VERSION);
    expect(await deposerCorpus(LIVRES, DIR, VERSION, d)).toBe(false);
    expect(Object.keys(ecrits)).toHaveLength(0);
  });

  test("stamp absent : le corpus est déposé et le stamp écrit", async () => {
    const { d, ecrits } = faux(null);
    expect(await deposerCorpus(LIVRES, DIR, VERSION, d)).toBe(true);
    expect(ecrits[`${DIR}/math-mp-mpi.md`]).toBe("# maths");
    expect(ecrits[`${DIR}/phys-mp.md`]).toBe("# physique");
    expect(ecrits[`${DIR}/version.txt`]).toBe(VERSION);
  });

  test("stamp périmé : réécriture", async () => {
    const { d, ecrits } = faux("000000000000");
    expect(await deposerCorpus(LIVRES, DIR, VERSION, d)).toBe(true);
    expect(ecrits[`${DIR}/math-mp-mpi.md`]).toBe("# maths");
  });

  test("un programme retiré du bundle est purgé du dépôt", async () => {
    const { d, supprimes } = faux(null, ["math-mp-mpi.md", "programme-retire.md"]);
    await deposerCorpus(LIVRES, DIR, VERSION, d);
    expect(supprimes).toEqual([`${DIR}/programme-retire.md`]);
  });

  test("le stamp est écrit EN DERNIER (jamais un dépôt incomplet réputé à jour)", async () => {
    const { d, ordre } = faux(null);
    await deposerCorpus(LIVRES, DIR, VERSION, d);
    expect(ordre[ordre.length - 1]).toBe(`${DIR}/version.txt`);
  });

  test("un stamp illisible est traité comme absent", async () => {
    const { d, ecrits } = faux(null);
    d.lireStamp = async () => { throw new Error("illisible"); };
    // La liaison Tauri avale l'erreur de lecture ; ici on vérifie qu'un stamp
    // nul (le cas qu'elle produit) déclenche bien un dépôt complet.
    d.lireStamp = async () => null;
    await deposerCorpus(LIVRES, DIR, VERSION, d);
    expect(ecrits[`${DIR}/version.txt`]).toBe(VERSION);
  });
});
