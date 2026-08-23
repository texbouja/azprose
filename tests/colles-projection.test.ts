/**
 * Projection du colloscope vers le calendrier — module PUR.
 *
 * Les formes testées viennent du coffre réel `/home/Backup/AZColle`
 * (mesures du 2026-08-23) : colleurs en capitales avec civilité
 * (« M. BOUJAIDA »), horaires `13h-14h`, codes élèves
 * `INS-CPGEA00023815/2025`, groupes `G1…G8`. Le CODE, lui, ne suppose
 * aucune de ces formes — c'est précisément ce que ces tests vérifient.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  CALENDRIER_COLLES,
  decouperIdColle,
  ecrireEleves,
  estIdColle,
  formaterHoraire,
  idColle,
  memeColleur,
  normaliserColleur,
  parserHoraire,
  projeterColles,
  resoudreEleves,
} from "../src/colles/projection";

// Fixtures : noms marocains (règle du dépôt).
const ELEVES = [
  { code: "INS-CPGEA00023815/2025", nom: "BOUJAIDA", prenom: "Yasmine", classe: "MP-2", groupe: "G6", email: "" },
  { code: "INS-CPGEA00023836/2025", nom: "EL MOUJAHID", prenom: "Anas", classe: "MP-2", groupe: "G6", email: "" },
  { code: "INS-CPGEA00023849/2025", nom: "BENALI", prenom: "Salma", classe: "MP-2", groupe: "G2", email: "" },
  { code: "INS-CPGEA00023858/2025", nom: "OUENZAR", prenom: "Nour", classe: "MP-1", groupe: "G1", email: "" },
];

function seance(p = {}) {
  return {
    classe: "MP-2", date: "2026-11-20", groupe: "G6", matiere: "Mathématiques",
    colleur: "M. BOUJAIDA", jour: "Vendredi", horaire: "15h-16h", salle: "MP*2",
    spreadsheetId: "0eb73dc5-4ee7-45c4-9874-5bfa51ff0039", rowIndex: 12,
    ...p,
  };
}
const PLAGE = { colleurName: "Boujaida", debut: "2026-11-16", fin: "2026-11-22" };

describe("identité des événements projetés", () => {
  test("aller-retour, y compris sur un UUID (qui ne contient pas de « : »)", () => {
    const id = idColle("0eb73dc5-4ee7-45c4-9874-5bfa51ff0039", 447);
    expect(estIdColle(id)).toBe(true);
    expect(decouperIdColle(id)).toEqual({
      spreadsheetId: "0eb73dc5-4ee7-45c4-9874-5bfa51ff0039",
      rowIndex: 447,
    });
  });

  test("un identifiant d'événement UTILISATEUR n'est jamais pris pour une colle", () => {
    // C'est ce qui garantit qu'une mutation ne part pas dans le mauvais canal.
    expect(estIdColle("0eb73dc5-4ee7-45c4-9874-5bfa51ff0039")).toBe(false);
    expect(decouperIdColle("colle:sansindex")).toBeNull();
    expect(decouperIdColle("colle:abc:-1")).toBeNull();
    expect(decouperIdColle("colle:abc:x")).toBeNull();
  });
});

describe("comparaison de colleurs", () => {
  test("casse, accents et civilité tombent", () => {
    expect(memeColleur("M. BOUJAIDA", "Boujaida")).toBe(true);
    expect(memeColleur("Mme EL MOUJAHID", "el moujahid")).toBe(true);
    expect(memeColleur("Pr. BENALI", "BENALI")).toBe(true);
    expect(normaliserColleur("M.  BOUJAÏDA ")).toBe("boujaida");
  });

  test("deux noms vides ne se correspondent PAS", () => {
    // Sans nom renseigné, on ne prétend reconnaître personne — sinon un profil
    // vide ferait correspondre toutes les séances sans colleur.
    expect(memeColleur("", "")).toBe(false);
    expect(memeColleur("  ", "M.")).toBe(false);
  });

  test("deux colleurs distincts ne se confondent pas", () => {
    expect(memeColleur("M. BOUJAIDA", "M. BENALI")).toBe(false);
  });
});

describe("résolution des élèves — par la DONNÉE, jamais par la forme", () => {
  test("un groupe connu de la classe rend ses membres", () => {
    const r = resoudreEleves("G6", ELEVES, "MP-2");
    expect(r.groupe).toBe("G6");
    expect(r.eleves.map((e) => e.nom)).toEqual(["BOUJAIDA", "EL MOUJAHID"]);
    expect(r.inconnus).toEqual([]);
  });

  test("le groupe est scopé à la CLASSE — même libellé, autre classe", () => {
    expect(resoudreEleves("G1", ELEVES, "MP-2").eleves).toEqual([]);
    expect(resoudreEleves("G1", ELEVES, "MP-1").eleves.map((e) => e.nom)).toEqual(["OUENZAR"]);
  });

  test("une liste de codes rend ces élèves — c'est un rattrapage", () => {
    const r = resoudreEleves("INS-CPGEA00023815/2025", ELEVES, "MP-2");
    expect(r.groupe).toBeNull();
    expect(r.eleves.map((e) => e.prenom)).toEqual(["Yasmine"]);
  });

  test("plusieurs codes, séparés par virgule ou point-virgule", () => {
    const r = resoudreEleves("INS-CPGEA00023815/2025; INS-CPGEA00023849/2025", ELEVES, "MP-2");
    expect(r.eleves.map((e) => e.nom)).toEqual(["BOUJAIDA", "BENALI"]);
  });

  test("libellé inconnu → signalé, jamais avalé", () => {
    // Cas réel : un libellé de rotation absent du registre des élèves. C'est
    // une incohérence du fichier source, elle doit se voir.
    const r = resoudreEleves("Groupe fantôme", ELEVES, "MP-2");
    expect(r.eleves).toEqual([]);
    expect(r.inconnus).toEqual(["Groupe fantôme"]);
  });

  test("AUCUNE convention de nommage n'est supposée", () => {
    // Le nombre de groupes est variable et leurs libellés viennent des
    // cellules du fichier importé : ni préfixe « G », ni suffixe numérique.
    const exotiques = [
      { code: "c1", nom: "A", prenom: "a", classe: "MP-2", groupe: "Rouge", email: "" },
      { code: "c2", nom: "B", prenom: "b", classe: "MP-2", groupe: "Rouge", email: "" },
      { code: "c3", nom: "C", prenom: "c", classe: "MP-2", groupe: "β-2", email: "" },
    ];
    expect(resoudreEleves("Rouge", exotiques, "MP-2").eleves).toHaveLength(2);
    expect(resoudreEleves("β-2", exotiques, "MP-2").groupe).toBe("β-2");
  });

  test("cas extrême : un élève par groupe", () => {
    const solo = ELEVES.map((e, i) => ({ ...e, groupe: `S${i}` }));
    const r = resoudreEleves("S0", solo, "MP-2");
    expect(r.groupe).toBe("S0");
    expect(r.eleves).toHaveLength(1);
  });
});

describe("écriture des élèves — règle miroir", () => {
  test("un ensemble égal à un groupe se réécrit par son LIBELLÉ", () => {
    const g6 = ELEVES.filter((e) => e.groupe === "G6");
    expect(ecrireEleves(g6, ELEVES, "MP-2")).toBe("G6");
  });

  test("un sous-ensemble se réécrit en codes", () => {
    const [un] = ELEVES.filter((e) => e.groupe === "G6");
    expect(ecrireEleves([un], ELEVES, "MP-2")).toBe("INS-CPGEA00023815/2025");
  });

  test("un groupe SINGLETON garde son libellé, pas son code", () => {
    // Sans cette règle, un colloscope à petits groupes basculerait tout entier
    // en listes de codes illisibles.
    const solo = [{ code: "c1", nom: "A", prenom: "a", classe: "MP-2", groupe: "S0", email: "" }];
    expect(ecrireEleves(solo, solo, "MP-2")).toBe("S0");
  });

  test("aller-retour lecture → écriture", () => {
    const r = resoudreEleves("G6", ELEVES, "MP-2");
    expect(ecrireEleves(r.eleves, ELEVES, "MP-2")).toBe("G6");
  });
});

describe("horaire — texte libre, parseur tolérant", () => {
  test("les formes rencontrées", () => {
    expect(parserHoraire("13h-14h")).toEqual({ debutMin: 780, finMin: 840 });
    expect(parserHoraire("13:00-14:30")).toEqual({ debutMin: 780, finMin: 870 });
    expect(parserHoraire(" 9 h 05 – 10h ")).toEqual({ debutMin: 545, finMin: 600 });
  });

  test("illisible ou incohérent → null (l'appelant fera « journée entière »)", () => {
    expect(parserHoraire("")).toBeNull();
    expect(parserHoraire("après-midi")).toBeNull();
    expect(parserHoraire("14h-13h")).toBeNull(); // fin avant début
    expect(parserHoraire("25h-26h")).toBeNull();
    expect(parserHoraire("13h")).toBeNull(); // pas de fin
  });

  test("aller-retour parse ∘ format", () => {
    for (const h of ["8h-9h", "13h-14h", "9h05-10h30", "17h45-18h15"]) {
      expect(formaterHoraire(parserHoraire(h))).toBe(h);
    }
  });
});

describe("projection", () => {
  test("une séance du colleur, dans la plage, devient un événement", () => {
    const { evenements } = projeterColles([seance()], ELEVES, PLAGE);
    expect(evenements).toHaveLength(1);
    const e = evenements[0];
    expect(e.calendarId).toBe(CALENDRIER_COLLES);
    expect(e.id).toBe(idColle("0eb73dc5-4ee7-45c4-9874-5bfa51ff0039", 12));
    expect(e.text).toBe("MP-2 · Mathématiques");
    expect(e.location).toBe("MP*2");
    // Les métadonnées portent les ÉLÈVES, pas le groupe (arbitrage utilisateur).
    expect(e.persons).toEqual(["BOUJAIDA Yasmine", "EL MOUJAHID Anas"]);
    expect(e.start.getHours()).toBe(15);
    expect(e.end.getHours()).toBe(16);
    expect(e.allDay).toBe(false);
  });

  test("nom de colleur VIDE → aucune colle, jamais toutes", () => {
    const { evenements } = projeterColles([seance()], ELEVES, { ...PLAGE, colleurName: "" });
    expect(evenements).toEqual([]);
  });

  test("les séances d'un autre colleur sont écartées", () => {
    const autres = [seance({ colleur: "M. BENALI" })];
    expect(projeterColles(autres, ELEVES, PLAGE).evenements).toEqual([]);
  });

  test("bornage à la plage visible", () => {
    const s = [seance({ date: "2026-11-10" }), seance({ date: "2026-11-20", rowIndex: 13 })];
    const { evenements } = projeterColles(s, ELEVES, PLAGE);
    expect(evenements).toHaveLength(1);
    expect(evenements[0].start.getDate()).toBe(20);
  });

  test("horaire illisible → événement journée entière, jamais 00:00 silencieux", () => {
    const { evenements } = projeterColles([seance({ horaire: "après-midi" })], ELEVES, PLAGE);
    expect(evenements[0].allDay).toBe(true);
    expect(evenements[0].start.getDate()).toBe(20);
    expect(evenements[0].end.getDate()).toBe(21);
  });

  test("date illisible → la séance n'est pas plaçable, elle est écartée", () => {
    expect(projeterColles([seance({ date: "20/11/2026" })], ELEVES, PLAGE).evenements).toEqual([]);
  });

  test("DEUX LIGNES IDENTIQUES → un seul événement, l'écart est compté", () => {
    // L'exigence n°1 : jamais deux fois le même événement dans le même créneau.
    const s = [seance(), seance({ rowIndex: 99 })];
    const { evenements, doublons } = projeterColles(s, ELEVES, PLAGE);
    expect(evenements).toHaveLength(1);
    expect(doublons).toBe(1);
  });

  test("deux séances qui DIFFÈRENT ne sont pas confondues", () => {
    const s = [seance(), seance({ rowIndex: 13, horaire: "16h-17h", groupe: "G2" })];
    expect(projeterColles(s, ELEVES, PLAGE).evenements).toHaveLength(2);
  });

  test("un rattrapage (codes en cellule Groupe) se projette avec ses élèves", () => {
    const s = [seance({ groupe: "INS-CPGEA00023815/2025", rowIndex: 448 })];
    const { evenements } = projeterColles(s, ELEVES, PLAGE);
    expect(evenements[0].persons).toEqual(["BOUJAIDA Yasmine"]);
  });

  test("élève inconnu : affiché tel quel plutôt que perdu", () => {
    const s = [seance({ groupe: "INS-INEXISTANT/2025" })];
    expect(projeterColles(s, ELEVES, PLAGE).evenements[0].persons).toEqual(["INS-INEXISTANT/2025"]);
  });
});

// ── Fixtures PARTAGÉES avec le SQL ──────────────────────────────────────────
// Le même fichier est consommé par le test cargo des vues `v_colle_eleves`
// (src-tauri/src/agent/mcp.rs). Les deux implémentations de la règle
// « la cellule Groupe désigne un groupe OU des codes élèves » doivent rendre
// les mêmes élèves — sans ce garde-fou, elles divergeraient en silence, comme
// l'ont fait les deux normalisations de nom de colleur avant le 2026-08-23.
import fixtures from "./fixtures/colles-resolution.json";

describe("résolution des élèves — accord avec l'implémentation SQL", () => {
  for (const cas of fixtures.cas) {
    test(cas.nom, () => {
      const r = resoudreEleves(cas.groupe, fixtures.eleves, cas.classe);
      expect(r.eleves.map((e) => e.code).sort()).toEqual([...cas.attendu].sort());
    });
  }
});
