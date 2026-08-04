import { describe, expect, test } from "bun:test";

import { buildCollesSection, fenceColle, seancesDuJour } from "../src/colles/daily-note";
import { parseColleYaml, splitPlanches, findFichesSection, isFenceOpen, isFenceClose } from "../src/colles/parse";
import type { ColloscopeData, ColloscopeEleve, ColloscopeSeance } from "../src/colles/colloscope";

const ELEVES: ColloscopeEleve[] = [
  { code: "1", nom: "BENALI", prenom: "Yassine", classe: "MPs-1", groupe: "G1", email: "" },
  { code: "2", nom: "TAHIRI", prenom: "Salma", classe: "MPs-1", groupe: "G1", email: "" },
  { code: "3", nom: "MEHDI", prenom: "Adam", classe: "MPs-1", groupe: "G2", email: "" },
  { code: "4", nom: "EL ALAOUI", prenom: "Ines", classe: "MPs-2", groupe: "G1", email: "" },
];

const SEANCES: ColloscopeSeance[] = [
  { classe: "MPs-1", date: "2026-08-03", groupe: "G1", matiere: "Maths", colleur: "M. Taibi", jour: "Lundi", horaire: "12h-13h", salle: "B204" },
  { classe: "MPs-1", date: "2026-08-03", groupe: "G2", matiere: "Physique", colleur: "M. Boujaida", jour: "Lundi", horaire: "17h-18h", salle: "B207" },
  { classe: "MPs-2", date: "2026-08-03", groupe: "G1", matiere: "Maths", colleur: "M. Taibi", jour: "Lundi", horaire: "14h-15h", salle: "C101" },
  { classe: "MPs-1", date: "2026-08-04", groupe: "G1", matiere: "Français", colleur: "M. Taibi", jour: "Mardi", horaire: "09h-10h", salle: "B210" },
];

const DATA: ColloscopeData = { eleves: ELEVES, seances: SEANCES, classes: ["MPs-1", "MPs-2"] };

/** Extrait le contenu YAML d'une codefence ```colle (sans les marqueurs). */
function yamlOf(fence: string): string {
  const lines = fence.split("\n");
  expect(isFenceOpen(lines[0])).toBe(true);
  expect(isFenceClose(lines[lines.length - 1])).toBe(true);
  return lines.slice(1, -1).join("\n");
}

/** Découpe une section en fiches, en retirant le double `---` d'annonce. */
function fichesOf(section: string): string[] {
  const sansAnnonce = section.replace(/^---\n\n---\n\n/, "");
  return sansAnnonce.split(/\n\n---\n\n/).map((f) => f.trimEnd());
}

describe("buildCollesSection", () => {
  test("null si aucune séance ce jour", () => {
    expect(buildCollesSection(DATA, "2026-08-10", "M. Taibi")).toBeNull();
  });

  test("null si le colleur n'a aucune colle ce jour (d'autres colleurs si)", () => {
    expect(buildCollesSection(DATA, "2026-08-04", "M. Boujaida")).toBeNull();
  });

  test("null si le nom de colleur est vide", () => {
    expect(buildCollesSection(DATA, "2026-08-03", "")).toBeNull();
  });

  test("null si aucun élève du colloscope dans les groupes collés", () => {
    const sansEleves: ColloscopeData = {
      ...DATA,
      eleves: [],
    };
    expect(buildCollesSection(sansEleves, "2026-08-03", "M. Taibi")).toBeNull();
  });

  test("double `---` d'annonce + une fiche par élève du groupe collé", () => {
    const section = buildCollesSection(DATA, "2026-08-03", "M. Taibi")!;
    expect(section.startsWith("---\n\n---\n\n")).toBe(true);
    // M. Taibi : G1 de MPs-1 (2 élèves) + G1 de MPs-2 (1 élève) → 3 fiches
    const fiches = fichesOf(section);
    expect(fiches).toHaveLength(3);
    expect(fiches.every((f) => f.startsWith("```colle") && f.endsWith("```"))).toBe(true);
  });

  test("métadonnées de chaque fiche = données de la db (round-trip parseColleYaml)", () => {
    const section = buildCollesSection(DATA, "2026-08-03", "M. Taibi")!;
    const fiches = fichesOf(section);
    const meta = parseColleYaml(yamlOf(fiches[0]));
    expect(meta.matiere).toBe("Maths");
    expect(meta.colleur).toBe("M. Taibi");
    expect(meta.eleve).toBe("Yassine BENALI");
    expect(meta.date).toBe("2026-08-03");
    expect(meta.creneau).toBe("12h-13h");
    expect(meta.salle).toBe("B204");
    expect(meta.classe).toBe("MPs-1");
    expect(meta.groupe).toBe("G1");
    // seconde fiche = élève suivant du même groupe, trié par (nom, prenom)
    const meta2 = parseColleYaml(yamlOf(fiches[1]));
    expect(meta2.eleve).toBe("Salma TAHIRI");
    expect(meta2.classe).toBe("MPs-1");
  });

  test("email_eleve provient de la db (vide si absente) ; programme vide à la génération", () => {
    const avecEmails: ColloscopeData = {
      ...DATA,
      eleves: ELEVES.map((e) =>
        e.nom === "TAHIRI" ? { ...e, email: "s.tahiri@example.fr" } : e,
      ),
    };
    const section = buildCollesSection(avecEmails, "2026-08-03", "M. Taibi")!;
    const fiches = fichesOf(section);
    // Tri (nom, prenom) : BENALI d'abord (email vide), puis TAHIRI (email fourni)
    const meta0 = parseColleYaml(yamlOf(fiches[0]));
    const meta1 = parseColleYaml(yamlOf(fiches[1]));
    expect(meta0.email_eleve).toBe("");
    expect(meta1.email_eleve).toBe("s.tahiri@example.fr");
    for (const f of fiches) {
      const m = parseColleYaml(yamlOf(f));
      expect(m.programme).toBe("");
    }
  });

  test("les séances d'un autre colleur le même jour ne produisent pas de fiche", () => {
    // 2026-08-04 : M. Taibi (Français G1 MPs-1) → 1 fiche seulement
    const section = buildCollesSection(DATA, "2026-08-04", "M. Taibi")!;
    const fiches = fichesOf(section);
    expect(fiches).toHaveLength(2);
    for (const f of fiches) {
      const meta = parseColleYaml(yamlOf(f));
      expect(meta.matiere).toBe("Français");
      expect(meta.colleur).toBe("M. Taibi");
    }
  });

  test("la section est reconnue par findFichesSection/splitPlanches (intégration format)", () => {
    const section = buildCollesSection(DATA, "2026-08-03", "M. Taibi")!;
    const body = `# 2026-08-03\n\n## Travaux en classe\n\n${section}`;
    const lines = body.split("\n");
    const start = findFichesSection(lines);
    expect(start).toBeGreaterThan(-1);
    const planches = splitPlanches(lines, start);
    expect(planches).toHaveLength(3);
    expect(planches[0].meta.eleve).toBe("Yassine BENALI");
    // fiches sans contenu : l'utilisateur remplit le corps après la fermeture
    expect(planches[0].bodySource).toBe("");
  });

  test("les séances sont triées par (horaire, classe, groupe)", () => {
    const s1: ColloscopeSeance = { classe: "MPs-1", date: "2026-08-05", groupe: "G1", matiere: "Maths", colleur: "M. Taibi", jour: "Mercredi", horaire: "17h", salle: "S01" };
    const s2: ColloscopeSeance = { classe: "MPs-2", date: "2026-08-05", groupe: "G1", matiere: "Maths", colleur: "M. Taibi", jour: "Mercredi", horaire: "12h", salle: "S02" };
    const s3: ColloscopeSeance = { classe: "MPs-1", date: "2026-08-05", groupe: "G1", matiere: "Maths", colleur: "M. Taibi", jour: "Mercredi", horaire: "12h", salle: "S03" };
    const order = seancesDuJour({ ...DATA, seances: [s1, s2, s3] }, "2026-08-05", "M. Taibi");
    expect(order.map((s) => `${s.horaire}|${s.classe}`)).toEqual(["12h|MPs-1", "12h|MPs-2", "17h|MPs-1"]);
  });
});

describe("fenceColle", () => {
  test("sérialise le YAML avec stringify — texte hostile restant une VALEUR", () => {
    const fence = fenceColle({
      matiere: "Maths: analyse",
      colleur: "M. Taibi",
      eleve: "A: test",
      date: "2026-08-03",
      creneau: "12h-13h",
      salle: "B204",
      classe: "MPs-1",
      groupe: "G1",
      email_eleve: "y.benali@example.fr",
      programme: "",
    });
    const meta = parseColleYaml(yamlOf(fence));
    expect(meta.matiere).toBe("Maths: analyse");
    expect(meta.eleve).toBe("A: test");
  });

  test("fence propre : ouverture, contenu YAML, fermeture", () => {
    const fence = fenceColle({
      matiere: "Maths",
      colleur: "M. Taibi",
      eleve: "Salma TAHIRI",
      date: "2026-08-03",
      creneau: "12h-13h",
      salle: "B204",
      classe: "MPs-1",
      groupe: "G1",
      email_eleve: "s.tahiri@example.fr",
      programme: "Intégrales impropres",
    });
    const lines = fence.split("\n");
    expect(isFenceOpen(lines[0])).toBe(true);
    expect(isFenceClose(lines[lines.length - 1])).toBe(true);
    const yaml = lines.slice(1, -1).join("\n");
    for (const key of ["matiere", "colleur", "eleve", "date", "creneau", "salle", "classe", "groupe", "email_eleve", "programme"]) {
      expect(yaml).toContain(`${key}:`);
    }
    const meta = parseColleYaml(yamlOf(fence));
    expect(meta.email_eleve).toBe("s.tahiri@example.fr");
    expect(meta.programme).toBe("Intégrales impropres");
  });

  test("email_eleve et programme passent par stringify (texte hostile restant une VALEUR)", () => {
    const fence = fenceColle({
      matiere: "Maths",
      colleur: "M. Taibi",
      eleve: "Salma TAHIRI",
      date: "2026-08-03",
      creneau: "12h-13h",
      salle: "B204",
      classe: "MPs-1",
      groupe: "G1",
      email_eleve: "x@y.fr: oui",
      programme: "- item\n# dièse",
    });
    const meta = parseColleYaml(yamlOf(fence));
    expect(meta.email_eleve).toBe("x@y.fr: oui");
    expect(meta.programme).toBe("- item\n# dièse");
  });
});
