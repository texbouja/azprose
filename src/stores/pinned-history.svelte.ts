/** Historique de montage du pinned slot — wrapper $state du module pur
 *  `@/lib/pinned-history` (les runes ne sont pas compilées par bun : la
 *  logique testable reste hors du .svelte.ts, même schéma que nav-history).
 *
 *  Piles PAR FORMAT (md, tex, …) : l'historique appartient au SLOT épinglé,
 *  pas au tab qui l'occupe. RUNTIME — jamais persisté (R10). */
import { createPinnedHistory } from "@/lib/pinned-history";

const slots = createPinnedHistory();
/** Version réactive GLOBALE — bump à chaque mutation (la réactivité de $state
 *  ne traverse pas la Map ; les consommateurs dérivent sur `revision`). */
let version = $state(0);

export function pinnedHistory(format: string | null | undefined) {
  return {
    get canGoBack() { return slots.canGoBack(format); },
    get canGoForward() { return slots.canGoForward(format); },
    get revision() { return version; },
  };
}

/** Empile le contenu QUITTÉ par le slot (appelé AVANT de monter le suivant). */
export function pinnedPush(format: string | null | undefined, path: string): void {
  slots.push(format, path);
  version++;
}

export function pinnedBack(format?: string | null): string | null {
  const next = slots.back(format);
  version++;
  return next;
}

export function pinnedForwardStep(format: string | null | undefined, current: string): string | null {
  const next = slots.forwardStep(format, current);
  version++;
  return next;
}

export function pinnedPushForward(format: string | null | undefined, path: string): void {
  slots.pushForward(format, path);
  version++;
}

/** Purge la pile d'un format — dé-épinglage, commutation, fermeture du slot. */
export function purgePinnedHistory(format?: string | null): void {
  if (slots.purge(format)) version++;
}

/** Purge complète — restauration de session / changement de projet. */
export function resetPinnedHistory(): void {
  if (slots.reset()) version++;
}

// ── Action callbacks (posées par app.svelte, lues par TabActions) ──────────

interface PinnedNavActions {
  goBack: (format: string) => void;
  goForward: (format: string) => void;
}

let _actions: PinnedNavActions = { goBack: () => {}, goForward: () => {} };

export function setPinnedNavActions(a: PinnedNavActions): void {
  _actions = a;
}

export function getPinnedNavActions(): PinnedNavActions {
  return _actions;
}
