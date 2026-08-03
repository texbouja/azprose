/**
 * Tests du module colloscope (parsing + expansion).
 * Fixture calquée sur la structure RÉELLE de docs/Colloscope.xlsx :
 *  - feuille `Eleves` : CODE INSCRIPTION | NOM | PRENOM | CLASSE | GROUPE DE COLLES | Emails
 *  - feuilles de classe `MPs-1`/`MPs-2` : Matière | Colleur | Jour | Horaire | Salle | Sem 1…Sem 8
 *  - feuilles parasites ignorées (MPETOILE1, AFF MP, All, Feuil1)
 */

import { describe, expect, it } from "bun:test";
import type { ImportResult } from "@/lib/spreadsheet/import";
import {
  buildColloscope,
  expandColloscope,
  inVacances,
  normalizeColleur,
  normalizeHeader,
  parseColloscope,
  resolveHeader,
  seancesDuColleur,
  teachingMondays,
} from "@/colles/colloscope";

function sheet(name: string, headers: string[], rows: string[][]): ImportResult {
  return { name, headers, rows };
}

/** Feuille Eleves réelle (6 colonnes). */
const ELEVES = sheet(
  "Eleves",
  ["CODE INSCRIPTION", "NOM", "PRENOM", "CLASSE", "GROUPE DE COLLES", "Emails"],
  [
    ["INS-CPGEA00023815/2025", "EL AMRANI", "Salma", "MPs-1", "G2", "salma.elamrani@lycee.ma"],
    ["INS-CPGEA00023816/2025", "BENALI", "Mehdi", "MPs-1", "G4", "mehdi.benali@lycee.ma"],
    ["INS-CPGEA00023817/2025", "TAZI", "Yasmine", "MPs-2", "G1", "yasmine.tazi@lycee.ma"],
  ],
);

/** Feuille de classe MPs-1 : 2 créneaux, rotation 8 semaines (G1-G8). */
const MPS1 = sheet(
  "MPs-1",
  ["Matière", "Colleur", "Jour", "Horaire", "Salle", "Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5", "Sem 6", "Sem 7", "Sem 8"],
  [
    ["Mathématiques", "M. TAIBI", "Lundi", "12h-13h", "Salle 08", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G1"],
    ["Physique", "M. HIBATOUALLAH", "Mardi", "17h-18h", "Salle 09", "G3", "G4", "G5", "G6", "G7", "G8", "G1", "G2"],
  ],
);

/** Feuille de classe MPs-2 (1 créneau, rotation 4 semaines seulement). */
const MPS2 = sheet(
  "MPs-2",
  ["Matière", "Nom Colleur", "Jour", "Horaire", "Salle", "Sem 1", "Sem 2", "Sem 3", "Sem 4"],
  [
    ["Français", "MME. BENKIRANE", "Vendredi", "14h-15h", "Salle 12", "G1", "G2", "G3", "G4"],
  ],
);

/** Feuilles parasites (à ignorer). */
const PARASITES = [
  sheet("AFF MP", ["Matière", "Nom Colleur", "Jour", "Horaire", "Classe", "Salle", "45915"], []),
  sheet("All", ["ANNÉE SCOLAIRE 2025/2026"], []),
  sheet("Feuil1", ["NOM", "PRENOM", "CLASSE", "GROUPE"], []),
];

const ANNEE = {
  dateDebut: "2025-09-15", // lundi
  dateFin: "2025-10-27",
  vacances: [{ start: "2025-10-13", end: "2025-10-17" }], // semaine du 13 octobre
};

// ── normalizeHeader / resolveHeader ────────────────────────────────────────

describe("normalizeHeader / resolveHeader", () => {
  it("normalise casse, accents et ponctuation", () => {
    expect(normalizeHeader("Matière")).toBe("matiere");
    expect(normalizeHeader("  Nom  Colleur ")).toBe("nom colleur");
    expect(normalizeHeader("GROUPE DE COLLES")).toBe("groupe de colles");
  });

  it("résout les alias d'en-têtes", () => {
    expect(resolveHeader("Matière")).toBe("matiere");
    expect(resolveHeader("Colleur")).toBe("colleur");
    expect(resolveHeader("Nom Colleur")).toBe("colleur");
    expect(resolveHeader("Jour")).toBe("jour");
    expect(resolveHeader("Salle")).toBe("salle");
    expect(resolveHeader("Groupe de colles")).toBe("groupe");
    expect(resolveHeader("Emails")).toBe("email");
    expect(resolveHeader("Bidon")).toBeNull();
  });
});

// ── parseColloscope ────────────────────────────────────────────────────────

describe("parseColloscope", () => {
  it("identifie Eleves + feuilles de classe, ignore les parasites", () => {
    const data = parseColloscope([ELEVES, MPS1, MPS2, ...PARASITES]);
    expect(data.eleves).toHaveLength(3);
    expect(data.classes).toEqual(["MPs-1", "MPs-2"]);
  });

  it("lit les élèves avec le bon mapping de colonnes", () => {
    const { eleves } = parseColloscope([ELEVES, MPS1]);
    expect(eleves[0]).toEqual({
      code: "INS-CPGEA00023815/2025",
      nom: "EL AMRANI",
      prenom: "Salma",
      classe: "MPs-1",
      groupe: "G2",
      email: "salma.elamrani@lycee.ma",
    });
  });

  it("sans feuille Eleves, eleves est vide", () => {
    const { eleves } = parseColloscope([MPS1]);
    expect(eleves).toEqual([]);
  });
});

// ── teachingMondays ────────────────────────────────────────────────────────

describe("teachingMondays", () => {
  it("liste les lundis de dateDebut à dateFin", () => {
    const mondays = teachingMondays("2025-09-15", "2025-10-06", []);
    expect(mondays.map((m) => m.date)).toEqual([
      "2025-09-15",
      "2025-09-22",
      "2025-09-29",
      "2025-10-06",
    ]);
    expect(mondays.map((m) => m.index)).toEqual([0, 1, 2, 3]);
  });

  it("exclut les semaines dont le lundi est en vacances, mais l'index continue", () => {
    const mondays = teachingMondays("2025-09-15", "2025-10-27", [
      { start: "2025-10-13", end: "2025-10-17" },
    ]);
    expect(mondays.map((m) => m.date)).toEqual([
      "2025-09-15",
      "2025-09-22",
      "2025-09-29",
      "2025-10-06",
      "2025-10-20",
      "2025-10-27",
    ]);
    // L'index saute la semaine de vacances : les semaines après vacances
    // reprennent la rotation là où elle s'était arrêtée.
    expect(mondays.map((m) => m.index)).toEqual([0, 1, 2, 3, 5, 6]);
  });

  it("dates vide → liste vide", () => {
    expect(teachingMondays("", "2025-10-06", [])).toEqual([]);
    expect(teachingMondays("2025-09-15", "", [])).toEqual([]);
  });
});

// ── inVacances ─────────────────────────────────────────────────────────────

describe("inVacances", () => {
  it("bornes incluses", () => {
    const vac = [{ start: "2025-10-13", end: "2025-10-17" }];
    expect(inVacances("2025-10-13", vac)).toBe(true);
    expect(inVacances("2025-10-17", vac)).toBe(true);
    expect(inVacances("2025-10-18", vac)).toBe(false);
  });
});

// ── expandColloscope ───────────────────────────────────────────────────────

describe("expandColloscope", () => {
  it("déplie les créneaux sur les semaines d'enseignement", () => {
    const creneaux = {
      "MPs-1": [
        {
          matiere: "Mathématiques",
          colleur: "M. TAIBI",
          jour: "Lundi",
          horaire: "12h-13h",
          salle: "Salle 08",
          rotation: ["G2", "G3", "G4", "G5"],
        },
      ],
    };
    const seances = expandColloscope(creneaux, "2025-09-15", "2025-10-06", []);
    expect(seances).toHaveLength(4);
    expect(seances[0]).toEqual({
      classe: "MPs-1",
      date: "2025-09-15",
      groupe: "G2",
      matiere: "Mathématiques",
      colleur: "M. TAIBI",
      jour: "Lundi",
      horaire: "12h-13h",
      salle: "Salle 08",
    });
    expect(seances[3].date).toBe("2025-10-06");
    expect(seances[3].groupe).toBe("G5");
  });

  it("cycle achevé → reprise depuis la première colonne de la rotation", () => {
    const creneaux = {
      "MPs-1": [
        {
          matiere: "Mathématiques",
          colleur: "M. TAIBI",
          jour: "Lundi",
          horaire: "12h-13h",
          salle: "Salle 08",
          rotation: ["G1", "G2", "G3"],
        },
      ],
    };
    const seances = expandColloscope(creneaux, "2025-09-15", "2025-10-06", []);
    expect(seances.map((s) => s.groupe)).toEqual(["G1", "G2", "G3", "G1"]);
  });

  it("les vacances ne réinitialisent pas la rotation (reprise où ça s'était arrêté)", () => {
    const creneaux = {
      "MPs-1": [
        {
          matiere: "Mathématiques",
          colleur: "M. TAIBI",
          jour: "Lundi",
          horaire: "12h-13h",
          salle: "Salle 08",
          rotation: ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"],
        },
      ],
    };
    const seances = expandColloscope(creneaux, "2025-09-15", "2025-10-27", [
      { start: "2025-10-13", end: "2025-10-17" },
    ]);
    // 6 semaines d'enseignement (lundi du 13 exclu) → groupes G1,G2,G3,G4,G6,G7
    expect(seances.map((s) => s.groupe)).toEqual(["G1", "G2", "G3", "G4", "G6", "G7"]);
    expect(seances.map((s) => s.date)).toEqual([
      "2025-09-15",
      "2025-09-22",
      "2025-09-29",
      "2025-10-06",
      "2025-10-20",
      "2025-10-27",
    ]);
  });

  it("offset du jour : Mardi → lundi + 1, Vendredi → lundi + 4", () => {
    const creneaux = {
      "MPs-1": [
        {
          matiere: "Physique",
          colleur: "M. HIBATOUALLAH",
          jour: "Mardi",
          horaire: "17h-18h",
          salle: "Salle 09",
          rotation: ["G3", "G4"],
        },
        {
          matiere: "Français",
          colleur: "MME. BENKIRANE",
          jour: "Vendredi",
          horaire: "14h-15h",
          salle: "Salle 12",
          rotation: ["G1", "G2"],
        },
      ],
    };
    const seances = expandColloscope(creneaux, "2025-09-15", "2025-09-22", []);
    expect(seances.map((s) => s.date)).toEqual(["2025-09-16", "2025-09-19", "2025-09-23", "2025-09-26"]);
  });

  it("ignore les créneaux à jour inconnu ou sans rotation", () => {
    const creneaux = {
      "MPs-1": [
        {
          matiere: "Mathématiques",
          colleur: "M. TAIBI",
          jour: "Lundji",
          horaire: "12h-13h",
          salle: "Salle 08",
          rotation: ["G1"],
        },
        {
          matiere: "Anglais",
          colleur: "M. FADIL",
          jour: "Lundi",
          horaire: "10h-11h",
          salle: "Salle 01",
          rotation: [],
        },
      ],
    };
    expect(expandColloscope(creneaux, "2025-09-15", "2025-10-06", [])).toEqual([]);
  });
});

// ── buildColloscope (pipeline complet) ─────────────────────────────────────

describe("buildColloscope", () => {
  it("assemble élèves + séances sur le fichier réel-like", () => {
    const data = buildColloscope(
      [ELEVES, MPS1, MPS2, ...PARASITES],
      ANNEE.dateDebut,
      ANNEE.dateFin,
      ANNEE.vacances,
    );
    expect(data.classes).toEqual(["MPs-1", "MPs-2"]);
    expect(data.eleves).toHaveLength(3);

    // MPs-1 : 2 créneaux × 6 semaines d'enseignement (vacances semaine 4)
    // MPs-2 : 1 créneau × 6 semaines
    expect(data.seances).toHaveLength(3 * 6);

    // La semaine de vacances (13-17 oct) n'a aucune séance.
    const vacDates = data.seances.filter((s) => s.date.startsWith("2025-10-13"));
    expect(vacDates).toHaveLength(0);

    // Tri par classe puis date.
    expect(data.seances[0].classe).toBe("MPs-1");
    expect(data.seances[0].date).toBe("2025-09-15");
  });
});

// ── seancesDuColleur / normalizeColleur ────────────────────────────────────

describe("seancesDuColleur", () => {
  const seances = [
    { classe: "MPs-1", date: "2025-09-15", groupe: "G2", matiere: "M", colleur: "M. TAIBI", jour: "Lundi", horaire: "12h", salle: "S08" },
    { classe: "MPs-1", date: "2025-09-16", groupe: "G3", matiere: "P", colleur: "M, KANTARA", jour: "Mardi", horaire: "17h", salle: "S09" },
    { classe: "MPs-2", date: "2025-09-17", groupe: "G1", matiere: "F", colleur: "MME. BENKIRANE", jour: "Mercredi", horaire: "14h", salle: "S12" },
  ];

  it("normalise les variantes M. / M, / espaces", () => {
    expect(normalizeColleur("M. TAIBI")).toBe("mtaibi");
    expect(normalizeColleur("M, KANTARA")).toBe("mkantara");
    expect(normalizeColleur("MME. Benkirane")).toBe("mmebenkirane");
  });

  it("filtre les séances du colleur du profil", () => {
    expect(seancesDuColleur(seances, "M, KANTARA").map((s) => s.date)).toEqual(["2025-09-16"]);
    expect(seancesDuColleur(seances, "M. KANTARA").map((s) => s.date)).toEqual(["2025-09-16"]);
    expect(seancesDuColleur(seances, "Inconnu")).toEqual([]);
    expect(seancesDuColleur(seances, "")).toEqual([]);
  });
});
