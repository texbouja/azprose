/**
 * Ordonnancement I/O de l'injection colles dans la daily note (module SÉPARÉ).
 *
 * Ce module tire des stores runes svelte (journal-store, user-profile) et le
 * colloscope (import-colloscope → spreadsheet/store → root-path) : il est donc
 * importé statiquement PAR LE BUNDLE SEUL, jamais par les tests bun — la
 * génération pure vit dans `daily-note.ts` (testable sans runes ni Tauri).
 *
 * Les imports sont statiques (pas de `await import()`) : les modules cibles
 * sont déjà dans le chunk principal (barrel @/colles, ColleSendDialog,
 * SettingsOverlay, journal-view) — un import dynamique y serait inefficace
 * (warning bundler `INEFFECTIVE_DYNAMIC_IMPORT`).
 */
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import { readColloscope } from "./import-colloscope";
import { buildCollesSection } from "./daily-note";
import { journal } from "@/stores/journal-store.svelte";
import { userProfile } from "@/stores/user-profile.svelte";

/**
 * Génère la note du jour si absente, en y injectant la section colles le cas
 * échéant. Une note existante est retournée telle quelle (jamais modifiée).
 *
 * Quand une section est générée, le fichier reçoit AUSSI le front matter
 * `type: colle` : c'est LA condition d'activation de la vue planches
 * (CollePreview) — ni l'emplacement, ni la présence de fences ne comptent.
 */
export async function ensureDailyNoteWithColles(
  date: string,
  rootPath: string | null,
  folder: string,
): Promise<string | null> {
  const existed = await journal.noteExists(date, rootPath, folder);
  const p = await journal.createNote(date, rootPath, folder);
  if (p && !existed) {
    const section = await buildCollesSectionForDate(date);
    if (section) {
      const content = await readTextFile(p);
      await writeTextFile(p, `---\ntype: colle\n---\n\n${content.trimEnd()}\n\n${section}`);
    }
  }
  return p;
}

/** Lit le colloscope et construit la section pour une date (null si absent). */
async function buildCollesSectionForDate(date: string): Promise<string | null> {
  const data = await readColloscope();
  if (!data) return null;
  return buildCollesSection(data, date, userProfile.current.colleurName);
}
