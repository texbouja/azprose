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
 *
 * `onExternal` (optional, phase 1.3 — ★C) — appelé APRÈS une mise à jour venue
 * d'une AUTRE fenêtre (événement `storage`, jamais émis chez l'écrivain lui-même :
 * c'est le comportement natif de localStorage, pas une boucle évitée à la main).
 * Nécessaire pour les stores dont le SETTER applique un effet de bord au DOM
 * (police, échelle…) : une écriture externe ne passe pas par `current = …`, donc
 * l'effet ne serait jamais rejoué sans ce hook.
 */
export function persistedState<T>(
  key: string,
  initial: T,
  normalize?: (v: T) => T,
  onExternal?: (v: T) => void,
) {
  let value = $state(normalize ? normalize(load(key, initial)) : load(key, initial));
  const norm = (v: T): T => (normalize ? normalize(v) : v);

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key !== key) return;          // autre clé
      if (e.newValue === null) return;    // suppression : garder la valeur courante
      try {
        value = norm(JSON.parse(e.newValue) as T);
        onExternal?.(value);
      } catch { /* JSON invalide : ignorer, ne jamais casser la fenêtre */ }
    });
  }

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
 *
 * `onExternal` (phase 1.3) : même rôle que pour `persistedState`. La clé étant
 * résolue paresseusement (`scopedKey`), le listener la recalcule à CHAQUE
 * événement plutôt qu'à l'init — le scope peut avoir changé entre-temps.
 */
export function persistedScopedState<T>(key: string, initial: T, onExternal?: (v: T) => void) {
  let value = $state(load(scopedKey(key), initial));

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key !== scopedKey(key)) return;
      if (e.newValue === null) return;
      try {
        value = JSON.parse(e.newValue) as T;
        onExternal?.(value);
      } catch { /* JSON invalide : ignorer */ }
    });
  }

  return {
    get current() { return value; },
    set current(v: T) { value = v; save(scopedKey(key), v); },
    update(fn: (prev: T) => T) { value = fn(value); save(scopedKey(key), value); },
    reset() { value = initial; save(scopedKey(key), initial); },
  };
}
