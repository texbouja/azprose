/**
 * Test du canal de propagation inter-fenêtres (phase 1.3, ★C) —
 * `persisted.svelte.ts` utilise `$state`, absent du runtime bun brut (les runes
 * sont une transformation du compilateur Svelte). Même méthode que
 * `overlay-core.test.ts` : compiler le module avec le compilateur Svelte et
 * l'exécuter tel quel — pas de `$derived`/`$effect` ici, donc pas besoin
 * d'`effect_root` : de simples lectures/écritures du getter `.current` suffisent.
 */
// @ts-nocheck
import { afterAll, expect, test } from "bun:test";
import { compileModule } from "svelte/compiler";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

const COMPILED = new URL("./.__persisted_compiled.mjs", import.meta.url).pathname;

function compilePersistedModule() {
  const source = readFileSync("src/stores/persisted.svelte.ts", "utf8");
  // Bun.Transpiler élimine les types ; le parseur Svelte ne reçoit que du JS standard.
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const { js } = compileModule(code, { filename: "persisted.svelte.ts", dev: false });
  writeFileSync(COMPILED, js.code);
}

compilePersistedModule();
const mod: any = await import(COMPILED);
const { persistedState, persistedScopedState } = mod;
rmSync(COMPILED, { force: true });

import { setSessionScope, scopedKey } from "../src/lib/session";

// Bun n'embarque ni localStorage ni window : polyfill minimal. `window` doit
// être un vrai EventTarget pour qu'addEventListener/dispatchEvent se comportent
// comme dans un navigateur (persisted.svelte.ts s'y abonne).
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
};
(globalThis as Record<string, unknown>).window = new EventTarget();

// Bun ne garantit PAS l'isolation de `globalThis` entre fichiers de test (deux
// fichiers peuvent partager le même thread/realm selon l'ordonnancement interne
// du runner) — constaté empiriquement : sans ce nettoyage, `window` fuyait vers
// `theme-catalog.test.ts` qui compte justement sur son ABSENCE. On restaure
// l'état natif de bun (ni window ni localStorage) une fois ce fichier terminé.
afterAll(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

// `StorageEvent` n'existe pas sous bun : un `Event` suffit, `persisted.svelte.ts`
// ne lit que `.key`/`.newValue`, pas les propriétés spécifiques à StorageEvent.
class FakeStorageEvent extends Event {
  constructor(public key: string | null, public newValue: string | null) {
    super("storage");
  }
}

function fireStorage(key: string | null, newValue: string | null): void {
  (window as unknown as EventTarget).dispatchEvent(new FakeStorageEvent(key, newValue));
}

// `localStorage` émet `storage` dans les AUTRES contextes de même origine,
// jamais chez l'écrivain : on simule donc l'événement explicitement (piège #4
// du plan) plutôt que de passer par un vrai `localStorage.setItem`.

test("un événement storage sur la bonne clé met à jour .current", () => {
  const s = persistedState<string>("t.a", "init");
  fireStorage("t.a", JSON.stringify("depuis-autre-fenetre"));
  expect(s.current).toBe("depuis-autre-fenetre");
});

test("une clé différente n'a aucun effet", () => {
  const s = persistedState<string>("t.b", "init");
  fireStorage("t.other-key", JSON.stringify("ignore-moi"));
  expect(s.current).toBe("init");
});

test("newValue null (suppression) laisse la valeur inchangée", () => {
  const s = persistedState<string>("t.c", "init");
  s.current = "modifie-localement";
  fireStorage("t.c", null);
  expect(s.current).toBe("modifie-localement");
});

test("un JSON invalide est ignoré sans lever", () => {
  const s = persistedState<string>("t.d", "init");
  expect(() => fireStorage("t.d", "{ceci n'est pas du JSON")).not.toThrow();
  expect(s.current).toBe("init");
});

test("onExternal est appelé une fois, avec la valeur normalisée", () => {
  const calls: number[] = [];
  const s = persistedState<number>("t.e", 0, (v: number) => v, (v: number) => calls.push(v));
  fireStorage("t.e", JSON.stringify(42));
  expect(calls).toEqual([42]);
  expect(s.current).toBe(42);
});

test("onExternal n'est PAS appelé lors d'une écriture locale (déjà joué par le setter)", () => {
  let calls = 0;
  const s = persistedState<string>("t.f", "init", undefined, () => { calls++; });
  s.current = "ecriture-locale";
  expect(calls).toBe(0);
  expect(s.current).toBe("ecriture-locale");
});

// CLES_PAR_FENETRE — les clés qui décrivent l'état d'UNE fenêtre ne doivent
// jamais être réécrites par une autre. Régression gardée : le boot d'une fenêtre
// sur le projet B remplaçait l'arborescence affichée par la fenêtre restée sur A
// (`mdview.folders`), et tout clic dans cet arbre écrivait ensuite des chemins
// étrangers dans la session, les brouillons et la base du coffre A.

import { STORAGE_KEYS, CLES_PAR_FENETRE } from "../src/lib/storage";

test("mdview.lastProject est déclarée par fenêtre", () => {
  expect(CLES_PAR_FENETRE.has(STORAGE_KEYS.lastProject)).toBe(true);
});

test("une clé par fenêtre IGNORE l'écriture d'une autre fenêtre", () => {
  const s = persistedState<string[]>(STORAGE_KEYS.lastProject, ["/coffre-a"]);
  fireStorage(STORAGE_KEYS.lastProject, JSON.stringify(["/coffre-b"]));
  expect(s.current).toEqual(["/coffre-a"]);
});

test("une clé par fenêtre ignore l'événement même avec onExternal", () => {
  let calls = 0;
  const s = persistedState<string[]>(STORAGE_KEYS.lastProject, ["/coffre-a"], undefined, () => { calls++; });
  fireStorage(STORAGE_KEYS.lastProject, JSON.stringify(["/coffre-b"]));
  expect(calls).toBe(0);
  expect(s.current).toEqual(["/coffre-a"]);
});

test("une clé par fenêtre reste persistée et relue normalement", () => {
  // Seule la RÉCEPTION est débranchée : l'écriture locale et la relecture au
  // démarrage suivant doivent continuer de fonctionner.
  const s = persistedState<string[]>(STORAGE_KEYS.lastProject, []);
  s.current = ["/coffre-a", "/invite"];
  const relu = persistedState<string[]>(STORAGE_KEYS.lastProject, []);
  expect(relu.current).toEqual(["/coffre-a", "/invite"]);
});

test("les clés NON déclarées gardent la propagation inter-fenêtres", () => {
  // Le garde-fou est ciblé, pas un retrait du listener : police, échelle et
  // consorts (onExternal, phase 1.3) doivent continuer de se propager.
  expect(CLES_PAR_FENETRE.has(STORAGE_KEYS.uiFontFamily)).toBe(false);
  const s = persistedState<string>(STORAGE_KEYS.uiFontFamily, "init");
  fireStorage(STORAGE_KEYS.uiFontFamily, JSON.stringify("depuis-autre-fenetre"));
  expect(s.current).toBe("depuis-autre-fenetre");
});

// persistedScopedState : la clé est résolue paresseusement (scopedKey), le
// listener doit donc suivre un changement de scope survenu APRÈS sa création.

test("persistedScopedState réagit sur la clé scopée courante", () => {
  setSessionScope("/vault-a");
  const s = persistedScopedState<string>("t.g", "init");
  fireStorage(scopedKey("t.g"), JSON.stringify("depuis-autre-fenetre"));
  expect(s.current).toBe("depuis-autre-fenetre");
  setSessionScope(null);
});

// F6 — la lecture INITIALE n'était pas paresseuse, contrairement à ce que
// promettait le docstring : elle avait lieu une fois, à l'import du module.
// D'où deux fuites entre coffres, gardées ci-dessous.

test("persistedScopedState relit quand le scope change sous lui", () => {
  setSessionScope("/vault-a");
  localStorage.setItem(scopedKey("t.i"), JSON.stringify("valeur-de-a"));
  const s = persistedScopedState<string>("t.i", "defaut");
  expect(s.current).toBe("valeur-de-a");

  setSessionScope("/vault-b");
  // Rien de stocké pour B : c'est le DÉFAUT qu'on doit voir, jamais la valeur de A.
  expect(s.current).toBe("defaut");
  setSessionScope(null);
});

test("persistedScopedState n'écrit pas la valeur d'un coffre dans la clé d'un autre", () => {
  // Le défaut exact : la valeur restait en mémoire au changement de coffre et
  // partait dans la clé du nouveau à la première modification.
  setSessionScope("/vault-a");
  localStorage.setItem(scopedKey("t.j"), JSON.stringify(["favori-de-a"]));
  const s = persistedScopedState<string[]>("t.j", []);
  expect(s.current).toEqual(["favori-de-a"]);

  setSessionScope("/vault-b");
  s.update((prev) => [...prev, "favori-de-b"]);
  expect(JSON.parse(localStorage.getItem(scopedKey("t.j"))!)).toEqual(["favori-de-b"]);

  // Et le coffre A n'a pas bougé.
  setSessionScope("/vault-a");
  expect(JSON.parse(localStorage.getItem(scopedKey("t.j"))!)).toEqual(["favori-de-a"]);
  setSessionScope(null);
});

test("persistedScopedState : onExternal suit aussi un changement de scope", () => {
  setSessionScope(null);
  const calls: string[] = [];
  const s = persistedScopedState<string>("t.h", "init", (v: string) => calls.push(v));
  setSessionScope("/vault-b");
  fireStorage(scopedKey("t.h"), JSON.stringify("nouveau-scope"));
  expect(calls).toEqual(["nouveau-scope"]);
  expect(s.current).toBe("nouveau-scope");
  setSessionScope(null);
});
