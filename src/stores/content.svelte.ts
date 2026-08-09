import { ContentStore } from "@/lib/content-store";
import { readText, writeText } from "@/lib/files";
import { saveDraft, loadDraft, clearDraft } from "@/lib/session";

/**
 * Store réactif du contenu par chemin (phase 7, idée E) — la couche Svelte du
 * ContentStore PUR. `contentStore` est l'AUTORITÉ : les composants et l'app
 * lisent le contenu via `contentFor(path)`, jamais via `tab.source` pour le
 * rendu (les champs `source`/`savedContent` des tabs restent des REFLETS,
 * maintenus par l'écrivain unique pour les tests et les lecteurs directs).
 *
 * Réactivité : `versionMirror` ($state Map) est alimenté par le hook
 * `onVersion` du ContentStore. Les dérivés `contentFor`/`contentSavedFor`/
 * `contentVersionOf` trackent le miroir — un bump (frappe, save, reload,
 * park) relance les $derived qui les lisent. C'est le remplacement direct de
 * `azprose:preview-force-rerender` pour les flux fichier/doc.
 */
let versionMirror = $state(new Map<string, number>());

export const contentStore = new ContentStore(
  { readText, writeText, saveDraft, loadDraft, clearDraft },
  {
    onVersion: (path, version) => {
      // Mutation d'un Map $state — réactive pour les lecteurs.
      versionMirror.set(path, version);
    },
  },
);

function normPath(p: string): string {
  return p.split("/").filter((s) => s !== "." && s !== "..").join("/");
}

/** Version de contenu d'un chemin (0 = jamais lu/écrit). RÉACTIF. */
export function contentVersionOf(path: string): number {
  return versionMirror.get(normPath(path)) ?? 0;
}

/** Contenu courant d'un chemin (buffer ?? draft ?? saved ?? ""). RÉACTIF —
 *  la version est trackée : un bump relance les dérivés qui la lisent. */
export function contentFor(path: string): string {
  void contentVersionOf(path);
  return contentStore.get(path);
}

/** Contenu disque d'un chemin (dernier load/persist). RÉACTIF. */
export function contentSavedFor(path: string): string {
  void contentVersionOf(path);
  return contentStore.getSaved(path);
}
