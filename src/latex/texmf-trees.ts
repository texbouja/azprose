/**
 * Les arbres texmf visibles par une compilation, et le dépôt de `user.def`.
 *
 * Deux arbres, jamais un seul :
 *
 *   · celui de l'APPLICATION, qui porte le kit azkit ;
 *   · celui du PROJET (`.azprose/texmf`), qui porte `user.def` et les paquets
 *     que l'utilisateur y a déposés lui-même.
 *
 * Ils sont passés à `latexmk` par `TEXMFAUXTREES`, et à texlab par le même
 * moyen — c'est ce qui fait que l'éditeur et le compilateur voient les mêmes
 * fichiers, condition pour que la complétion ne mente pas.
 */
import { mkdir, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { getRootPath } from "@/stores/root-path.svelte";
import { joinPath } from "@/lib/files";
import { texmfDir, contenuUserDef, CHEMIN_USER_DEF, DOSSIER_USER_DEF } from "@/texmf";

/** Assemble un chemin à partir d'une racine et de segments. */
function chemin(racine: string, segments: readonly string[]): string {
  return segments.reduce((acc, s) => joinPath(acc, s), racine);
}

/**
 * Les arbres à annoncer, dans l'ordre de RECHERCHE : l'application d'abord, le
 * projet ensuite. Un projet ne doit pas pouvoir masquer un module du kit par
 * accident — s'il le veut vraiment, il redéfinit dans `user.def`.
 */
export async function arbresTexmf(): Promise<string[]> {
  const arbres: string[] = [];
  try {
    const app = await texmfDir();
    if (app) arbres.push(app);
  } catch { /* l'arbre du kit n'a pas pu être résolu : on compile sans */ }
  const racine = getRootPath();
  if (racine) arbres.push(chemin(racine, [".azprose", "texmf"]));
  return arbres;
}

/**
 * Dépose (ou retire) `user.def` d'après le réglage.
 *
 * Appelé AVANT chaque compilation plutôt qu'à la modification du réglage : le
 * fichier est ainsi toujours en phase avec ce que l'utilisateur voit, y compris
 * après un changement de projet ou une modification faite dans une autre
 * fenêtre. L'écriture coûte quelques microsecondes.
 *
 * Toute erreur est avalée : un `user.def` non écrit fait échouer les macros qui
 * en dépendent, ce qui se voit dans le journal — mais ne doit pas empêcher la
 * compilation de partir.
 */
export async function deposerUserDef(preambule: string): Promise<void> {
  const racine = getRootPath();
  if (!racine) return;
  const cible = chemin(racine, CHEMIN_USER_DEF);
  const contenu = contenuUserDef(preambule);
  try {
    if (contenu === null) {
      await remove(cible).catch(() => {});
      return;
    }
    await mkdir(chemin(racine, DOSSIER_USER_DEF), { recursive: true });
    await writeTextFile(cible, contenu);
  } catch (e) {
    console.warn("[texmf] user.def non déposé :", e);
  }
}
