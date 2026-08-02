/**
 * Rubriques d'évaluation — logique pure (testable, pas de DOM ni de store).
 *
 * La note globale d'une planche est la SOMME des rubriques du dict `notes`
 * (`{rub1: val, rub2: val, …}`), TOUJOURS calculée au rendu, jamais stockée.
 * Les rubriques d'une matière sont paramétrées dans les réglages (store
 * colles-settings) ; les helpers ci-dessous ne connaissent que la config.
 */
import type { ColleRubrique, RubriquesParMatiere } from "./types";

/** Clés de matière connues de la config (colles-settings). */
export const MATIERE_KEYS = ["maths", "physique", "francais", "anglais", "cat"] as const;
export type MatiereKey = (typeof MATIERE_KEYS)[number];

/** Normalise une valeur YAML `matiere` vers une clé de config (fallback `maths`). */
export function matiereKey(matiere: string | undefined | null): string {
  const s = (matiere ?? "").toLowerCase().trim();
  if (!s) return "maths";
  if (s === "maths" || s === "math" || s === "mathématiques" || s === "mathematiques") return "maths";
  if (s === "physique" || s === "phys" || s === "physique-chimie") return "physique";
  if (s === "français" || s === "francais" || s === "françaises" || s === "francaise" || s === "franc") return "francais";
  if (s === "anglais" || s === "english" || s === "angl") return "anglais";
  if (s === "cat" || s.includes("arabe") || s.includes("traduction")) return "cat";
  return s;
}

/** Rubriques configurées pour une matière (inconnue → défaut maths). */
export function rubriquesFor(matiere: string | undefined | null, rubriques: RubriquesParMatiere): ColleRubrique[] {
  const key = matiereKey(matiere);
  return rubriques[key]?.length ? rubriques[key] : rubriques.maths ?? [];
}

/** Somme des maxScore d'une liste de rubriques (dénominateur de la note globale). */
export function sumMaxScore(rubriques: ColleRubrique[]): number {
  return rubriques.reduce((acc, r) => acc + (Number(r.maxScore) || 0), 0);
}

/**
 * Somme des valeurs numériques d'un dict `notes`. Retourne null si aucun
 * score exploitable (rubriques toutes vides). Les valeurs non numériques
 * (ex. "—") sont ignorées.
 */
export function sumNotes(notes: Record<string, unknown> | undefined | null): number | null {
  if (!notes) return null;
  let total = 0;
  let has = false;
  for (const v of Object.values(notes)) {
    const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").trim());
    if (Number.isFinite(n)) {
      total += n;
      has = true;
    }
  }
  return has ? total : null;
}
