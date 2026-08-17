/**
 * Dépôt du corpus embarqué sur disque — logique PURE.
 *
 * MODULE PUR : aucun import svelte/tauri, et surtout **aucun `import.meta.glob`**
 * (primitive Vite, absente sous bun). Le contenu livré est passé en paramètre,
 * les accès disque sont injectés — c'est ce qui rend le dépôt testable. Même
 * motif que `src/help/catalog-data.ts` pour l'aide.
 */

/** Stamp de version déposé à côté du miroir. */
export const STAMP = "version.txt";

/** Accès disque, injectés par l'appelant (Tauri en production, faux en test). */
export interface DepsDepot {
  mkdir: (p: string) => Promise<void>;
  lireStamp: (p: string) => Promise<string | null>;
  ecrire: (p: string, contenu: string) => Promise<void>;
  listerMd: (dir: string) => Promise<string[]>;
  supprimer: (p: string) => Promise<void>;
  joindre: (a: string, b: string) => Promise<string>;
}

/**
 * Dépose le corpus dans `dir`, **si son contenu a changé**.
 *
 * Le stamp porte `version` (hash du contenu livré, généré par
 * `build-corpus.mjs`) : même version → aucune écriture. Sans cette garde,
 * chaque démarrage réécrirait tout le corpus — supportable à 268 Ko, plus du
 * tout aux ~2,7 Mo attendus à trente programmes.
 *
 * Quand il écrit, le miroir est **strict** : chaque fichier livré est réécrit,
 * puis les `.md` qui ne sont plus livrés sont retirés — un programme retiré
 * d'une version à l'autre ne doit pas survivre.
 *
 * Rend `true` s'il a écrit, `false` s'il n'y avait rien à faire.
 */
export async function deposerCorpus(
  fichiers: Record<string, string>,
  dir: string,
  version: string,
  d: DepsDepot,
): Promise<boolean> {
  await d.mkdir(dir);

  const stamp = await d.joindre(dir, STAMP);
  if ((await d.lireStamp(stamp)) === version) return false;

  const livres = new Set(Object.keys(fichiers));
  for (const [nom, contenu] of Object.entries(fichiers)) {
    await d.ecrire(await d.joindre(dir, nom), contenu);
  }

  for (const nom of await d.listerMd(dir)) {
    if (!livres.has(nom)) await d.supprimer(await d.joindre(dir, nom));
  }

  // Le stamp s'écrit EN DERNIER : une écriture interrompue laisse un stamp
  // absent ou périmé, donc une resynchronisation au prochain démarrage —
  // jamais un dépôt incomplet réputé à jour.
  await d.ecrire(stamp, version);
  return true;
}
