// Écriture retour du calendrier vers le colloscope — module PUR.
//
// Le pendant de `projection.ts` : la vue calcule ici les cellules à réécrire,
// et l'appelant les pousse par `spreadsheetSaveCells`. Aucune donnée nouvelle,
// aucune table nouvelle — la même que celle que le tableur et la grille
// éditent déjà. C'est ce qui rend la symétrie possible sans pont.
//
// Trois gestes arbitrés (2026-08-23) : DÉCALER dans la journée, AJOURNER à une
// autre date, CHANGER LES ÉLÈVES. Plus la création d'un RATTRAPAGE, qui est une
// ligne ajoutée en fin de tableau. La suppression est refusée : une colle se
// retire du colloscope, pas de sa projection.

import type { ColloscopeEleve } from "./colloscope";
import { ecrireEleves, formaterHoraire, type SeanceSituee } from "./projection";

/** Une cellule à écrire — forme attendue par `spreadsheetSaveCells`. */
export interface CelluleAEcrire {
  row_index: number;
  col_index: number;
  value: string;
}

/**
 * Indices de colonne du tableau de classe. **Relus du tableau**, jamais codés
 * en dur : l'ordre vient de `COLLOSCOPE_COLUMNS` à l'import, mais un tableau
 * remanié à la main ne doit pas faire écrire dans la mauvaise colonne.
 */
export interface ColonnesColloscope {
  date: number;
  groupe: number;
  matiere: number;
  colleur: number;
  jour: number;
  horaire: number;
  salle: number;
}

/** Ordre de repli — celui que produit l'import (`COLLOSCOPE_COLUMNS`). */
export const COLONNES_PAR_DEFAUT: ColonnesColloscope = {
  date: 0, groupe: 1, matiere: 2, colleur: 3, jour: 4, horaire: 5, salle: 6,
};

/**
 * Localise les colonnes par leur TITRE. Un titre manquant retombe sur la
 * position par défaut plutôt que d'échouer : mieux vaut écrire au bon endroit
 * dans le cas courant que refuser de servir un tableau légèrement différent.
 */
export function reperer(titres: string[]): ColonnesColloscope {
  const idx = (nom: string, defaut: number) => {
    const i = titres.findIndex(
      (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() === nom,
    );
    return i >= 0 ? i : defaut;
  };
  return {
    date: idx("date", 0),
    groupe: idx("groupe", 1),
    matiere: idx("matiere", 2),
    colleur: idx("colleur", 3),
    jour: idx("jour", 4),
    horaire: idx("horaire", 5),
    salle: idx("salle", 6),
  };
}

// ── Date et jour ────────────────────────────────────────────────────────────

/** Ordre `getDay()` : dimanche = 0. Casse identique à celle qu'écrit l'import. */
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function jourDe(d: Date): string {
  return JOURS[d.getDay()];
}

export function isoDe(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function minutesDe(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

// ── Déplacement (décaler / ajourner) ────────────────────────────────────────

export interface Deplacement {
  /** Cellules à réécrire ; vide si rien n'a bougé. */
  cellules: CelluleAEcrire[];
  /** `decalage` = même journée, `ajournement` = autre date, `aucun` = inchangé. */
  genre: "decalage" | "ajournement" | "aucun";
}

/**
 * Calcule la réécriture d'une séance déplacée dans le calendrier.
 *
 * ⚠️ Quand la DATE change, `Jour` est recalculé. Sans cela la ligne devient
 * incohérente — le colloscope porte les deux, et c'est `Jour` que lisent les
 * vues qui groupent par jour de semaine.
 */
export function deplacerSeance(
  seance: SeanceSituee,
  debut: Date,
  fin: Date,
  colonnes: ColonnesColloscope = COLONNES_PAR_DEFAUT,
): Deplacement {
  const cellules: CelluleAEcrire[] = [];
  const nouvelleDate = isoDe(debut);
  const dateChange = nouvelleDate !== seance.date.trim();

  const nouvelHoraire = formaterHoraire({
    debutMin: minutesDe(debut),
    finMin: minutesDe(fin),
  });
  const horaireChange = nouvelHoraire !== seance.horaire.trim();

  if (dateChange) {
    cellules.push({ row_index: seance.rowIndex, col_index: colonnes.date, value: nouvelleDate });
    cellules.push({ row_index: seance.rowIndex, col_index: colonnes.jour, value: jourDe(debut) });
  }
  if (horaireChange) {
    cellules.push({ row_index: seance.rowIndex, col_index: colonnes.horaire, value: nouvelHoraire });
  }

  const genre = dateChange ? "ajournement" : horaireChange ? "decalage" : "aucun";
  return { cellules, genre };
}

// ── Élèves ──────────────────────────────────────────────────────────────────

/**
 * Réécrit la cellule `Groupe` pour un ensemble d'élèves donné. La règle miroir
 * de `resoudreEleves` s'applique : ensemble égal à un groupe connu → son
 * libellé, sinon la liste des codes (cf. `projection.ts`).
 */
export function changerEleves(
  seance: SeanceSituee,
  choisis: ColloscopeEleve[],
  eleves: ColloscopeEleve[],
  colonnes: ColonnesColloscope = COLONNES_PAR_DEFAUT,
): CelluleAEcrire[] {
  const valeur = ecrireEleves(choisis, eleves, seance.classe);
  if (valeur === seance.groupe.trim()) return [];
  return [{ row_index: seance.rowIndex, col_index: colonnes.groupe, value: valeur }];
}

// ── Rattrapage ──────────────────────────────────────────────────────────────

export interface Rattrapage {
  classe: string;
  debut: Date;
  fin: Date;
  matiere: string;
  colleur: string;
  salle: string;
  /** Élèves concernés — typiquement les absents d'une séance. */
  eleves: ColloscopeEleve[];
}

/**
 * Compose la LIGNE d'un rattrapage, à ajouter en fin de tableau.
 *
 * `rowIndex` est fourni par l'appelant (`MAX(row_index) + 1`) : l'ajout EN FIN
 * est délibéré — insérer au milieu décalerait les lignes suivantes et
 * invaliderait toutes les identités `colle:…:{rowIndex}` déjà projetées.
 */
export function ligneRattrapage(
  r: Rattrapage,
  rowIndex: number,
  eleves: ColloscopeEleve[],
  colonnes: ColonnesColloscope = COLONNES_PAR_DEFAUT,
): CelluleAEcrire[] {
  const valeurGroupe = ecrireEleves(r.eleves, eleves, r.classe);
  const horaire = formaterHoraire({ debutMin: minutesDe(r.debut), finMin: minutesDe(r.fin) });
  const par = (col: number, value: string) => ({ row_index: rowIndex, col_index: col, value });
  return [
    par(colonnes.date, isoDe(r.debut)),
    par(colonnes.groupe, valeurGroupe),
    par(colonnes.matiere, r.matiere),
    par(colonnes.colleur, r.colleur),
    par(colonnes.jour, jourDe(r.debut)),
    par(colonnes.horaire, horaire),
    par(colonnes.salle, r.salle),
  ];
}
