import { scopedKey } from "@/lib/session";
import { CLES_PAR_FENETRE } from "@/lib/storage";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Filet de durabilité, branché au boot (`preferences-miroir-store`). Injecté
 *  plutôt qu'importé : ce module est chargé par des tests qui n'ont ni Tauri
 *  ni disque, et il ne doit rien savoir de l'un ni de l'autre. */
let apresEcriture: (() => void) | null = null;
export function brancherMiroirPreferences(hook: () => void): void {
  apresEcriture = hook;
}

/** Un relecteur par clé de préférence globale — voir `relirePreferences`. */
const relecteurs = new Map<string, () => void>();

/** Relit ces clés depuis le stockage. Appelé APRÈS la restauration du miroir,
 *  pour les stores déjà construits avec la valeur par défaut. */
export function relirePreferences(cles: readonly string[]): void {
  for (const k of cles) relecteurs.get(k)?.();
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    // Point d'écriture UNIQUE de toutes les préférences globales : c'est ici,
    // et nulle part ailleurs, qu'on sait qu'il y a quelque chose à recopier.
    apresEcriture?.();
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
 *
 * ⚠️ Cette propagation est une PRÉFÉRENCE GLOBALE qui se propage : elle n'a de
 * sens que pour ce qui doit être identique dans toutes les fenêtres. Une clé qui
 * décrit l'état d'UNE fenêtre doit être déclarée dans `CLES_PAR_FENETRE`
 * (`lib/storage.ts`), qui débranche le listener pour elle — voir là-bas le défaut
 * que ça corrige.
 */
export function persistedState<T>(
  key: string,
  initial: T,
  normalize?: (v: T) => T,
  onExternal?: (v: T) => void,
) {
  let value = $state(normalize ? normalize(load(key, initial)) : load(key, initial));
  const norm = (v: T): T => (normalize ? normalize(v) : v);

  // Relecture après restauration du miroir. Les stores se construisent à
  // l'IMPORT du module, donc avant que le miroir (lecture disque, asynchrone)
  // n'ait pu remettre une clé manquante : sans ce chemin, une préférence
  // restaurée ne serait vue qu'au lancement suivant. On réemprunte la voie
  // déjà prévue pour une écriture venue d'une autre fenêtre — `onExternal`
  // compris, sans quoi les effets de bord (police, échelle) ne seraient pas
  // rejoués.
  relecteurs.set(key, () => {
    value = norm(load(key, initial));
    onExternal?.(value);
  });

  if (typeof window !== "undefined" && !CLES_PAR_FENETRE.has(key)) {
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
 *
 * Pas de `CLES_PAR_FENETRE` ici, et ce n'est pas un oubli : la clé porte déjà la
 * racine, or deux fenêtres de PROJET ne peuvent pas partager un coffre
 * (`find_project_window` renvoie sur la fenêtre existante) et NAV ne construit
 * aucun état scopé. Une clé scopée est donc de fait par fenêtre. Si l'une des
 * deux prémisses tombe, il faudra le même garde-fou qu'au-dessus.
 */
export function persistedScopedState<T>(key: string, initial: T, onExternal?: (v: T) => void) {
  // Le scope au moment de la LECTURE initiale, retenu pour le comparer plus
  // tard. Le docstring promettait une clé « résolue paresseusement à chaque
  // accès » : c'était vrai des écritures, faux de cette lecture-ci, qui n'a
  // lieu qu'une fois — à l'import du module, donc éventuellement avant que le
  // coffre soit ouvert. Deux conséquences, toutes deux corrigées par la
  // relecture ci-dessous : la valeur pouvait être lue sous un scope VIDE, et
  // celle d'un coffre pouvait être réécrite dans la clé d'un autre.
  let scopeLu = scopedKey(key);
  let value = $state(load(scopeLu, initial));

  /** Relit si le scope a changé depuis la dernière lecture. */
  function reliresiScopeChange(): void {
    const actuel = scopedKey(key);
    if (actuel === scopeLu) return;
    scopeLu = actuel;
    value = load(actuel, initial);
    onExternal?.(value);
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key !== scopedKey(key)) return;
      if (e.newValue === null) return;
      try {
        value = JSON.parse(e.newValue) as T;
        // L'événement porte la valeur FAISANT FOI pour la clé scopée courante :
        // le store est désormais à jour SUR CE SCOPE. Sans cette ligne, la
        // relecture du prochain accès verrait un scope encore « ancien » et
        // rechargerait depuis le stockage — écrasant la valeur qu'on vient de
        // recevoir par le défaut.
        scopeLu = e.key;
        onExternal?.(value);
      } catch { /* JSON invalide : ignorer */ }
    });
  }

  // La relecture est déclenchée par l'ACCÈS, pas par un abonnement au coffre :
  // ce module ne doit rien savoir de `vault.svelte.ts` (il est compilé seul en
  // test). Tout accès passe par l'un de ces quatre points — un scope changé ne
  // peut donc jamais être vu par un lecteur, ni écrasé par un écrivain.
  return {
    get current() { reliresiScopeChange(); return value; },
    set current(v: T) { reliresiScopeChange(); value = v; save(scopedKey(key), v); },
    update(fn: (prev: T) => T) { reliresiScopeChange(); value = fn(value); save(scopedKey(key), value); },
    reset() { reliresiScopeChange(); value = initial; save(scopedKey(key), initial); },
  };
}
