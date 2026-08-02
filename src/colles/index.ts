/** Barrel du module colles — logique pure des planches de colles. */
export { findFichesSection, isFenceClose, isFenceOpen, isHrLine, parseColleYaml, parsePlanches, splitPlanches, stripColleSeparators } from "./parse";
export { writeBackColleKeys } from "./write-back";
export type { ColleMeta, CollePlanche, CollesSection } from "./types";
