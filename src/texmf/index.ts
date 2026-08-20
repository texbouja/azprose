/**
 * L'arbre texmf du kit azkit — EMBARQUÉ, livré avec l'application.
 *
 * Le kit vit dans `texmf/` à la racine du dépôt, sous la disposition TDS
 * habituelle. Il est recopié au démarrage dans un dossier applicatif, parce que
 * LaTeX lit des fichiers sur disque là où le bundle vit dans le graphe JS.
 * Même motif que le corpus des programmes et que l'aide intégrée.
 *
 * **Miroir strict, réécrit dès que le contenu change** : l'utilisateur ne
 * modifie pas ces fichiers — ses commandes à lui vont dans `user.def`, dans
 * l'arbre du PROJET. Il n'y a donc aucune édition à préserver.
 *
 * ## Deux arbres, une variable
 *
 * ```
 * TEXMFAUXTREES="<app>/texmf,<projet>/.azprose/texmf,"
 * ```
 *
 * kpathsea fait cohabiter les deux : le kit se résout depuis l'arbre de
 * l'application, `user.def` depuis celui du projet, dans la même compilation.
 * **La virgule finale est obligatoire** — sans elle kpathsea ignore la liste.
 * Aucun `mktexlsr` n'est nécessaire.
 */
import { appDataDir, join } from "@tauri-apps/api/path";
import { mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { deposerTexmf } from "./deposit";

export { CHEMIN_USER_DEF, DOSSIER_USER_DEF, contenuUserDef } from "./user-def";

// `eager: true` + `?raw` : le contenu est inliné dans le bundle JS. Aucun accès
// disque à la compilation, rien à copier au packaging.
const modules = import.meta.glob("../../texmf/tex/latex/azkit/*", {
  query: "?raw",
  import: "default",
  eager: true,
});

const RACINE = "../../texmf/";

/** Dossier applicatif où l'arbre du kit est déposé. */
export async function texmfDir(): Promise<string> {
  return join(await appDataDir(), "texmf");
}

/**
 * Le même dossier, sans attendre — renseigné par `synchroniserTexmf` au
 * démarrage. texlab est démarré par du code SYNCHRONE : sans ce cache il
 * faudrait soit rendre tout le chemin d'initialisation asynchrone, soit
 * priver l'éditeur de l'arbre du kit et laisser sa complétion mentir.
 */
let _texmfDir: string | null = null;

export function texmfDirSync(): string | null {
  return _texmfDir;
}

/** Sous-arbre texmf d'un projet, où vit `user.def`. */
export async function texmfProjet(racineProjet: string): Promise<string> {
  return join(await join(racineProjet, ".azprose"), "texmf");
}

/**
 * Liste, RÉCURSIVEMENT, les chemins relatifs des fichiers présents sous `dir`.
 * Le miroir doit pouvoir retirer un fichier enfoui dans `tex/latex/azkit/`,
 * pas seulement à la racine.
 */
async function listerRecursif(dir: string, prefixe = ""): Promise<string[]> {
  const trouves: string[] = [];
  for (const e of await readDir(dir)) {
    const rel = prefixe === "" ? e.name : `${prefixe}/${e.name}`;
    if (e.isDirectory) {
      trouves.push(...await listerRecursif(await join(dir, e.name), rel));
    } else if (e.isFile) {
      trouves.push(rel);
    }
  }
  return trouves;
}

/**
 * Dépose l'arbre du kit dans le dossier applicatif, s'il a changé.
 *
 * Toute erreur est avalée : ne pas pouvoir écrire l'arbre ne doit pas empêcher
 * l'application de démarrer. La compilation LaTeX se fera sans le kit — ce qui
 * échouera bruyamment, au bon endroit, dans le journal de compilation.
 */
export async function synchroniserTexmf(): Promise<string | null> {
  try {
    const dir = await texmfDir();
    const fichiers: Record<string, string> = {};
    for (const [clef, contenu] of Object.entries(modules)) {
      fichiers[clef.replace(RACINE, "")] = contenu as string;
    }

    await deposerTexmf(fichiers, dir, {
      mkdir: (p) => mkdir(p, { recursive: true }),
      lireStamp: async (p) => {
        try { return (await readTextFile(p)).trim(); } catch { return null; }
      },
      ecrire: (p, c) => writeTextFile(p, c),
      lister: async (d) => {
        try { return await listerRecursif(d); } catch { return []; }
      },
      supprimer: (p) => remove(p),
      joindre: (a, b) => join(a, b),
    });
    _texmfDir = dir;
    return dir;
  } catch (e) {
    console.warn("[texmf] synchronisation impossible :", e);
    return null;
  }
}
