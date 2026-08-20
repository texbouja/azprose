import { describe, expect, test } from "bun:test";
import {
  deposerTexmf,
  dossierParent,
  empreinte,
  STAMP,
  type DepsTexmf,
} from "@/texmf/deposit";
import { contenuUserDef, CHEMIN_USER_DEF } from "@/texmf/user-def";

/**
 * Dépôt de l'arbre texmf du kit. Les accès disque sont INJECTÉS (jamais
 * `mock.module`, process-global). Ce qui est vérifié : l'arbre est
 * ARBORESCENT, le miroir est strict, et on ne le réécrit pas pour rien.
 */
const KIT = {
  "tex/latex/azkit/azbase.sty": "%% socle",
  "tex/latex/azkit/azdoc.cls": "%% classe",
  "doc/latex/azkit/manuel.tex": "%% manuel",
};
const DIR = "/app/texmf";

function faux(stampInitial: string | null, presents: string[] = []) {
  const ecrits: Record<string, string> = {};
  const dossiers: string[] = [];
  const supprimes: string[] = [];
  const ordre: string[] = [];
  let stamp = stampInitial;

  const d: DepsTexmf = {
    mkdir: async (p) => { dossiers.push(p); },
    lireStamp: async () => stamp,
    ecrire: async (p, c) => {
      ordre.push(p);
      ecrits[p] = c;
      if (p.endsWith(STAMP)) stamp = c;
    },
    lister: async () => presents,
    supprimer: async (p) => { supprimes.push(p); },
    joindre: async (a, b) => `${a}/${b}`,
  };
  return { d, ecrits, dossiers, supprimes, ordre };
}

describe("empreinte du contenu livré", () => {
  test("même contenu, même empreinte — quel que soit l'ordre des clés", () => {
    const a = { "x.sty": "un", "y.sty": "deux" };
    const b = { "y.sty": "deux", "x.sty": "un" };
    expect(empreinte(a)).toBe(empreinte(b));
  });

  test("un octet de différence suffit à la changer", () => {
    expect(empreinte({ "x.sty": "un" })).not.toBe(empreinte({ "x.sty": "un." }));
  });

  test("renommer un fichier la change aussi", () => {
    // Le NOM fait partie de l'empreinte : déplacer un module dans l'arbre doit
    // provoquer un redépôt, sinon l'ancien chemin survivrait.
    expect(empreinte({ "a/x.sty": "u" })).not.toBe(empreinte({ "b/x.sty": "u" }));
  });
});

describe("dossier parent", () => {
  test("rend le chemin sans le nom de fichier", () => {
    expect(dossierParent("tex/latex/azkit/azbase.sty")).toBe("tex/latex/azkit");
  });

  test("un fichier à la racine n'a pas de parent à créer", () => {
    expect(dossierParent("version.txt")).toBeNull();
  });
});

describe("dépôt de l'arbre", () => {
  test("empreinte identique : AUCUNE écriture", async () => {
    const version = empreinte(KIT);
    const { d, ecrits } = faux(version);
    expect(await deposerTexmf(KIT, DIR, d)).toBe(false);
    expect(Object.keys(ecrits)).toHaveLength(0);
  });

  test("stamp absent : l'arbre est déposé avec ses dossiers", async () => {
    const { d, ecrits, dossiers } = faux(null);
    expect(await deposerTexmf(KIT, DIR, d)).toBe(true);
    expect(ecrits[`${DIR}/tex/latex/azkit/azbase.sty`]).toBe("%% socle");
    expect(ecrits[`${DIR}/doc/latex/azkit/manuel.tex`]).toBe("%% manuel");
    expect(dossiers).toContain(`${DIR}/tex/latex/azkit`);
    expect(dossiers).toContain(`${DIR}/doc/latex/azkit`);
  });

  test("le stamp s'écrit EN DERNIER", async () => {
    // Une écriture interrompue doit laisser un stamp périmé, donc une
    // resynchronisation — jamais un dépôt incomplet réputé à jour.
    const { d, ordre } = faux(null);
    await deposerTexmf(KIT, DIR, d);
    expect(ordre[ordre.length - 1]).toBe(`${DIR}/${STAMP}`);
  });

  test("miroir strict : un module retiré du kit disparaît de l'arbre", async () => {
    const { d, supprimes } = faux("perime", [
      "tex/latex/azkit/azbase.sty",
      "tex/latex/azkit/azdoc.cls",
      "doc/latex/azkit/manuel.tex",
      "tex/latex/azkit/azvieux.sty",
    ]);
    await deposerTexmf(KIT, DIR, d);
    expect(supprimes).toEqual([`${DIR}/tex/latex/azkit/azvieux.sty`]);
  });

  test("le stamp lui-même n'est jamais supprimé", async () => {
    const { d, supprimes } = faux("perime", [STAMP, "tex/latex/azkit/azbase.sty"]);
    await deposerTexmf(KIT, DIR, d);
    expect(supprimes).toHaveLength(0);
  });
});

describe("user.def", () => {
  test("un préambule vide veut dire RETIRER le fichier", () => {
    // azbase teste l'existence de user.def : un fichier vide laissé derrière
    // ferait croire à un préambule que l'utilisateur a effacé.
    expect(contenuUserDef("")).toBeNull();
    expect(contenuUserDef("   \n  ")).toBeNull();
  });

  test("le contenu porte l'en-tête et le corps saisi", () => {
    const c = contenuUserDef("\\def\\Sp{\\opn{Sp}}");
    expect(c).toContain("FICHIER GÉNÉRÉ");
    expect(c).toContain("\\def\\Sp{\\opn{Sp}}");
    expect(c!.endsWith("\n")).toBe(true);
  });

  test("le fichier vit dans l'arbre texmf du PROJET", () => {
    // C'est ce qui le distingue du kit, déposé côté application : les commandes
    // personnelles suivent le projet, pas l'installation.
    expect(CHEMIN_USER_DEF).toEqual(
      [".azprose", "texmf", "tex", "latex", "azlocal", "user.def"],
    );
  });
});
