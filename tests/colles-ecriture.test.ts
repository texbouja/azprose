/**
 * Écriture retour calendrier → colloscope — module PUR.
 *
 * Ce que ces tests protègent avant tout : qu'un AJOURNEMENT réécrive `Jour`
 * en même temps que `Date` (sans quoi la ligne devient incohérente), et qu'un
 * rattrapage s'ajoute EN FIN de tableau (insérer au milieu invaliderait toutes
 * les identités `colle:…:{rowIndex}` déjà projetées).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  COLONNES_PAR_DEFAUT,
  changerEleves,
  deplacerSeance,
  isoDe,
  jourDe,
  ligneRattrapage,
  lignesAPreserver,
  reperer,
} from "../src/colles/ecriture-colloscope";

const ELEVES = [
  { code: "INS-A/2025", nom: "BOUJAIDA", prenom: "Yasmine", classe: "MP-2", groupe: "G6", email: "" },
  { code: "INS-B/2025", nom: "EL MOUJAHID", prenom: "Anas", classe: "MP-2", groupe: "G6", email: "" },
  { code: "INS-C/2025", nom: "BENALI", prenom: "Salma", classe: "MP-2", groupe: "G2", email: "" },
];

const SEANCE = {
  classe: "MP-2", date: "2026-11-20", groupe: "G6", matiere: "Mathématiques",
  colleur: "M. BOUJAIDA", jour: "Vendredi", horaire: "15h-16h", salle: "MP*2",
  spreadsheetId: "sheet-mp2", rowIndex: 12,
};

/** Lecture confortable d'un jeu de cellules : {colonne → valeur}. */
function parColonne(cellules) {
  const noms = Object.fromEntries(
    Object.entries(COLONNES_PAR_DEFAUT).map(([k, v]) => [v, k]),
  );
  return Object.fromEntries(cellules.map((c) => [noms[c.col_index], c.value]));
}

describe("repérage des colonnes", () => {
  test("par titre, accents et casse ignorés", () => {
    expect(reperer(["Date", "Groupe", "Matière", "Colleur", "Jour", "Horaire", "Salle"]))
      .toEqual(COLONNES_PAR_DEFAUT);
  });

  test("un tableau remanié n'écrit pas dans la mauvaise colonne", () => {
    const c = reperer(["Colleur", "Date", "Horaire", "Jour", "Groupe", "Salle", "Matière"]);
    expect(c.date).toBe(1);
    expect(c.groupe).toBe(4);
    expect(c.horaire).toBe(2);
  });

  test("titre manquant → position par défaut, jamais d'échec", () => {
    expect(reperer(["Date"]).salle).toBe(6);
  });
});

describe("déplacement", () => {
  test("DÉCALER dans la journée : seul l'horaire bouge", () => {
    const d = deplacerSeance(
      SEANCE,
      new Date(2026, 10, 20, 16, 0),
      new Date(2026, 10, 20, 17, 0),
    );
    expect(d.genre).toBe("decalage");
    expect(parColonne(d.cellules)).toEqual({ horaire: "16h-17h" });
  });

  test("AJOURNER : la date ET le jour sont réécrits", () => {
    // Le point sensible : sans `Jour`, la ligne dit « Vendredi » un lundi.
    const d = deplacerSeance(
      SEANCE,
      new Date(2026, 10, 23, 15, 0),
      new Date(2026, 10, 23, 16, 0),
    );
    expect(d.genre).toBe("ajournement");
    expect(parColonne(d.cellules)).toEqual({ date: "2026-11-23", jour: "Lundi" });
  });

  test("ajourner ET décaler à la fois : les trois cellules", () => {
    const d = deplacerSeance(
      SEANCE,
      new Date(2026, 10, 23, 8, 30),
      new Date(2026, 10, 23, 9, 30),
    );
    expect(parColonne(d.cellules)).toEqual({
      date: "2026-11-23", jour: "Lundi", horaire: "8h30-9h30",
    });
  });

  test("rien n'a bougé → aucune écriture", () => {
    const d = deplacerSeance(
      SEANCE,
      new Date(2026, 10, 20, 15, 0),
      new Date(2026, 10, 20, 16, 0),
    );
    expect(d.genre).toBe("aucun");
    expect(d.cellules).toEqual([]);
  });

  test("les indices suivent les colonnes repérées", () => {
    const c = reperer(["Colleur", "Date", "Horaire", "Jour", "Groupe", "Salle", "Matière"]);
    const d = deplacerSeance(SEANCE, new Date(2026, 10, 23, 15, 0), new Date(2026, 10, 23, 16, 0), c);
    expect(d.cellules.map((x) => x.col_index).sort()).toEqual([1, 3]);
  });

  test("jourDe et isoDe, sans décalage de fuseau", () => {
    expect(jourDe(new Date(2026, 10, 20))).toBe("Vendredi");
    expect(isoDe(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("changement d'élèves", () => {
  test("un sous-ensemble devient une liste de codes — c'est un rattrapage", () => {
    const [un] = ELEVES;
    expect(parColonne(changerEleves(SEANCE, [un], ELEVES))).toEqual({ groupe: "INS-A/2025" });
  });

  test("l'ensemble complet redevient le LIBELLÉ du groupe", () => {
    const g6 = ELEVES.filter((e) => e.groupe === "G6");
    const s = { ...SEANCE, groupe: "INS-A/2025" };
    expect(parColonne(changerEleves(s, g6, ELEVES))).toEqual({ groupe: "G6" });
  });

  test("valeur inchangée → aucune écriture", () => {
    const g6 = ELEVES.filter((e) => e.groupe === "G6");
    expect(changerEleves(SEANCE, g6, ELEVES)).toEqual([]);
  });
});

describe("rattrapage", () => {
  const R = {
    classe: "MP-2",
    debut: new Date(2026, 10, 24, 13, 0),
    fin: new Date(2026, 10, 24, 14, 0),
    matiere: "Mathématiques",
    colleur: "M. BOUJAIDA",
    salle: "MP*2",
    eleves: [ELEVES[0]],
  };

  test("compose une ligne complète, sept cellules", () => {
    const cellules = ligneRattrapage(R, 448, ELEVES);
    expect(cellules).toHaveLength(7);
    expect(parColonne(cellules)).toEqual({
      date: "2026-11-24",
      groupe: "INS-A/2025",
      matiere: "Mathématiques",
      colleur: "M. BOUJAIDA",
      jour: "Mardi",
      horaire: "13h-14h",
      salle: "MP*2",
    });
  });

  test("toutes les cellules visent la MÊME ligne, celle demandée", () => {
    // L'ajout est en FIN de tableau : insérer au milieu décalerait les lignes
    // suivantes et invaliderait les identités déjà projetées.
    const cellules = ligneRattrapage(R, 448, ELEVES);
    expect(new Set(cellules.map((c) => c.row_index))).toEqual(new Set([448]));
  });

  test("un rattrapage écrit TOUJOURS des codes, même pour un groupe entier", () => {
    // Contrairement à `changerEleves`, qui rend son libellé à un groupe
    // complet pour la lisibilité. Ici c'est la RECONNAISSABILITÉ qui prime :
    // un libellé de groupe rendrait le rattrapage indiscernable d'une ligne
    // générée, donc perdu au ré-import (voir `lignesAPreserver`).
    const g6 = ELEVES.filter((e) => e.groupe === "G6");
    const cellules = ligneRattrapage({ ...R, eleves: g6 }, 448, ELEVES);
    expect(parColonne(cellules).groupe).toBe("INS-A/2025,INS-B/2025");
  });
});

describe("report des rattrapages au ré-import", () => {
  // Ordre COLLOSCOPE_COLUMNS : Date, Groupe, Matière, Colleur, Jour, Horaire, Salle
  const generee = (date, groupe) => [date, groupe, "Maths", "M. BOUJAIDA", "Vendredi", "15h-16h", "MP*2"];
  const rattrapage = ["2026-11-24", "INS-A/2025", "Maths", "M. BOUJAIDA", "Mardi", "13h-14h", "MP*2"];
  const GROUPES = ["G6", "G2"];

  test("un rattrapage est reporté, les lignes générées ne le sont pas", () => {
    // Sans cette règle, un ré-import effacerait une séance de rattrapage
    // programmée — perdre un décalage est bénin, perdre celle-ci ne l'est pas.
    const anciennes = [generee("2026-11-20", "G6"), generee("2026-11-27", "G2"), rattrapage];
    const nouvelles = [generee("2026-11-20", "G6"), generee("2026-11-27", "G2")];
    expect(lignesAPreserver(anciennes, nouvelles, GROUPES)).toEqual([rattrapage]);
  });

  test("une ligne générée disparue de la nouvelle expansion n'est PAS ressuscitée", () => {
    const anciennes = [generee("2026-11-20", "G6")];
    expect(lignesAPreserver(anciennes, [], GROUPES)).toEqual([]);
  });

  test("un rattrapage déjà reproduit par la nouvelle expansion n'est pas dupliqué", () => {
    // La garantie « jamais deux fois le même » vaut aussi ici.
    expect(lignesAPreserver([rattrapage], [rattrapage], GROUPES)).toEqual([]);
  });

  test("lignes vides ignorées", () => {
    expect(lignesAPreserver([["", "", "", "", "", "", ""]], [], GROUPES)).toEqual([]);
  });

  test("aucun colloscope précédent → rien à reporter", () => {
    expect(lignesAPreserver([], [generee("2026-11-20", "G6")], GROUPES)).toEqual([]);
  });

  test("un rattrapage pour PLUSIEURS élèves reste reconnaissable", () => {
    const multi = ["2026-11-24", "INS-A/2025,INS-B/2025", "Maths", "M. B", "Mardi", "13h-14h", ""];
    expect(lignesAPreserver([multi], [], GROUPES)).toEqual([multi]);
  });

  test("un rattrapage pour tout un groupe reste reporté (codes, pas libellé)", () => {
    // C'est pourquoi `ligneRattrapage` écrit TOUJOURS des codes : un libellé
    // de groupe le rendrait indiscernable d'une ligne générée, donc perdu.
    const eleves = [
      { code: "INS-A/2025", nom: "A", prenom: "a", classe: "MP-2", groupe: "G6", email: "" },
      { code: "INS-B/2025", nom: "B", prenom: "b", classe: "MP-2", groupe: "G6", email: "" },
    ];
    const cellules = ligneRattrapage(
      { classe: "MP-2", debut: new Date(2026, 10, 24, 13, 0), fin: new Date(2026, 10, 24, 14, 0),
        matiere: "Maths", colleur: "M. B", salle: "", eleves },
      448, eleves,
    );
    expect(parColonne(cellules).groupe).toBe("INS-A/2025,INS-B/2025");
  });
});
