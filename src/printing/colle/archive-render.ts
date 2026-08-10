/**
 * Archivage sur disque des images de rapports de colles. Arborescence
 * `Colles/<année>/Semaine_XX/…` (voir archive.ts).
 *
 * DÉCISION UTILISATEUR (round 20) : l'archivage PLACE dans le FS utilisateur
 * des images DÉJÀ PRODUITES — il ne rend jamais rien. Les images vivent dans
 * le CACHE du dialogue Send (source unique, produite à chaque ouverture du
 * dialogue par `renderReportImages` — re-rendu systématique ⇒ fraîcheur par
 * construction, aucun hash de fraîcheur nécessaire) ; Preview, envoi email et
 * archivage lisent ce même cache. La réutilisation d'archives disque par
 * l'envoi (`readArchivedImage`) est SUPPRIMÉE — c'est elle qui pouvait servir
 * des images obsolètes.
 *
 * Le dossier « Semaine_XX » porte le numéro de SEMAINE DE COLLE (1..N,
 * séquence des semaines d'enseignement du colloscope) — résolu DYNAMIQUEMENT
 * depuis le colloscope courant (weeks.ts) à chaque archivage : si la date de
 * la planche n'appartient à aucune semaine du colloscope, l'archivage EXPLICITE
 * échoue BRUYAMMENT (throw). Une planche hors période déclenche le prompt
 * manuel (requestManualWeekNumber) ; une demande ANNULÉE fait échouer
 * l'archivage entier.
 */
import { mkdir, writeFile, exists } from "@tauri-apps/plugin-fs";
import { dirname, joinPath } from "@/lib/files";
import { ReportRenderCancelled, type ColleReportImage } from "./email-render";
import { archiveRelativePath, plancheDateIso } from "./archive";
import { readColloscope } from "@/colles/import-colloscope";
import {
  weekNumberForDate,
  weeksFromDates,
  lundiOf,
  type ColleWeek,
} from "@/colles/weeks";
import {
  manualWeekNumber,
  requestManualWeekNumber,
} from "@/colles/week-overrides.svelte";
import type { CollePlanche } from "@/colles/types";

/** base64 → Uint8Array (écriture binaire sur disque). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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

/**
 * Place des images DÉJÀ RENDUES (cache du dialogue Send — source unique) dans
 * le FS utilisateur : `Colles/<année>/Semaine_XX/<colleur>_<élève>-semNN.png`.
 * AUCUN rendu ici — `images` provient du cache produit à l'ouverture du
 * dialogue (round 20 : une seule source, fraîcheur par re-rendu systématique,
 * pas de hash). Échec BRUYANT si `rootPath` manque ou si le cache est
 * incomplet (une planche sans image = bug, on ne veut pas d'archivage partiel
 * silencieux). `onProgress(done, total)` après chaque écriture.
 */
export async function archiveImages(
  images: ColleReportImage[],
  planches: CollePlanche[],
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
  if (images.length !== planches.length) {
    throw new Error("cache d'images incomplet pour l'archivage");
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
  const paths: string[] = [];
  for (let i = 0; i < planches.length; i++) {
    if (signal?.aborted) throw new ReportRenderCancelled();
    const rel = archiveRelativePath(planches[i], weekNums[i]);
    await writeArchivedImage(images[i].base64, rel, rootPath);
    paths.push(rel);
    onProgress?.(i + 1, planches.length);
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
