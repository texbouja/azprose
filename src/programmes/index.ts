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
import { mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { CORPUS_VERSION } from "./catalog";
import { deposerCorpus } from "./deposit";

// `eager: true` + `?raw` : le contenu est inliné dans le bundle JS, comme pour
// l'aide. Aucun accès disque à la compilation, rien à copier au packaging.
const modules = import.meta.glob("./*.md", { query: "?raw", import: "default", eager: true });

/** Dossier applicatif où le miroir est déposé. */
export async function corpusDir(): Promise<string> {
  return join(await appDataDir(), "programmes");
}

/**
 * Dépose le corpus embarqué dans le dossier applicatif, **si son contenu a
 * changé** (stamp `version.txt` — cf. `deposit.ts`, où vit toute la logique).
 *
 * Ce module-ci n'est qu'une liaison Tauri : il résout le dossier, branche les
 * accès disque et fournit le contenu inliné par Vite. Il n'est pas testable
 * sous bun (`import.meta.glob`), et n'a pas à l'être.
 *
 * Toute erreur est avalée : ne pas pouvoir écrire le corpus ne doit empêcher ni
 * l'assistant ni NAV de démarrer. Ils travailleront sans corpus, ce qui est un
 * état normal (l'assistant sans contrainte, NAV sans suggestion `programme:`).
 */
export async function synchroniserProgrammes(): Promise<string | null> {
  try {
    const dir = await corpusDir();
    const fichiers: Record<string, string> = {};
    for (const [clef, contenu] of Object.entries(modules)) {
      fichiers[clef.replace(/^\.\//, "")] = contenu as string;
    }

    await deposerCorpus(fichiers, dir, CORPUS_VERSION, {
      mkdir: (p) => mkdir(p, { recursive: true }),
      lireStamp: async (p) => {
        try { return (await readTextFile(p)).trim(); } catch { return null; }
      },
      ecrire: (p, c) => writeTextFile(p, c),
      listerMd: async (d) =>
        (await readDir(d))
          .filter((e) => e.isFile && e.name.toLowerCase().endsWith(".md"))
          .map((e) => e.name),
      supprimer: (p) => remove(p),
      joindre: (a, b) => join(a, b),
    });
    return dir;
  } catch (e) {
    console.warn("[programmes] synchronisation impossible :", e);
    return null;
  }
}
