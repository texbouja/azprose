/**
 * Dépôt de l'arbre texmf du kit sur disque — logique PURE.
 *
 * MODULE PUR : aucun import svelte/tauri, et surtout **aucun `import.meta.glob`**
 * (primitive Vite, absente sous bun). Le contenu livré est passé en paramètre,
 * les accès disque sont injectés. Même motif que `src/programmes/deposit.ts`.
 *
 * Ce dépôt-ci diffère de celui des programmes sur un point : l'arbre est
 * ARBORESCENT (`tex/latex/azkit/azbase.sty`), là où le corpus est plat. Chaque
 * fichier fait donc créer son dossier parent, et le miroir se compare sur des
 * chemins relatifs et non sur des noms.
 */

/** Stamp de version déposé à la racine de l'arbre. */
export const STAMP = "version.txt";

/** Accès disque, injectés par l'appelant (Tauri en production, faux en test). */
export interface DepsTexmf {
  mkdir: (p: string) => Promise<void>;
  lireStamp: (p: string) => Promise<string | null>;
  ecrire: (p: string, contenu: string) => Promise<void>;
  /** Chemins RELATIFS à `dir` des fichiers déjà présents. */
  lister: (dir: string) => Promise<string[]>;
  supprimer: (p: string) => Promise<void>;
  joindre: (a: string, b: string) => Promise<string>;
}

/**
 * Empreinte du contenu livré.
 *
 * Calculée à l'exécution, et non par un script de compilation : l'arbre pèse
 * quelques dizaines de kilo-octets, le hachage coûte moins qu'un fichier
 * généré de plus à tenir à jour. FNV-1a — on cherche à détecter un changement,
 * pas à résister à une attaque.
 */
export function empreinte(fichiers: Record<string, string>): string {
  let h = 0x811c9dc5;
  for (const chemin of Object.keys(fichiers).sort()) {
    for (const texte of [chemin, fichiers[chemin]]) {
      for (let i = 0; i < texte.length; i++) {
        h ^= texte.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
  }
  return h.toString(16).padStart(8, "0");
}

/** Dossier parent d'un chemin relatif, ou `null` s'il est à la racine. */
export function dossierParent(chemin: string): string | null {
  const i = chemin.lastIndexOf("/");
  return i <= 0 ? null : chemin.slice(0, i);
}

/**
 * Dépose l'arbre du kit dans `dir`, **si son contenu a changé**.
 *
 * Le miroir est STRICT : chaque fichier livré est réécrit, puis ceux qui ne
 * sont plus livrés sont retirés. Un module supprimé d'une version à l'autre ne
 * doit pas survivre dans l'arbre applicatif, sinon `\usepackage` continuerait
 * de le trouver.
 *
 * Le stamp s'écrit EN DERNIER : une écriture interrompue laisse un stamp absent
 * ou périmé, donc une resynchronisation au prochain démarrage — jamais un dépôt
 * incomplet réputé à jour.
 *
 * Rend `true` s'il a écrit, `false` s'il n'y avait rien à faire.
 */
export async function deposerTexmf(
  fichiers: Record<string, string>,
  dir: string,
  d: DepsTexmf,
): Promise<boolean> {
  const version = empreinte(fichiers);

  await d.mkdir(dir);
  const stamp = await d.joindre(dir, STAMP);
  if ((await d.lireStamp(stamp)) === version) return false;

  const dossiersFaits = new Set<string>();
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    const parent = dossierParent(chemin);
    if (parent && !dossiersFaits.has(parent)) {
      await d.mkdir(await d.joindre(dir, parent));
      dossiersFaits.add(parent);
    }
    await d.ecrire(await d.joindre(dir, chemin), contenu);
  }

  const livres = new Set(Object.keys(fichiers));
  for (const chemin of await d.lister(dir)) {
    if (chemin !== STAMP && !livres.has(chemin)) {
      await d.supprimer(await d.joindre(dir, chemin));
    }
  }

  await d.ecrire(stamp, version);
  return true;
}
