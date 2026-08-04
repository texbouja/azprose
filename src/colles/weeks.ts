/**
 * Numérotation des SEMAINES DE COLLE (décision utilisateur round 16).
 * Logique PURE (testable en bun — aucun DOM, aucun IPC).
 *
 * Le numéro de semaine de colle n'est PAS le numéro ISO absolu de la date
 * (semaine 41 de l'année, par ex.) : c'est la position SÉQUENTIELLE 1..N de la
 * semaine dans la période d'enseignement du colloscope. Les vacances sont
 * exclues du colloscope → les semaines de colle se suivent sans trou.
 *
 * Toutes les fonctions travaillent sur des dates au format « YYYY-MM-DD »
 * (local, jamais de fuseau — les dates de colle sont des dates calendaires).
 */

/** Nombre de millisecondes dans un jour (UTC — le calcul ne croise jamais de fuseau). */
const DAYS_MS = 86_400_000;

/** « 2026-01-02 » → timestamp UTC de minuit (arithmétique de date pure). */
function isoToTime(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return Number.NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return Number.NaN;
  // Détection du roll-over : Date.UTC normalise les dates inexistantes
  // (mois 13 → janvier suivant, 30 février → 2 mars) — on re-vérifie donc.
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return Number.NaN;
  }
  return t;
}

/** Timestamp UTC de minuit → « YYYY-MM-DD ». */
function timeToIso(t: number): string {
  const d = new Date(t);
  return (
    `${d.getUTCFullYear()}-` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getUTCDate()).padStart(2, "0")}`
  );
}

/**
 * Lundi de la semaine contenant `date` (« YYYY-MM-DD »). La semaine commence
 * le lundi (convention du colloscope). Retourne « » si la date est invalide.
 */
export function lundiOf(iso: string): string {
  const t = isoToTime(iso);
  if (Number.isNaN(t)) return "";
  const day = new Date(t).getUTCDay(); // 0 = dimanche … 6 = samedi
  const sinceMonday = (day + 6) % 7; // lundi=0 … dimanche=6
  return timeToIso(t - sinceMonday * DAYS_MS);
}

/** Une semaine de colle : son lundi (début) et son numéro séquentiel 1..N. */
export interface ColleWeek {
  weekStart: string;
  weekNum: number;
}

/**
 * Construit la séquence des semaines de colle depuis les dates de séances du
 * colloscope : lundis distincts, triés chronologiquement, numérotés 1..N.
 * Les dates invalides sont ignorées ; sans date valide → [].
 */
export function weeksFromDates(dates: string[]): ColleWeek[] {
  const lundis = new Set<string>();
  for (const d of dates) {
    const lundi = lundiOf(d);
    if (lundi) lundis.add(lundi);
  }
  return [...lundis]
    .sort()
    .map((weekStart, i) => ({ weekStart, weekNum: i + 1 }));
}

/**
 * Numéro de semaine de colle d'une date, ou null si la date n'appartient à
 * AUCUNE semaine du colloscope (hors période — avant le premier lundi, après
 * le dernier, ou pendant une semaine sans colle).
 */
export function weekNumberForDate(date: string, weeks: ColleWeek[]): number | null {
  const lundi = lundiOf(date);
  if (!lundi) return null;
  return weeks.find((w) => w.weekStart === lundi)?.weekNum ?? null;
}

/**
 * Comme weekNumberForDate mais ÉCHEC BRUYANT : throw si la date est hors du
 * colloscope. `label` décrit la planche (ex. son élève) pour le message.
 */
export function requiredWeekNumber(
  date: string,
  weeks: ColleWeek[],
  label: string,
): number {
  const n = weekNumberForDate(date, weeks);
  if (n !== null) return n;
  throw new Error(
    `Aucune semaine de colle pour ${label} (${date}) : la date est hors de la période ` +
      `du colloscope. Étendez les dates (Réglages › Colles › Dates), ré-importez le ` +
      `colloscope ou corrigez la date de la planche.`,
  );
}
