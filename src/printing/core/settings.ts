/**
 * Persistance de la requête d'impression par TYPE (printing.md §2.4) — les
 * fonctions IMPURES (lecture/écriture de fichiers dans le vault). Le modèle
 * PUR (emplacements + merge défensif) vit dans `settings-model.ts`.
 */
import { mkdir } from "@tauri-apps/plugin-fs";
import { dirname, joinPath, readText, writeText } from "@/lib/files";
import { getRootPath } from "@/stores/root-path.svelte";
import type { PrintRequest } from "@/lib/print-request";
import { mergeRequest, type PrintTypeStorage } from "./settings-model";

/** Charge la dernière requête du type : fichier courant, repli legacy, défauts. */
export async function loadTypeRequest(storage: PrintTypeStorage): Promise<PrintRequest> {
  const root = getRootPath();
  if (!root) return { ...storage.defaults };
  try {
    const raw = await readText(joinPath(root, storage.file));
    return mergeRequest(JSON.parse(raw), storage.defaults);
  } catch {
    // Fichier courant absent (première ouverture post-refonte) → repli legacy.
    if (storage.legacyFile) {
      try {
        const raw = await readText(joinPath(root, storage.legacyFile));
        return mergeRequest(JSON.parse(raw), storage.defaults);
      } catch {
        // Legacy absent aussi → défauts.
      }
    }
    return { ...storage.defaults };
  }
}

/** Persiste la requête du type (créé le dossier si besoin — meilleur effort). */
export async function saveTypeRequest(storage: PrintTypeStorage, req: PrintRequest): Promise<void> {
  const root = getRootPath();
  if (!root) return;
  try {
    const file = joinPath(root, storage.file);
    // Le dossier `.azprose/print/` n'existe pas encore à la première écriture.
    await mkdir(joinPath(root, dirname(storage.file)), { recursive: true });
    await writeText(file, JSON.stringify(req, null, 2));
  } catch {
    // Meilleur effort : l'impression reste possible, la préférence ne se
    // persiste pas (fichier non créé → prochain lancement = défauts/repli).
  }
}
