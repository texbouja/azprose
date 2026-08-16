/**
 * Programmes officiels EMBARQUÉS — livrés avec l'application.
 *
 * ⚠️ **`*.md` de ce dossier sont GÉNÉRÉS** par `bun run corpus` depuis
 * `corpus/` — ne jamais les éditer à la main, la synchro les écrase. La source
 * de vérité est `corpus/`, avec son guide de préparation.
 *
 * Ils sont recopiés au démarrage dans un dossier applicatif, parce que le
 * serveur MCP est en Rust et lit des fichiers sur disque, là où le bundle vit
 * dans le graphe JS. Même motif que l'aide intégrée.
 *
 * **Miroir strict, toujours réécrit** (2026-08-16) : l'utilisateur ne peut pas
 * modifier ces fichiers, il n'y a donc aucune édition à préserver — et une
 * correction officielle arrive sans conflit possible. Lever ou ajouter une
 * contrainte reste faisable, mais **dans la conversation**, à la demande
 * explicite et assumée.
 */
import { appDataDir, join } from "@tauri-apps/api/path";
import { mkdir, readDir, remove, writeTextFile } from "@tauri-apps/plugin-fs";

// `eager: true` + `?raw` : le contenu est inliné dans le bundle JS, comme pour
// l'aide. Aucun accès disque à la compilation, rien à copier au packaging.
const modules = import.meta.glob("./*.md", { query: "?raw", import: "default", eager: true });

/** Dossier applicatif où le miroir est déposé. */
export async function corpusDir(): Promise<string> {
  return join(await appDataDir(), "programmes");
}

/**
 * Dépose le corpus embarqué dans le dossier applicatif. **Idempotent et
 * destructif** : réécrit chaque fichier, puis retire ceux qui ne sont plus
 * livrés — un programme retiré d'une version à l'autre ne doit pas survivre.
 *
 * Toute erreur est avalée : ne pas pouvoir écrire le corpus ne doit pas
 * empêcher l'assistant de démarrer. Il travaillera sans contrainte, ce qui est
 * un état normal.
 */
export async function synchroniserProgrammes(): Promise<string | null> {
  try {
    const dir = await corpusDir();
    await mkdir(dir, { recursive: true });

    const livres = new Set<string>();
    for (const [clef, contenu] of Object.entries(modules)) {
      const nom = clef.replace(/^\.\//, "");
      livres.add(nom);
      await writeTextFile(await join(dir, nom), contenu as string);
    }

    for (const e of await readDir(dir)) {
      if (e.isFile && e.name.toLowerCase().endsWith(".md") && !livres.has(e.name)) {
        await remove(await join(dir, e.name));
      }
    }
    return dir;
  } catch (e) {
    console.warn("[programmes] synchronisation impossible :", e);
    return null;
  }
}
