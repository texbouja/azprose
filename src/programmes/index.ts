/**
 * Programmes officiels EMBARQUÉS — installés au premier démarrage dans le
 * corpus applicatif (`app_data_dir()/programmes/`).
 *
 * Même motif que l'aide intégrée (`src/help/help-bundle.ts` → `.azprose/help/`)
 * et pour la même raison : une fois installé, un spécimen devient une entrée
 * de corpus ORDINAIRE. Aucune troisième source de résolution ne s'ajoute donc
 * aux deux prévues — corpus livré et échappatoire du vault.
 *
 * Bénéfice concret : `programme_lister()` n'est jamais vide sans réseau, donc
 * le chemin nominal des outils est exerçable dès la première ouverture, pas
 * seulement le chemin dégradé.
 */
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";

// `eager: true` + `?raw` : le contenu est inliné dans le bundle JS, comme pour
// l'aide. Aucun accès disque à la compilation, rien à copier au packaging.
const modules = import.meta.glob("./*.md", { query: "?raw", import: "default", eager: true });

/** Dossier du corpus livré. */
export async function corpusDir(): Promise<string> {
  return join(await appDataDir(), "programmes");
}

/**
 * Installe les programmes embarqués s'ils manquent. **Ne remplace jamais un
 * fichier existant** : l'utilisateur — ou une future archive téléchargée —
 * peut avoir posé une version plus complète, l'écraser serait une régression
 * silencieuse.
 *
 * Toute erreur est avalée : ne pas pouvoir installer un spécimen ne doit pas
 * empêcher l'assistant de démarrer.
 */
export async function installerProgrammesEmbarques(): Promise<string | null> {
  try {
    const dir = await corpusDir();
    await mkdir(dir, { recursive: true });
    for (const [clef, contenu] of Object.entries(modules)) {
      const nom = clef.replace(/^\.\//, "");
      const cible = await join(dir, nom);
      if (await exists(cible)) continue;
      await writeTextFile(cible, contenu as string);
    }
    return dir;
  } catch (e) {
    console.warn("[programmes] installation impossible :", e);
    return null;
  }
}
