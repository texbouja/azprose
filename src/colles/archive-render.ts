/**
 * Archivage sur disque des images de rapports de colles + réutilisation par
 * l'envoi email. Arborescence `Colles/<année>/Semaine_XX/…` (voir archive.ts).
 *
 * Le dossier « Semaine_XX » porte le numéro de SEMAINE DE COLLE (1..N,
 * séquence des semaines d'enseignement du colloscope) — résolu DYNAMIQUEMENT
 * depuis le colloscope courant (weeks.ts) à chaque archivage : si la date de
 * la planche n'appartient à aucune semaine du colloscope, l'archivage EXPLICITE
 * échoue BRUYAMMENT (throw). La lecture de réutilisation (readArchivedImage),
 * elle, reste best-effort : hors colloscope → null, l'envoi rend à la volée.
 *
 * Les images sont préparées et archivées INDÉPENDAMMENT de la présence d'un
 * email élève (bouton « Archiver les images » du dialogue Send) et CONSERVÉES
 * si l'utilisateur annule l'envoi : l'envoi réutilise les images déjà
 * archivées, et toute image qu'il rend au passage est écrite sur disque avant
 * l'envoi (annulation → images conservées).
 */
import { mkdir, writeFile, exists, readFile } from "@tauri-apps/plugin-fs";
import { dirname, joinPath } from "@/lib/files";
import {
  renderColleReportImage,
  renderReportImages,
  ReportRenderCancelled,
  type ColleReportImage,
  type ColleReportOptions,
} from "./email-render";
import { buildReportEmailHtml, buildReportSubject } from "./email";
import { archiveRelativePath, plancheDateIso } from "./archive";
import { readColloscope } from "./import-colloscope";
import {
  weekNumberForDate,
  weeksFromDates,
  lundiOf,
  type ColleWeek,
} from "./weeks";
import {
  manualWeekNumber,
  requestManualWeekNumber,
} from "./week-overrides.svelte";
import type { CollePlanche, RubriquesParMatiere } from "./types";

/** base64 → Uint8Array (écriture binaire sur disque). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Uint8Array → base64 (lecture binaire depuis le disque). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Séquence des semaines de colle du colloscope COURANT (calcul dynamique).
 * Colloscope absent ou lecture échouée → [] (la résolution basculera sur la
 * saisie manuelle à l'usage — jamais d'échec silencieux au nommage).
 */
export async function loadColleWeeks(): Promise<ColleWeek[]> {
  const data = await readColloscope();
  if (!data) return [];
  return weeksFromDates(data.seances.map((s) => s.date));
}

/**
 * Numéro de semaine de colle d'une planche : calcul automatique (colloscope),
 * sinon numéro saisi manuellement pour cette semaine, sinon PROMPT utilisateur
 * (Promise rejetée si la demande est annulée).
 */
export async function plancheWeekNumber(
  planche: CollePlanche,
  weeks?: ColleWeek[],
): Promise<number> {
  const ws = weeks ?? (await loadColleWeeks());
  return resolveWeekNum(planche, ws);
}

/**
 * Écrit une image archivée sur disque (crée les dossiers Colles/<année>/
 * Semaine_XX/ au besoin). No-op silencieux si `rootPath` est absent.
 */
export async function writeArchivedImage(
  base64: string,
  relativePath: string,
  rootPath: string | null,
): Promise<void> {
  if (!rootPath) return;
  const abs = joinPath(rootPath, relativePath);
  await mkdir(joinPath(rootPath, dirname(relativePath)), { recursive: true });
  await writeFile(abs, base64ToBytes(base64));
}

/**
 * Numéro de semaine de colle d'une planche. Le calcul automatique prime
 * (colloscope) ; en cas d'échec (hors période), un numéro saisi MANUELLEMENT
 * pour cette semaine (store week-overrides) est utilisé ; sinon, la demande
 * est posée à l'utilisateur via le prompt UI (Promise résolue par le dialogue,
 * rejetée si annulée → l'échec remonte bruyamment comme un throw).
 */
async function resolveWeekNum(planche: CollePlanche, weeks: ColleWeek[]): Promise<number> {
  const lundi = lundiOf(plancheDateIso(planche));
  if (lundi) {
    const manual = manualWeekNumber(lundi);
    if (manual !== undefined) return manual;
    const computed = weekNumberForDate(plancheDateIso(planche), weeks);
    if (computed !== null) return computed;
  }
  return requestManualWeekNumber(planche);
}

/** Rend une planche en image PNG PUIS l'archive sur disque. Prompt manuel hors colloscope. */
export async function archiveReportImage(
  planche: CollePlanche,
  rubriques: RubriquesParMatiere,
  opts: ColleReportOptions,
  rootPath: string | null,
  weeks?: ColleWeek[],
): Promise<string> {
  const ws = weeks ?? (await loadColleWeeks());
  const weekNum = await resolveWeekNum(planche, ws);
  const rel = archiveRelativePath(planche, weekNum);
  const img = await renderColleReportImage(planche, rubriques, opts);
  await writeArchivedImage(img.base64, rel, rootPath);
  return rel;
}

/**
 * Écrit une image DÉJÀ rendue sur disque (réutilisation à l'envoi), en
 * résolvant son numéro de semaine de colle. Prompt manuel hors colloscope —
 * l'appelant (ensurePrepared) l'englobe dans un try/catch best-effort.
 */
export async function archivePlancheImage(
  img: ColleReportImage,
  planche: CollePlanche,
  rootPath: string | null,
  weeks?: ColleWeek[],
): Promise<string> {
  const ws = weeks ?? (await loadColleWeeks());
  const weekNum = await resolveWeekNum(planche, ws);
  const rel = archiveRelativePath(planche, weekNum);
  await writeArchivedImage(img.base64, rel, rootPath);
  return rel;
}

/** Rend et archive TOUTES les planches en PNG (avec ou sans email), avec progression. */
export async function renderAndArchiveImages(
  planches: CollePlanche[],
  rubriques: RubriquesParMatiere,
  opts: ColleReportOptions,
  rootPath: string | null,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ count: number; paths: string[] }> {
  // Échec BRUYANT : un rootPath manquant ferait de writeArchivedImage un no-op
  // silencieux → « N image(s) archivée(s) » sans AUCUN fichier sur disque
  // (le symptôme exact « le dossier n'a pas été créé »).
  if (!rootPath) {
    throw new Error("rootPath introuvable : impossible d'archiver dans le vault");
  }
  if (signal?.aborted) throw new ReportRenderCancelled();
  // Semaines de colle du colloscope courant, résolues UNE fois pour toutes les
  // planches. Une planche hors période déclenche le PROMPT manuel (une seule
  // demande par semaine — la valeur est mémorisée) ; une demande ANNULÉE fait
  // échouer l'archivage ENTIER (l'utilisateur a refusé de fournir le numéro).
  const weeks = await loadColleWeeks();
  const weekNums: number[] = [];
  for (let i = 0; i < planches.length; i++) {
    if (signal?.aborted) throw new ReportRenderCancelled();
    weekNums.push(await resolveWeekNum(planches[i], weeks));
  }
  // Rendu par LOT (gabarit réutilisé — un seul shell + CSS rendus) puis
  // écriture séquentielle des images PNG sur disque. `signal` : l'utilisateur
  // peut ANNULER entre deux captures (ReportRenderCancelled) — le bouton
  // « Annuler » du dialogue Send.
  const images = await renderReportImages(planches, rubriques, opts, onProgress, signal);
  const paths: string[] = [];
  for (let i = 0; i < planches.length; i++) {
    if (signal?.aborted) throw new ReportRenderCancelled();
    const rel = archiveRelativePath(planches[i], weekNums[i]);
    await writeArchivedImage(images[i].base64, rel, rootPath);
    paths.push(rel);
  }
  // Vérification disque : confirme que les dossiers existent réellement (piège
  // « écrit ailleurs que dans le vault » si rootPath était relatif).
  const first = paths[0];
  if (first) {
    const dir = joinPath(rootPath, dirname(first));
    if (!(await exists(dir))) {
      throw new Error(`Dossier d'archivage absent après écriture : ${dir}`);
    }
  }
  return { count: paths.length, paths };
}

/**
 * Reconstruit le wrapper email (subject + html cid) à partir de la meta seule.
 * Ces deux gabarits ne lisent QUE meta/colleur — pas besoin du rendu complet
 * pour réutiliser une image déjà archivée.
 */
function wrapperFromMeta(planche: CollePlanche): Pick<ColleReportImage, "subject" | "html"> {
  const data = {
    meta: planche.meta,
    programme: planche.meta.programme ?? "",
    bodyHtml: "",
    rubricRows: [],
    note: null,
    noteMax: 0,
    observationsHtml: "",
    colleur: planche.meta.colleur ?? "",
  };
  return { subject: buildReportSubject(data), html: buildReportEmailHtml(data) };
}

/**
 * Relit l'image PNG archivée d'une planche (si elle existe) et la rend
 * réutilisable par l'envoi. Retourne null si le fichier n'existe pas, est
 * illisible, ou si la planche est HORS de la période du colloscope (pas de
 * semaine de colle à chercher — l'appelant rend alors l'image à la volée).
 * Best-effort, jamais de throw. `weeks` (optionnel) évite de relire le
 * colloscope par planche.
 */
export async function readArchivedImage(
  planche: CollePlanche,
  rootPath: string | null,
  weeks?: ColleWeek[],
): Promise<ColleReportImage | null> {
  if (!rootPath) return null;
  const ws = weeks ?? (await loadColleWeeks());
  const weekNum = weekNumberForDate(plancheDateIso(planche), ws);
  if (weekNum === null) return null;
  const rel = archiveRelativePath(planche, weekNum);
  const abs = joinPath(rootPath, rel);
  try {
    if (!(await exists(abs))) return null;
    const bytes = await readFile(abs);
    return {
      base64: bytesToBase64(bytes),
      mimeType: "image/png",
      width: 0,
      height: 0,
      ...wrapperFromMeta(planche),
    };
  } catch {
    return null;
  }
}
