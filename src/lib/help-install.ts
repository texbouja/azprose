import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { HELP_VERSION } from "@/help/catalog";
import { joinPath } from "./paths-utils";

/** Dossier d'installation de la documentation embarquée (sous .azprose/,
 *  donc déjà filtré du watcher FS — pas de boucle). */
export const HELP_DIR = ".azprose/help";

export function helpDir(rootPath: string): string {
  return joinPath(rootPath, HELP_DIR);
}

export function helpFilePath(rootPath: string, rel: string): string {
  return joinPath(helpDir(rootPath), rel);
}

/** Chemin de la racine de la doc (sa TOC est affichée dans la sidebar). */
export function helpIndexPath(rootPath: string): string {
  return helpFilePath(rootPath, "index.md");
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".").join("/");
}

/** `true` si `path` est un fichier de la documentation embarquée. */
export function isHelpPath(path: string, rootPath: string | null | undefined): boolean {
  if (!rootPath) return false;
  return normalize(path).startsWith(normalize(helpDir(rootPath)) + "/");
}

/**
 * Matérialise la documentation embarquée dans `<racine>/.azprose/help/` si la
 * version installée diffère du bundle (stamp `.version`). Idempotent : au
 * démarrage d'un projet déjà à jour, ne réécrit rien. Le `getHelpBundle`
 * (import.meta.glob) est chargé à l'exécution pour garder ce module testable
 * sous bun sans évaluer le glob.
 *
 * Retourne le dossier help, ou `null` en cas d'échec (jamais bloquant).
 */
export async function ensureHelpInstalled(rootPath: string | null | undefined): Promise<string | null> {
  if (!rootPath) return null;
  const dir = helpDir(rootPath);
  try {
    await mkdir(dir, { recursive: true });
    const stamp = joinPath(dir, ".version");
    try {
      const v = await readTextFile(stamp);
      // Version GÉNÉRÉE (hash du contenu, string) — comparaison en chaîne.
      // Un ancien stamp numérique ("1") ne matche jamais le hash → réinstallation
      // unique lors de la migration vers la version générée.
      if (String(v).trim() === String(HELP_VERSION)) return dir;
    } catch {
      /* pas de stamp → installation */
    }
    const { getHelpBundle } = await import("@/help/help-bundle");
    const bundle = getHelpBundle();
    for (const [rel, content] of Object.entries(bundle)) {
      const target = joinPath(dir, rel);
      // S'assure que le sous-dossier existe (les deux séparateurs tolérés).
      const parent = target.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
      await mkdir(parent, { recursive: true });
      await writeTextFile(target, content);
    }
    await writeTextFile(stamp, String(HELP_VERSION));
    return dir;
  } catch (err) {
    console.error("[help] ensureHelpInstalled failed:", err);
    return null;
  }
}
