/** Wikilink navigation history — back/forward stacks for the preview panel.
 *  Thin $state wrapper over the pure logic in @/lib/nav-history-tabs
 *  (unit-tested under bun — Svelte runes are not compiled by bun).
 *
 *  Since the matrix fix (case 2), the history is PER PREVIEW TAB (clé =
 *  tabId du side panel) : deux onglets de preview ouverts côte à côte ne
 *  partagent plus la même pile — chaque onglet a son propre back/forward,
 *  comme un navigateur. La pile d'un onglet meurt avec lui (purge à la
 *  fermeture, case 3). L'API accepte `tabId` en option : sans tabId, les
 *  opérations sont des no-op sûrs (aucune pile à toucher). */
import { createNavHistoryTabs } from "@/lib/nav-history-tabs";

const tabs = createNavHistoryTabs();
/** Version réactive GLOBALE — bump à chaque mutation d'une pile (la
 *  réactivité de $state ne traverse pas le Map ; les consommateurs dérivent
 *  sur `revision`). */
let version = $state(0);

export function navHistory(tabId: string | null | undefined) {
  return {
    get canGoBack() { return tabs.canGoBack(tabId); },
    get canGoForward() { return tabs.canGoForward(tabId); },
    get revision() { return version; },
  };
}

/** Push current path onto the tab's back stack, clear its forward. Called
 *  before navigating. No-op sans tabId (aucune pile à taguer). */
export function navPush(currentPath: string, tabId?: string | null): void {
  if (!tabId) return;
  tabs.push(currentPath, tabId);
  version++;
}

/** Pop the tab's back stack → returns the path or null. */
export function navBack(tabId?: string | null): string | null {
  if (!tabId) return null;
  const next = tabs.back(tabId);
  version++;
  return next;
}

/** Pop the tab's forward stack → returns the path or null. */
export function navForward(tabId?: string | null): string | null {
  if (!tabId) return null;
  const next = tabs.forward(tabId);
  version++;
  return next;
}

/** Step forward: pop forward + push `currentPath` onto the tab's back,
 *  preserving the remaining forward entries (multi-step forward navigation).
 *  Used by the app's forward flow — a plain navPush would clear the redo
 *  list. */
export function navForwardStep(currentPath: string, tabId?: string | null): string | null {
  if (!tabId) return null;
  const next = tabs.forwardStep(currentPath, tabId);
  version++;
  return next;
}

/** Push onto the tab's forward stack — called after going back. */
export function navPushForward(path: string, tabId?: string | null): void {
  if (!tabId) return;
  tabs.pushForward(path, tabId);
  version++;
}

/** Purge the tab's stack — appelé à la fermeture de l'onglet (case 3 : la
 *  pile d'un onglet meurt avec lui). No-op si aucune pile n'existe. */
export function purgeNavHistory(tabId: string | null | undefined): void {
  if (tabs.purge(tabId)) version++;
}

/** Purge complète (toutes les piles) — ex. restauration de session. */
export function resetNavHistory(): void {
  if (tabs.reset()) version++;
}

// ── Action callbacks (set by app.svelte) ────────────────────────

interface NavActions {
  goBack: () => void;
  goForward: () => void;
}

let _actions: NavActions = { goBack: () => {}, goForward: () => {} };

export function setNavActions(a: NavActions): void {
  _actions = a;
}

export function getNavActions(): NavActions {
  return _actions;
}
