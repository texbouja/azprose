/**
 * Historique de MONTAGE du pinned slot (Phase D — « pinned tabs », D6/D8/R10).
 *
 * Un pinned slot (au plus un éditeur épinglé PAR FORMAT) est un tab qui change
 * de contenu : chaque montage (clic sidebar, TOC/backlinks, journal, oxide,
 * inverse search) re-pointe le MÊME tab. Cette pile enregistre les contenus
 * successivement montés, pour « remonter » à celui d'avant.
 *
 * Choix de clé : le FORMAT (md, tex, typ…), pas l'id du tab — le slot est
 * défini par son format (R1 : au plus un épinglé par format) et l'épingle est
 * commutable ; l'historique appartient au SLOT, pas au tab qui l'occupe.
 *
 * RUNTIME uniquement : jamais persisté, ni en session ni en localStorage
 * (R10) ; la pile d'un format meurt avec son épingle (`purge`).
 *
 * Sémantique du RETOUR (D6) : « retrouver le buffer dans son dernier état sans
 * rebuild » — la pile ne mémorise QUE des chemins ; l'état du buffer est
 * restitué par le ContentStore (park + `preferDraft` au re-point), et aucun
 * rebuild LaTeX n'est déclenché (le viewer PDF garde son dernier buffer
 * valide, garde-fou `buildRev`). Pas de rewind : on remonte au fichier, pas à
 * un instantané.
 *
 * Module PUR (aucune rune) — testable sous bun ; le wrapper réactif vit dans
 * `src/stores/pinned-history.svelte.ts` (même schéma que nav-history).
 */

import {
  createNavStack,
  navStackBack,
  navStackCanGoBack,
  navStackCanGoForward,
  navStackForwardStep,
  navStackPush,
  navStackPushForward,
  type NavStack,
} from "./nav-stack";

export interface PinnedHistory {
  canGoBack(format?: string | null): boolean;
  canGoForward(format?: string | null): boolean;
  /** Empile le contenu QUITTÉ (avant de monter le suivant) ; vide le forward. */
  push(format: string | null | undefined, path: string): void;
  /** Dépile le back → chemin à remonter, ou null. */
  back(format?: string | null): string | null;
  /** Avance d'un cran : dépile le forward et empile `current` sur le back
   *  (sans vider le reste du forward — navigation avant multi-crans). */
  forwardStep(format: string | null | undefined, current: string): string | null;
  /** Empile sur le forward — appelé après un retour arrière. */
  pushForward(format: string | null | undefined, path: string): void;
  /** Purge la pile d'un format (dé-épinglage, fermeture du slot). */
  purge(format?: string | null): boolean;
  /** Purge complète (restauration de session, changement de projet). */
  reset(): boolean;
  /** Nombre de piles vivantes (tests). */
  size(): number;
}

export function createPinnedHistory(): PinnedHistory {
  const stacks = new Map<string, NavStack>();
  const stackOf = (format: string | null | undefined, create: boolean): NavStack | null => {
    if (!format) return null;
    let s = stacks.get(format);
    if (!s && create) {
      s = createNavStack();
      stacks.set(format, s);
    }
    return s ?? null;
  };
  return {
    canGoBack(format) {
      const s = stackOf(format, false);
      return s ? navStackCanGoBack(s) : false;
    },
    canGoForward(format) {
      const s = stackOf(format, false);
      return s ? navStackCanGoForward(s) : false;
    },
    push(format, path) {
      const s = stackOf(format, true);
      if (s) navStackPush(s, path);
    },
    back(format) {
      const s = stackOf(format, false);
      return s ? navStackBack(s) : null;
    },
    forwardStep(format, current) {
      const s = stackOf(format, false);
      return s ? navStackForwardStep(s, current) : null;
    },
    pushForward(format, path) {
      const s = stackOf(format, false);
      if (s) navStackPushForward(s, path);
    },
    purge(format) {
      return format ? stacks.delete(format) : false;
    },
    reset() {
      const n = stacks.size;
      stacks.clear();
      return n > 0;
    },
    size() {
      return stacks.size;
    },
  };
}
