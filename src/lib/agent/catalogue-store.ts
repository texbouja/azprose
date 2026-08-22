// Liaison Tauri du cache de catalogue — le pendant « accès disque » de
// `catalogue-cache.ts`, qui reste pur. Même découpage que `programmes/` :
// la logique est testable, ce fichier ne fait que brancher les E/S.
//
// Palier GLOBAL : `app_data_dir()/agent/catalogue.json`. Le catalogue se
// dérive de l'INSTALLATION, pas du coffre — l'écrire par projet le
// dupliquerait à chaque ouverture. Voir l'en-tête de `catalogue-cache.ts`
// pour le reste des raisons (dont : jamais dans le cache d'OpenCode, jamais
// la clé API).

import { appDataDir, join } from "@tauri-apps/api/path";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { STORAGE_KEYS } from "@/lib/storage";
import type { FournisseurCatalogue } from "./catalogue";
import { envelopper, relire } from "./catalogue-cache";

const DOSSIER = "agent";
const FICHIER = "catalogue.json";

/**
 * Dernière version connue du binaire. Mémorisée dès qu'on l'apprend (à
 * l'initialize côté panneau, par `/global/health` côté réglages) pour que
 * TOUT lecteur puisse valider le cache — sans elle, les réglages devraient
 * lancer le serveur juste pour savoir s'ils ont le droit de lire un fichier.
 */
export function versionMemorisee(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.agentBinaryVersion) || null;
  } catch {
    return null;
  }
}

export function memoriserVersion(version: string | null): void {
  try {
    if (version) localStorage.setItem(STORAGE_KEYS.agentBinaryVersion, version);
    else localStorage.removeItem(STORAGE_KEYS.agentBinaryVersion);
  } catch {
    /* stockage indisponible : on relira le catalogue, sans plus */
  }
}

async function dossierCache(): Promise<string> {
  return join(await appDataDir(), DOSSIER);
}

/**
 * Relit le catalogue persisté. null = pas de cache utilisable (absent, ou
 * écrit par une autre version du binaire / de notre schéma) — état que le
 * code appelant connaît déjà sous le nom « pas encore chargé ».
 * Ne lève jamais : un cache absent est le cas normal du premier lancement.
 */
export async function lireCatalogueCache(
  versionBinaire: string | null = versionMemorisee(),
): Promise<FournisseurCatalogue[] | null> {
  try {
    const brut = await readTextFile(await join(await dossierCache(), FICHIER));
    return relire(brut, versionBinaire);
  } catch {
    return null;
  }
}

/** Écrit le catalogue. Sans version de binaire on n'écrit RIEN : un cache
 *  qu'on ne saurait pas invalider vaut moins que pas de cache du tout. */
export async function ecrireCatalogueCache(
  donnees: FournisseurCatalogue[],
  versionBinaire: string | null,
): Promise<void> {
  if (!versionBinaire) return;
  try {
    const dossier = await dossierCache();
    await mkdir(dossier, { recursive: true });
    await writeTextFile(
      await join(dossier, FICHIER),
      JSON.stringify(envelopper(donnees, versionBinaire)),
    );
    memoriserVersion(versionBinaire);
  } catch (e) {
    console.warn("[agent] catalogue non persisté :", e);
  }
}

/** Version du binaire vue par le serveur headless (`GET /global/health` →
 *  `{healthy, version}`, mesuré 2026-08-22). Utile là où l'on n'a pas de
 *  session ACP sous la main pour lire l'`agentInfo` de l'initialize. */
export async function versionDuServeur(
  requete: <T>(chemin: string) => Promise<T>,
): Promise<string | null> {
  try {
    const rep = await requete<{ version?: unknown }>("/global/health");
    return typeof rep?.version === "string" && rep.version ? rep.version : null;
  } catch {
    return null;
  }
}
