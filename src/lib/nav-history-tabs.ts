/** Pure per-tab registry for the preview navigation history (matrice cas 2).
 *  Kept OUT of the .svelte.ts store so it can be unit-tested under bun
 *  (Svelte runes are not compiled by bun). nav-history.svelte.ts wraps this
 *  module in $state.
 *
 *  Each preview tab owns an independent back/forward stack (browser-like) :
 *  two preview tabs side by side never share history. The stack of a tab dies
 *  with it (purge on close — case 3). */

import {
  createNavStack,
  navStackBack,
  navStackCanGoBack,
  navStackCanGoForward,
  navStackForward,
  navStackForwardStep,
  navStackPush,
  navStackPushForward,
  type NavStack,
} from "./nav-stack";

export interface NavHistoryTabs {
  /** Stack du tab, CRÉÉE si absente (le premier push/back d'un tab inconnu
   *  matérialise sa pile). `null` sans tabId — jamais de pile anonyme. */
  stackOf(tabId: string | null | undefined): NavStack | null;
  canGoBack(tabId?: string | null): boolean;
  canGoForward(tabId?: string | null): boolean;
  push(path: string, tabId?: string | null): void;
  back(tabId?: string | null): string | null;
  forward(tabId?: string | null): string | null;
  forwardStep(path: string, tabId?: string | null): string | null;
  pushForward(path: string, tabId?: string | null): void;
  /** Purge de la pile d'un tab (case 3) — true si une pile existait. */
  purge(tabId?: string | null): boolean;
  /** Purge complète — true si au moins une pile existait. */
  reset(): boolean;
  /** Nombre de piles vivantes (tests). */
  size(): number;
}

export function createNavHistoryTabs(): NavHistoryTabs {
  const stacks = new Map<string, NavStack>();
  return {
    stackOf(tabId) {
      if (!tabId) return null;
      let s = stacks.get(tabId);
      if (!s) {
        s = createNavStack();
        stacks.set(tabId, s);
      }
      return s;
    },
    canGoBack(tabId) {
      const s = tabId ? stacks.get(tabId) : undefined;
      return s ? navStackCanGoBack(s) : false;
    },
    canGoForward(tabId) {
      const s = tabId ? stacks.get(tabId) : undefined;
      return s ? navStackCanGoForward(s) : false;
    },
    push(path, tabId) {
      const s = this.stackOf(tabId);
      if (s) navStackPush(s, path);
    },
    back(tabId) {
      const s = tabId ? stacks.get(tabId) : undefined;
      return s ? navStackBack(s) : null;
    },
    forward(tabId) {
      const s = tabId ? stacks.get(tabId) : undefined;
      return s ? navStackForward(s) : null;
    },
    forwardStep(path, tabId) {
      const s = tabId ? stacks.get(tabId) : undefined;
      return s ? navStackForwardStep(s, path) : null;
    },
    pushForward(path, tabId) {
      const s = tabId ? stacks.get(tabId) : undefined;
      if (s) navStackPushForward(s, path);
    },
    purge(tabId) {
      return tabId ? stacks.delete(tabId) : false;
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
