/** Barrel du module colles — logique pure des planches de colles. */
export { findFichesSection, isFenceClose, isFenceOpen, isHrLine, parseColleYaml, parsePlanches, splitPlanches, stripColleSeparators } from "./parse";
export { writeBackColleKeys } from "./write-back";
export { MATIERE_KEYS, matiereKey, rubriquesFor, sumMaxScore, sumNotes } from "./rubrics";
export type { ColleMeta, CollePlanche, CollesSection, ColleRubrique, RubriquesParMatiere } from "./types";
