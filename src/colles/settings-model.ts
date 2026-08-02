/**
 * Modèle PUR des réglages colles — aucun runtime Svelte (`$state`) ici pour
 * rester testable directement par bun test. Le store réactif (avec runes)
 * vit dans `src/stores/colles-settings.svelte.ts` et re-exporte ce module.
 *
 * Deux sous-sections dans les réglages (« Colles ») :
 *  - Dates : dateDebut (1re semaine) / dateFin (dernière semaine) + vacances
 *    (périodes exclues du colloscope) — réservées pour l'export calendrier.
 *  - Rubriques : notes par rubrique pour chaque matière ; la note globale
 *    d'une planche est la somme des rubriques, toujours calculée au rendu.
 */
import type { RubriquesParMatiere } from "@/colles/types";

/** Une période de vacances (bornes incluses, YYYY-MM-DD). */
export interface ColleVacances {
  /** Début de la période (YYYY-MM-DD). */
  start: string;
  /** Fin de la période (YYYY-MM-DD). */
  end: string;
}

export interface CollesSettings {
  /** Date de début de la première semaine (YYYY-MM-DD). */
  dateDebut: string;
  /** Date de fin de la dernière semaine (YYYY-MM-DD). */
  dateFin: string;
  /** Périodes de vacances scolaires — servent au colloscope interne (créneaux
   *  exclus) et à l'export calendrier. Chaque période : start/end. */
  vacances: ColleVacances[];
  /** Rubriques d'évaluation par matière (clés : maths, physique, francais, anglais, cat). */
  rubriques: RubriquesParMatiere;
}

const DEFAULT_RUBRIQUES: RubriquesParMatiere = {
  maths: [
    { id: "rub1", label: "Maîtrise du cours", maxScore: 5 },
    { id: "rub2", label: "Chercher", maxScore: 3 },
    { id: "rub3", label: "Connaître", maxScore: 3 },
    { id: "rub4", label: "Raisonner", maxScore: 3 },
    { id: "rub5", label: "Calculer", maxScore: 3 },
    { id: "rub6", label: "Communiquer", maxScore: 3 },
  ],
  physique: [
    { id: "rub1", label: "Connaître le cours", maxScore: 5 },
    { id: "rub2", label: "Restituer", maxScore: 3 },
    { id: "rub3", label: "Analyser", maxScore: 3 },
    { id: "rub4", label: "Modéliser", maxScore: 3 },
    { id: "rub5", label: "Calculer", maxScore: 3 },
    { id: "rub6", label: "Communiquer", maxScore: 3 },
  ],
  francais: [
    { id: "rub1", label: "Expression écrite", maxScore: 5 },
    { id: "rub2", label: "Culture littéraire", maxScore: 4 },
    { id: "rub3", label: "Argumentation", maxScore: 4 },
    { id: "rub4", label: "Orthographe et grammaire", maxScore: 3 },
    { id: "rub5", label: "Oral", maxScore: 4 },
  ],
  anglais: [
    { id: "rub1", label: "Compréhension orale", maxScore: 4 },
    { id: "rub2", label: "Expression orale", maxScore: 5 },
    { id: "rub3", label: "Grammaire", maxScore: 4 },
    { id: "rub4", label: "Vocabulaire", maxScore: 4 },
    { id: "rub5", label: "Compréhension écrite", maxScore: 3 },
  ],
  cat: [
    { id: "rub1", label: "Traduction", maxScore: 6 },
    { id: "rub2", label: "Culture", maxScore: 5 },
    { id: "rub3", label: "Compréhension", maxScore: 4 },
    { id: "rub4", label: "Expression", maxScore: 5 },
  ],
};

export const DEFAULT_COLLES_SETTINGS: CollesSettings = {
  dateDebut: "",
  dateFin: "",
  vacances: [],
  rubriques: DEFAULT_RUBRIQUES,
};

/**
 * Migration des anciennes formes persistées (localStorage / cfg.colles de
 * config.json) vers le modèle courant. Idempotent : comble les champs
 * manquants avec les défauts sans toucher aux valeurs existantes.
 */
export function normalizeCollesSettings(v: CollesSettings): CollesSettings {
  return {
    dateDebut: typeof v.dateDebut === "string" ? v.dateDebut : "",
    dateFin: typeof v.dateFin === "string" ? v.dateFin : "",
    vacances: Array.isArray(v.vacances) ? v.vacances : [],
    rubriques: v.rubriques && typeof v.rubriques === "object" ? v.rubriques : DEFAULT_RUBRIQUES,
  };
}
