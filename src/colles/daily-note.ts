/**
 * Injection d'une section colles dans la daily note (au clic calendrier).
 *
 * Si la date cliquée contient des colles du colleur du profil
 * (`userProfile.current.colleurName`), la note fraîchement créée est complétée
 * d'une section structurée :
 *
 *   ---            ← double `---` d'annonce (reconnu par `findFichesSection`)
 *   ---
 *   ```colle       ← une fiche par élève (métadonnées YAML de la db)
 *   matiere: …
 *   colleur: …
 *   eleve: …
 *   date: …
 *   creneau: …
 *   salle: …
 *   classe: …
 *   groupe: …
 *   email_eleve: …   ← colonne Élèves du colloscope (vide si absente)
 *   programme: ""    ← renseigné après génération par le colleur
 *   ```
 *   ---            ← séparateur de fiches
 *   ```colle
 *   …
 *   ```
 *
 * Les métadonnées proviennent de la base colloscope (readColloscope) ; le YAML
 * est toujours sérialisé par `stringify` (package `yaml`), même protection que
 * le write-back — jamais d'injection de texte libre autrement.
 *
 * L'injection n'a lieu QUE pour une note absente (branche création) : une note
 * existante est ouverte telle quelle, jamais modifiée.
 */

import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { stringify } from "yaml";

import { seancesDuColleur } from "./colloscope";
import type { ColloscopeData, ColloscopeSeance } from "./colloscope";

// ── Génération pure (testable sans Tauri ni runes) ────────────────────────

/** Métadonnées d'une fiche de colle (codefence ```colle). */
export interface ColleFicheMeta {
  matiere: string;
  colleur: string;
  eleve: string;
  date: string;
  creneau: string;
  salle: string;
  classe: string;
  groupe: string;
  /** Email de l'élève (colonne Élèves du colloscope ; vide si absente). */
  email_eleve: string;
  /** Programme de la semaine — vide à la génération, renseigné ensuite par le colleur. */
  programme: string;
}

/** Écrit la codefence d'une fiche : ```colle + YAML stringifié. */
export function fenceColle(meta: ColleFicheMeta): string {
  const yaml = stringify({
    matiere: meta.matiere,
    colleur: meta.colleur,
    eleve: meta.eleve,
    date: meta.date,
    creneau: meta.creneau,
    salle: meta.salle,
    classe: meta.classe,
    groupe: meta.groupe,
    email_eleve: meta.email_eleve,
    programme: meta.programme,
  }).trimEnd();
  return "```colle\n" + yaml + "\n```";
}

/**
 * Séances du colleur pour une date, triées par (horaire, classe, groupe).
 * Tri stable pour un rendu déterministe, quel que soit l'ordre du colloscope.
 */
export function seancesDuJour(
  data: ColloscopeData,
  date: string,
  colleurName: string,
): ColloscopeSeance[] {
  return seancesDuColleur(
    data.seances.filter((s) => s.date === date),
    colleurName,
  ).sort(
    (a, b) =>
      a.horaire.localeCompare(b.horaire) ||
      a.classe.localeCompare(b.classe) ||
      a.groupe.localeCompare(b.groupe),
  );
}

/**
 * Construit la section colles d'une daily note : double `---` d'annonce puis
 * une fiche par élève (codefence ```colle), séparées par `---`.
 *
 * Retourne `null` si aucune colle du colleur ce jour, ou si aucun élève du
 * colloscope ne correspond aux groupes collés (fiches vides inutiles).
 */
export function buildCollesSection(
  data: ColloscopeData,
  date: string,
  colleurName: string,
): string | null {
  const seances = seancesDuJour(data, date, colleurName);
  if (seances.length === 0) return null;

  const fiches: string[] = [];
  for (const s of seances) {
    const eleves = data.eleves
      .filter((e) => e.classe === s.classe && e.groupe === s.groupe)
      .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
    for (const e of eleves) {
      fiches.push(
        fenceColle({
          matiere: s.matiere,
          colleur: s.colleur,
          eleve: `${e.prenom} ${e.nom}`,
          date: s.date,
          creneau: s.horaire,
          salle: s.salle,
          classe: s.classe,
          groupe: s.groupe,
          email_eleve: e.email,
          programme: "",
        }),
      );
    }
  }
  if (fiches.length === 0) return null;

  return `---\n\n---\n\n${fiches.join("\n\n---\n\n")}\n`;
}

// ── Orchestration I/O (Tauri) ──────────────────────────────────────────────

/**
 * Génère la note du jour si absente, en y injectant la section colles le cas
 * échéant. Une note existante est retournée telle quelle (jamais modifiée).
 */
export async function ensureDailyNoteWithColles(
  date: string,
  rootPath: string | null,
  folder: string,
): Promise<string | null> {
  const { journal } = await import("@/stores/journal-store.svelte");
  const existed = await journal.noteExists(date, rootPath, folder);
  const p = await journal.createNote(date, rootPath, folder);
  if (p && !existed) {
    const section = await buildCollesSectionForDate(date);
    if (section) {
      const content = await readTextFile(p);
      await writeTextFile(p, `${content.trimEnd()}\n\n${section}`);
    }
  }
  return p;
}

/** Lit le colloscope et construit la section pour une date (null si absent). */
async function buildCollesSectionForDate(date: string): Promise<string | null> {
  // Import dynamique : import-colloscope tire un store svelte (colles-settings)
  // — le garder hors du module pur (testable sous bun sans runes).
  const { readColloscope } = await import("./import-colloscope");
  const data = await readColloscope();
  if (!data) return null;
  const { userProfile } = await import("@/stores/user-profile.svelte");
  return buildCollesSection(data, date, userProfile.current.colleurName);
}
