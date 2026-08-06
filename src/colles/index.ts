/** Barrel du module colles — logique pure des planches de colles. */
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
} from "./email";
export type { ColleReportData, ColleReportRubric } from "./email";
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
} from "./report-layout";
export type { ReportCssFile, ReportLayout, ReportZoneLayout } from "./report-layout";
export { renderColleReportImage, renderReportImages } from "./email-render";
export type { ColleReportImage, ColleReportOptions } from "./email-render";
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
} from "./archive";
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
  archivePlancheImage,
  archiveReportImage,
  loadColleWeeks,
  plancheWeekNumber,
  readArchivedImage,
  renderAndArchiveImages,
  writeArchivedImage,
} from "./archive-render";
export { assemblePrintHtml, chunkPairs, PRINT_PAGE_CSS } from "./pdf-planches";
export type { CollePrintOptions } from "./pdf-planches";
export { exportPlanchesPdf } from "./pdf-planches-render";
export type { CollePrintRequest } from "./pdf-planches-render";
