/**
 * Barrel du module colles — logique pure des planches de colles.
 *
 * Les modules d'IMPRESSION (gabarit de rapport, planches PDF, email/archivage
 * PNG) vivent dans `src/printing/colle/` depuis la refonte (étapes 4-5) ; ils
 * sont ré-exportés ici pour la rétro-compat des importeurs `@/colles`.
 */
export { findFichesSection, isFenceClose, isFenceOpen, isHrLine, parseColleYaml, parsePlanches, splitPlanches, stripColleSeparators, creneauKey, sameCreneau } from "./parse";
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
export { buildCollesSection, fenceColle, seancesDuJour } from "./daily-note";
export { ensureDailyNoteWithColles } from "./daily-note-io";
export type { ColleFicheMeta } from "./daily-note";
export {
  REPORT_CID,
  REPORT_PAGE_CSS,
  buildReportContent,
  buildReportEmailHtml,
  buildReportEnonce,
  buildReportEval,
  buildReportHead,
  buildReportMetaRows,
  buildReportProgramme,
  buildReportSubject,
  escHtml,
  formatNoteValue,
  formatReportDate,
} from "@/printing/colle/email";
export type { ColleReportData, ColleReportRubric } from "@/printing/colle/email";
export {
  DEFAULT_REPORT_LAYOUT,
  REPORT_VARS,
  buildReportObs,
  buildReportRubrics,
  normalizeReportLayout,
  renderReportLayout,
  renderReportLayoutCss,
  renderReportSlotHtml,
  renderReportZone,
  resolveReportVar,
} from "@/printing/colle/layout";
export type { ReportCssFile, ReportLayout, ReportZoneLayout } from "@/printing/colle/layout";
export { renderReportImages } from "@/printing/colle/email-render";
export type { ColleReportImage, ColleReportOptions } from "@/printing/colle/email-render";
export {
  ARCHIVE_ROOT,
  ARCHIVE_EXTENSION,
  anneeFolder,
  archiveFileName,
  archiveRelativePath,
  colleurNamePart,
  eleveNamePart,
  isoWeekNumber,
  plancheDate,
  plancheDateIso,
  semaineFolder,
  semaineRef,
  slugPart,
  splitEleveName,
  stripCivility,
} from "@/printing/colle/archive";
export { lundiOf, requiredWeekNumber, weekNumberForDate, weeksFromDates } from "./weeks";
export type { ColleWeek } from "./weeks";
export {
  cancelWeekPrompt,
  confirmWeekPrompt,
  manualWeekNumber,
  pendingWeekPrompt,
  requestManualWeekNumber,
  setManualWeekNumber,
} from "./week-overrides.svelte";
export {
  archiveImages,
  loadColleWeeks,
  plancheWeekNumber,
  writeArchivedImage,
} from "@/printing/colle/archive-render";
export { assemblePrintHtml, buildPlanchesPrintCss, chunkPairs, PRINT_PAGE_CSS } from "@/printing/colle/planches";
export type { CollePrintOptions } from "@/printing/colle/planches";
export { exportPlanchesPdf, previewPlanchesPdf } from "@/printing/colle/planches-render";
export type { CollePrintRequest } from "@/printing/colle/planches-render";
