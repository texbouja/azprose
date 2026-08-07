/** Shared reactive activePath — set by app.svelte, consumed by the workspace
    view and file-operations move detection. */

let _activePath: string | null = $state(null);

export function getActivePath(): string | null {
  return _activePath;
}

export function setActivePath(p: string | null): void {
  _activePath = p;
}
