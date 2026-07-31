import { scopedKey } from "@/lib/session";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / serialization errors
  }
}

export function persistedState<T>(key: string, initial: T) {
  let value = $state(load(key, initial));

  return {
    get current() { return value; },
    set current(v: T) { value = v; save(key, v); },
    update(fn: (prev: T) => T) { value = fn(value); save(key, value); },
    reset() { value = initial; save(key, initial); },
  };
}

/**
 * Persisted state with a per-project scoped localStorage key (Obsidian-style
 * vault isolation). The key is resolved lazily on every access — the project
 * scope is only known after boot, and may change when the user switches vaults
 * in the same window.
 *
 * Use for data that BELONGS to a vault (favorites, calendar, …). Prefer the
 * plain `persistedState` for global UI preferences (theme, language, fonts).
 */
export function persistedScopedState<T>(key: string, initial: T) {
  let value = $state(load(scopedKey(key), initial));

  return {
    get current() { return value; },
    set current(v: T) { value = v; save(scopedKey(key), v); },
    update(fn: (prev: T) => T) { value = fn(value); save(scopedKey(key), value); },
    reset() { value = initial; save(scopedKey(key), initial); },
  };
}
