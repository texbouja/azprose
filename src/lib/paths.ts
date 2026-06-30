// Path comparison utilities, separator- and case-aware so project-conflict logic
// is correct on Windows (back-slashes, case-insensitive) as well as Unix.
import { IS_WINDOWS } from "./platform";

function normForCompare(p: string): string {
  const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return IS_WINDOWS ? s.toLowerCase() : s;
}

export type FolderRelation = "same" | "nested" | "disjoint";

/**
 * Relationship between two folder paths:
 * - `same`     — identical folder
 * - `nested`   — one is an ancestor/descendant of the other (FS overlap)
 * - `disjoint` — no overlap
 *
 * Compares whole path segments (not raw string prefixes), so `/foo` does not
 * match `/foobar`.
 */
export function folderRelation(a: string, b: string): FolderRelation {
  const na = normForCompare(a);
  const nb = normForCompare(b);
  if (na === nb) return "same";
  if (na.startsWith(nb + "/") || nb.startsWith(na + "/")) return "nested";
  return "disjoint";
}
