/** Pure back/forward stack logic for the preview navigation history.
 *  Kept OUT of the .svelte.ts store so it can be unit-tested under bun
 *  (Svelte runes are not compiled by bun). nav-history.svelte.ts wraps this
 *  module in $state. */

export interface NavStack {
  back: string[];
  forward: string[];
  /** Monotonic revision — incremented on every mutation (for reactive UIs). */
  revision: number;
}

export function createNavStack(): NavStack {
  return { back: [], forward: [], revision: 0 };
}

export function navStackCanGoBack(s: NavStack): boolean {
  return s.back.length > 0;
}

export function navStackCanGoForward(s: NavStack): boolean {
  return s.forward.length > 0;
}

/** Push current path onto back stack, clear forward. Called BEFORE navigating.
 *  Browser-like semantics:
 *  - consecutive duplicates are skipped (clicking several headings in the same
 *    page must not grow the stack);
 *  - forward is ALWAYS cleared — a new navigation invalidates the redo list
 *    even when the push itself was deduplicated. */
export function navStackPush(s: NavStack, currentPath: string): void {
  if (s.back.length === 0 || s.back[s.back.length - 1] !== currentPath) {
    s.back = [...s.back, currentPath];
  }
  s.forward = [];
  s.revision++;
}

/** Pop back stack → returns the path or null. */
export function navStackBack(s: NavStack): string | null {
  if (s.back.length === 0) return null;
  const next = s.back[s.back.length - 1];
  s.back = s.back.slice(0, -1);
  s.revision++;
  return next;
}

/** Pop forward stack → returns the path or null. */
export function navStackForward(s: NavStack): string | null {
  if (s.forward.length === 0) return null;
  const next = s.forward[s.forward.length - 1];
  s.forward = s.forward.slice(0, -1);
  s.revision++;
  return next;
}

/** Step forward: pop the forward stack and push `currentPath` onto back —
 *  WITHOUT clearing the remaining forward entries. Used by the forward
 *  navigation flow: a plain navStackPush would wipe the redo list after the
 *  first step, breaking multi-step forward navigation. */
export function navStackForwardStep(s: NavStack, currentPath: string): string | null {
  if (s.forward.length === 0) return null;
  const next = s.forward[s.forward.length - 1];
  s.forward = s.forward.slice(0, -1);
  if (s.back.length === 0 || s.back[s.back.length - 1] !== currentPath) {
    s.back = [...s.back, currentPath];
  }
  s.revision++;
  return next;
}

/** Push onto forward stack — called after going back. */
export function navStackPushForward(s: NavStack, path: string): void {
  s.forward = [...s.forward, path];
  s.revision++;
}
