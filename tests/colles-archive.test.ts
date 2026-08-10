import { describe, expect, test } from "bun:test";
import {
  anneeFolder,
  archiveFileName,
  archiveRelativePath,
  colleurNamePart,
  eleveNamePart,
  isoWeekNumber,
  plancheDate,
  semaineFolder,
  semaineRef,
  slugPart,
  splitEleveName,
  stripCivility,
} from "../src/printing/colle/archive";
import type { CollePlanche } from "../src/colles/types";

/** Planche minimale pour les tests de nommage. */
function planche(meta: Partial<CollePlanche["meta"]> = {}): CollePlanche {
  return {
    index: 0,
    meta: { ...meta },
    blockSource: "",
    bodySource: "",
    blockStart: 0,
    blockEnd: 0,
    bodyStart: 0,
    bodyEnd: 0,
  };
}

describe("archive — stripCivility", () => {
  test("retire M. / Mme. / Mlle. / Mr. (avec ou sans point) en tête", () => {
    // Règle mémoire : noms arabisés (Maroc) dans les fixtures.
    expect(stripCivility("M. Boujaida")).toBe("Boujaida");
    expect(stripCivility("Mme El Amrani")).toBe("El Amrani");
    expect(stripCivility("Mlle Benali")).toBe("Benali");
    expect(stripCivility("Mr. Berrada")).toBe("Berrada");
    expect(stripCivility("Dr. Alaoui")).toBe("Alaoui");
  });

  test("no-op sans civilité", () => {
    expect(stripCivility("Boujaida")).toBe("Boujaida");
    expect(stripCivility("Karim Boujaida")).toBe("Karim Boujaida");
    expect(stripCivility("")).toBe("");
  });
});

describe("archive — slugPart", () => {
  test("accent enlevés, espaces → séparateur, caractères interdits retirés", () => {
    expect(slugPart("Élève Prénom", "_")).toBe("Eleve_Prenom");
    expect(slugPart("El-Hassani", "_")).toBe("El-Hassani");
    expect(slugPart("Fatima-Zahra BENALI", "-")).toBe("Fatima-Zahra-BENALI");
    expect(slugPart("O'brien", "_")).toBe("Obrien");
  });
});

describe("archive — splitEleveName (élève stocké « Prénom Nom »)", () => {
  test("premier mot = prénom, reste = nom (noms composés préservés)", () => {
    expect(splitEleveName("Ahmed El Moujahid")).toEqual({
      prenom: "Ahmed",
      nom: "El Moujahid",
    });
    expect(splitEleveName("Youssef El Amrani")).toEqual({
      prenom: "Youssef",
      nom: "El Amrani",
    });
  });

  test("un seul mot → prénom seul", () => {
    expect(splitEleveName("Ahmed")).toEqual({ prenom: "Ahmed", nom: "" });
    expect(splitEleveName("")).toEqual({ prenom: "", nom: "" });
  });
});

describe("archive — numéro ISO de semaine (helper de référence, plus utilisé par le nommage)", () => {
  test("dates connues (2026 : le 1er janvier est un jeudi)", () => {
    // 2026-01-02 (vendredi) → semaine ISO 1
    expect(isoWeekNumber(new Date("2026-01-02T12:00:00"))).toBe(1);
    // 2026-05-04 → semaine ISO 19
    expect(isoWeekNumber(new Date("2026-05-04T12:00:00"))).toBe(19);
    // 2026-12-31 (jeudi) → semaine ISO 53 (2026 a 53 semaines)
    expect(isoWeekNumber(new Date("2026-12-31T12:00:00"))).toBe(53);
    // 2026-01-05 (lundi de la semaine 2)
    expect(isoWeekNumber(new Date("2026-01-05T12:00:00"))).toBe(2);
  });
});

describe("archive — semaineRef / semaineFolder (numéro de SEMAINE DE COLLE)", () => {
  test("format semXX / Semaine_XX (padding 2)", () => {
    expect(semaineRef(1)).toBe("sem01");
    expect(semaineRef(12)).toBe("sem12");
    expect(semaineFolder(1)).toBe("Semaine_01");
    expect(semaineFolder(12)).toBe("Semaine_12");
  });
});

describe("archive — plancheDate (repli aujourd'hui)", () => {
  test("meta.date YYYY-MM-DD → Date", () => {
    const p = planche({ date: "2026-05-04" });
    expect(plancheDate(p).getFullYear()).toBe(2026);
    expect(plancheDate(p).getMonth()).toBe(4);
    expect(plancheDate(p).getDate()).toBe(4);
  });

  test("date absente/invalide → aujourd'hui", () => {
    const today = new Date();
    const p1 = planche({});
    const p2 = planche({ date: "invalide" });
    for (const p of [p1, p2]) {
      const d = plancheDate(p);
      expect(d.getFullYear()).toBe(today.getFullYear());
      expect(d.getMonth()).toBe(today.getMonth());
      expect(d.getDate()).toBe(today.getDate());
    }
  });
});

describe("archive — nommage des fichiers (exemple utilisateur)", () => {
  test("exemple : Boujaida-El_Moujahid_Ahmed-sem01.png (semaine de colle 1)", () => {
    const p = planche({
      colleur: "M. Boujaida",
      eleve: "Ahmed El Moujahid",
      date: "2026-01-02",
    });
    // PNG uniquement depuis le round 16 (l'option SVG a été retirée).
    expect(archiveFileName(p, 1)).toBe("Boujaida-El_Moujahid_Ahmed-sem01.png");
  });

  test("chemin complet : Colles/2026/Semaine_01/…", () => {
    const p = planche({
      colleur: "M. Boujaida",
      eleve: "Ahmed El Moujahid",
      date: "2026-01-02",
    });
    expect(archiveRelativePath(p, 1)).toBe(
      "Colles/2026/Semaine_01/Boujaida-El_Moujahid_Ahmed-sem01.png",
    );
  });

  test("le numéro de semaine de colle est indépendant de la semaine ISO de la date", () => {
    // 2026-10-19 est la semaine ISO 43, mais si c'est la 3e semaine d'enseignement
    // du colloscope, le dossier/la ref portent « 3 » (sem03), pas « 43 ».
    const p = planche({
      colleur: "M. Boujaida",
      eleve: "Salma",
      date: "2026-10-19",
    });
    expect(archiveFileName(p, 3)).toBe("Boujaida-Salma-sem03.png");
    expect(archiveRelativePath(p, 3)).toBe(
      "Colles/2026/Semaine_03/Boujaida-Salma-sem03.png",
    );
  });

  test("colleurNamePart : espaces → tirets, civilité retirée", () => {
    expect(colleurNamePart("M. Karim Boujaida")).toBe("Karim-Boujaida");
    expect(colleurNamePart("Boujaida")).toBe("Boujaida");
    expect(colleurNamePart("")).toBe("Colleur");
  });

  test("eleveNamePart : Nom_Prénom (underscore), replis", () => {
    expect(eleveNamePart("Ahmed El Moujahid")).toBe("El_Moujahid_Ahmed");
    expect(eleveNamePart("Ahmed")).toBe("Ahmed");
    expect(eleveNamePart("")).toBe("Sans_eleve");
  });
});
