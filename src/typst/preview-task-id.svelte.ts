/**
 * Preview registry — maps filePath → taskId for all active previews.
 * Each TypstPreview component registers itself on mount and unregisters on unmount.
 */

const _registry = new Map<string, string>();

export function registerPreview(filePath: string, taskId: string): void {
  _registry.set(filePath, taskId);
}

export function unregisterPreview(filePath: string): void {
  _registry.delete(filePath);
}

/** Get the taskId for a specific file's preview (or null). */
export function getPreviewTaskForFile(filePath: string): string | null {
  return _registry.get(filePath) ?? null;
}

/** Get any active taskId (fallback for backward compat). */
export function getPreviewTaskId(): string | null {
  return _registry.values().next().value ?? null;
}

/** Number of active previews. */
export function activePreviewCount(): number {
  return _registry.size;
}

/** Remove all entries and return them. Used to kill all previews before starting a new one. */
export function drainAllPreviews(): [string, string][] {
  const entries = [..._registry.entries()];
  _registry.clear();
  return entries;
}
