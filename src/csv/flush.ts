/**
 * Global registry for pending CSV cache writes.
 * On app close, `flushAll()` is called before `win_.destroy()` to ensure
 * all Tauri IPC write calls complete before the webview is torn down.
 */

type FlushFn = () => Promise<void>;

const pending = new Map<string, FlushFn>();

export function registerCsvFlush(filePath: string, fn: FlushFn): void {
  pending.set(filePath, fn);
}

export function unregisterCsvFlush(filePath: string): void {
  pending.delete(filePath);
}

/** Flush all pending CSV cache writes. Called before app close. */
export async function flushAllCsvCaches(): Promise<void> {
  const fns = [...pending.values()];
  pending.clear();
  await Promise.allSettled(fns.map((fn) => fn()));
}
