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

/**
 * Persisted state (global UI prefs — unscoped key).
 *
 * `normalize` (optional) migrates legacy persisted shapes: it runs on the
 * initial load AND on every set/update, so a store whose model gained new
 * fields never exposes `undefined` for them (e.g. `collesSettings.vacances`
 * added after an older shape was already persisted in localStorage / config).
 * It must be idempotent and preserve unknown/extra fields.
 */
export function persistedState<T>(key: string, initial: T, normalize?: (v: T) => T) {
  let value = $state(normalize ? normalize(load(key, initial)) : load(key, initial));
  const norm = (v: T): T => (normalize ? normalize(v) : v);

  return {
    get current() { return value; },
    set current(v: T) { value = norm(v); save(key, value); },
    update(fn: (prev: T) => T) { value = norm(fn(value)); save(key, value); },
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
