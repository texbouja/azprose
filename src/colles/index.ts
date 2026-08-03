/** Barrel du module colles — logique pure des planches de colles. */
export { findFichesSection, isFenceClose, isFenceOpen, isHrLine, parseColleYaml, parsePlanches, splitPlanches, stripColleSeparators } from "./parse";
export { writeBackColleKeys } from "./write-back";
export { MATIERE_KEYS, matiereKey, rubriquesFor, sumMaxScore, sumNotes } from "./rubrics";
export type { ColleMeta, CollePlanche, CollesSection, ColleRubrique, RubriquesParMatiere } from "./types";
export {
  buildColloscope,
  expandColloscope,
  inVacances,
  normalizeColleur,
  parseColloscope,
  seancesDuColleur,
  teachingMondays,
} from "./colloscope";
export type {
  ColloscopeCreneau,
  ColloscopeData,
  ColloscopeEleve,
  ColloscopeSeance,
} from "./colloscope";
export { importColloscope, readColloscope } from "./import-colloscope";
export type { ColloscopeImportResult } from "./import-colloscope";
