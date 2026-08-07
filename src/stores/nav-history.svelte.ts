/** Wikilink navigation history — back/forward stacks for the preview panel.
 *  Thin $state wrapper over the pure logic in @/lib/nav-stack (unit-tested
 *  under bun — Svelte runes are not compiled by bun). */

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
} from "@/lib/nav-stack";

let _stack: NavStack = $state(createNavStack());

export function navHistory() {
  return {
    get canGoBack() { return navStackCanGoBack(_stack); },
    get canGoForward() { return navStackCanGoForward(_stack); },
    get revision() { return _stack.revision; },
  };
}

/** Push current path onto back stack, clear forward. Called before navigating. */
export function navPush(currentPath: string): void {
  navStackPush(_stack, currentPath);
}

/** Pop back stack → returns the path or null. */
export function navBack(): string | null {
  return navStackBack(_stack);
}

/** Pop forward stack → returns the path or null. */
export function navForward(): string | null {
  return navStackForward(_stack);
}

/** Step forward: pop forward + push `currentPath` onto back, preserving the
 *  remaining forward entries (multi-step forward navigation). Used by the
 *  app's forward flow — a plain navPush would clear the redo list. */
export function navForwardStep(currentPath: string): string | null {
  return navStackForwardStep(_stack, currentPath);
}

/** Push onto forward stack — called after going back. */
export function navPushForward(path: string): void {
  navStackPushForward(_stack, path);
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
