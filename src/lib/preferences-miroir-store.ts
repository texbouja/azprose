// Liaison Tauri du miroir de préférences — le pendant « accès disque » de
// `preferences-miroir.ts`, qui reste pur. Même découpage que le cache du
// catalogue de l'assistant.
//
// Emplacement : `app_data_dir()/preferences.json`. Palier GLOBAL, et c'est le
// point : ces préférences ne dépendent d'aucun coffre — les écrire dans
// `.azprose/` les rendrait différentes d'un projet à l'autre, ce qu'elles ne
// sont pas.

import { appDataDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { instantaner, restaurer } from "./preferences-miroir";

const FICHIER = "preferences.json";

/** Écriture différée : les préférences changent par rafales (une frappe dans
 *  un champ de réglage = une écriture par caractère). */
const DELAI_ECRITURE_MS = 1500;

async function chemin(): Promise<string> {
  return join(await appDataDir(), FICHIER);
}

let minuterie: ReturnType<typeof setTimeout> | null = null;

/** Demande une écriture du miroir. Idempotente et différée : appelable à
 *  chaque changement de préférence sans y penser. */
export function planifierMiroir(): void {
  if (typeof localStorage === "undefined") return;
  if (minuterie) clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    minuterie = null;
    void ecrireMiroir();
  }, DELAI_ECRITURE_MS);
}

export async function ecrireMiroir(): Promise<void> {
  try {
    await writeTextFile(await chemin(), JSON.stringify(instantaner(localStorage)));
  } catch (e) {
    // Ne jamais faire échouer un réglage parce que son filet n'a pas pu
    // s'écrire : le stockage local, lui, a déjà pris la valeur.
    console.warn("[préférences] miroir non écrit :", e);
  }
}

/**
 * Restaure les préférences absentes, AVANT que les stores ne se construisent
 * (ils lisent le stockage à l'initialisation du module). Rend les clés
 * restaurées, pour que l'appelant puisse le dire.
 */
export async function restaurerMiroir(): Promise<string[]> {
  if (typeof localStorage === "undefined") return [];
  try {
    const brut = await readTextFile(await chemin());
    return restaurer(brut, localStorage);
  } catch {
    return []; // pas de miroir : premier lancement, cas normal
  }
}
