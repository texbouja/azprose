/** Shared reactive activePath — set by app.svelte, read by opencode panel. */

let _activePath: string | null = $state(null);

export function getActivePath(): string | null {
  return _activePath;
}

export function setActivePath(p: string | null): void {
  _activePath = p;
}
