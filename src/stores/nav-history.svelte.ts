/** Wikilink navigation history — back/forward stacks for the preview panel. */

let _back: string[] = $state([]);
let _forward: string[] = $state([]);
let _revision = $state(0);

export function navHistory() {
  return {
    get canGoBack() { return _back.length > 0; },
    get canGoForward() { return _forward.length > 0; },
    get revision() { return _revision; },
  };
}

/** Push current path onto back stack, clear forward. Called before navigating. */
export function navPush(currentPath: string): void {
  _back = [..._back, currentPath];
  _forward = [];
  _revision++;
}

/** Pop back stack → returns the path or null. */
export function navBack(): string | null {
  if (_back.length === 0) return null;
  const next = _back[_back.length - 1];
  _back = _back.slice(0, -1);
  _revision++;
  return next;
}

/** Pop forward stack → returns the path or null. */
export function navForward(): string | null {
  if (_forward.length === 0) return null;
  const next = _forward[_forward.length - 1];
  _forward = _forward.slice(0, -1);
  _revision++;
  return next;
}

/** Push onto forward stack — called after going back. */
export function navPushForward(path: string): void {
  _forward = [..._forward, path];
  _revision++;
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
