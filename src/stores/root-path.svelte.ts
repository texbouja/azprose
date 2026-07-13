/** Shared reactive rootPath — set by app.svelte, read by preview components. */

let _rootPath: string | null = $state(null);

export function getRootPath(): string | null {
  return _rootPath;
}

export function setRootPath(p: string | null): void {
  _rootPath = p;
}
