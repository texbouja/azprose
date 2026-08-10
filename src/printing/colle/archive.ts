/**
 * Nommage et chemins d'archivage des images de rapports de colles.
 * Logique PURE (testable en bun — aucun DOM, aucun IPC).
 *
 * Arborescence (décision utilisateur) :
 *   Colles/<année>/Semaine_XX/<colleur>-<Nom_Prénom>-semXX.png
 * Exemple : Colles/2026/Semaine_01/Boujaida-El_Moujahid_Ahmed-sem01.png
 *
 * - Images TOUJOURS en PNG (l'option SVG a été retirée au round 16 ;
 *   capturées par headless Chrome depuis le round 19).
 *
 * - Dossier par ANNÉE (année calendaire de la date de la colle).
 * - Dossier par SEMAINE SANS date : « Semaine_XX » — numéro de SEMAINE DE
 *   COLLE 1..N (position séquentielle dans la période d'enseignement du
 *   colloscope, calculée dynamiquement — PAS le numéro ISO absolu ; voir
 *   weeks.ts).
 * - Nom de fichier : nom du colleur SANS civilité (M./Mme.…), nom + prénom de
 *   l'élève séparés par un underscore (l'élève est stocké « Prénom Nom » → le
 *   nom de fichier est « Nom_Prénom »), référence de semaine « semXX ».
 */
import type { CollePlanche } from "@/colles/types";

/** Racine du dossier d'archivage, à la racine du projet (vault). */
export const ARCHIVE_ROOT = "Colles";

/** Civilites retirées en tête du nom du colleur (avec ou sans point). */
const CIVILITE_RE = /^(?:m\.|mme\.?|mlle\.?|mr\.?|mrs\.?|dr\.?|pr\.?)\s+/i;

/** Retire la civilité « M. »/« Mme. »… en tête du nom. No-op si absente. */
export function stripCivility(name: string): string {
  const s = name.trim();
  const stripped = s.replace(CIVILITE_RE, "").trim();
  return stripped || s;
}

/**
 * Slug sûr pour un nom de fichier : accents supprimés (NFD + diacritiques),
 * suites d'espaces → `sep`, caractères hors [A-Za-z0-9_-] retirés.
 */
export function slugPart(s: string, sep: string): string {
  const normalized = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/\s+/g, sep).replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Découpe « Prénom Nom » → {prenom, nom} : PREMIER mot = prénom, le reste =
 * nom (les noms composés « El Moujahid » restent dans le nom). Un seul mot →
 * {prenom: mot, nom: ""}.
 */
export function splitEleveName(eleve: string): { prenom: string; nom: string } {
  const parts = eleve.trim().split(/\s+/);
  if (parts.length <= 1) return { prenom: parts[0] ?? "", nom: "" };
  return { prenom: parts[0], nom: parts.slice(1).join(" ") };
}

/**
 * Numéro ISO de la semaine (1-53) de la date. CONSERVÉ comme helper pur de
 * référence (algorithme ISO 8601 : recalage sur le jeudi) mais il ne sert
 * PLUS au nommage d'archivage — remplacé par la numérotation des semaines de
 * COLLE du colloscope (weeks.ts).
 */
export function isoWeekNumber(date: Date): number {
  // Jeudi de la semaine courante : ISO définit la semaine par son jeudi.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // lundi=1 … dimanche=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Date de la planche (meta.date YYYY-MM-DD) ; repli = aujourd'hui. */
export function plancheDate(planche: CollePlanche): Date {
  const d = planche.meta.date?.trim();
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const parsed = new Date(`${d}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/** Date de la planche au format « YYYY-MM-DD » (local — jamais de fuseau). */
export function plancheDateIso(planche: CollePlanche): string {
  const d = plancheDate(planche);
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

/** « sem01 » — référence de semaine de colle dans le nom de fichier. */
export function semaineRef(weekNum: number): string {
  return `sem${String(weekNum).padStart(2, "0")}`;
}

/** « Semaine_01 » — dossier de semaine de colle (sans date). */
export function semaineFolder(weekNum: number): string {
  return `Semaine_${String(weekNum).padStart(2, "0")}`;
}

/** « 2026 » — dossier d'année (année calendaire de la date). */
export function anneeFolder(date: Date): string {
  return String(date.getFullYear());
}

/** Partie « colleur » du nom de fichier : civilité retirée, espaces → tirets. */
export function colleurNamePart(colleur: string): string {
  return slugPart(stripCivility(colleur), "-") || "Colleur";
}

/** Partie « élève » : Nom_Prénom (underscore). Repli « Sans_eleve ». */
export function eleveNamePart(eleve: string): string {
  const { prenom, nom } = splitEleveName(eleve);
  const p = slugPart(prenom, "_");
  const n = slugPart(nom, "_");
  if (n && p) return `${n}_${p}`;
  return p || n || "Sans_eleve";
}

/**
 * Extension des images archivées : TOUJOURS `png` (l'option SVG est retirée
 * depuis le round 16).
 */
export const ARCHIVE_EXTENSION = "png";

/**
 * Nom de fichier : <colleur>-<Nom_Prénom>-semXX.png.
 * `weekNum` = numéro de SEMAINE DE COLLE (1..N, séquence du colloscope) —
 * exigé en argument : le module est PUR, la résolution vient de weeks.ts.
 */
export function archiveFileName(planche: CollePlanche, weekNum: number): string {
  const meta = planche.meta;
  return (
    `${colleurNamePart(meta.colleur ?? "")}-` +
    `${eleveNamePart(meta.eleve ?? "")}-` +
    `${semaineRef(weekNum)}.${ARCHIVE_EXTENSION}`
  );
}

/** Chemin relatif : Colles/<année>/Semaine_XX/<fichier>. */
export function archiveRelativePath(planche: CollePlanche, weekNum: number): string {
  const date = plancheDate(planche);
  return `${ARCHIVE_ROOT}/${anneeFolder(date)}/${semaineFolder(weekNum)}/${archiveFileName(planche, weekNum)}`;
}
