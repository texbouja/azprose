/**
 * Unified store of all person names — students + colleurs.
 * Derived reactively from eleves + colloscope stores.
 * Used by PersonCombo for Gmail-style completion.
 */
import { eleves } from "@/stores/eleves.svelte";
import { colloscope } from "@/stores/colloscope.svelte";

export interface PersonName {
  name: string;
  role: "eleve" | "colleur";
}

/**
 * All known person names, deduplicated and sorted.
 * If the same name appears as both student and colleur, role is "eleve" (first match).
 */
export function getAllNames(): PersonName[] {
  const map = new Map<string, PersonName>();

  for (const e of eleves.state.eleves) {
    const name = `${e.prenom} ${e.nom}`;
    if (!map.has(name)) map.set(name, { name, role: "eleve" });
  }

  for (const c of colloscope.state.creneaux) {
    const name = c.colleur;
    if (name && !map.has(name)) map.set(name, { name, role: "colleur" });
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
