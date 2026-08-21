/**
 * Tests du store de curation des fournisseurs (sélecteur de modèles) —
 * opt-in : la liste porte les ids EXPLICITEMENT cochés, toggle ajoute/retire,
 * tout passe par localStorage (préférence globale). Même méthode que
 * `persisted-cross-window.test.ts` : compiler le module avec le compilateur
 * Svelte ($state absent du runtime bun brut) et polyfiller localStorage/window.
 */
// @ts-nocheck
import { expect, test } from "bun:test";
import { compileModule } from "svelte/compiler";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

// Polyfill minimal AVANT l'import : persisted.svelte.ts lit localStorage et
// s'abonne à window dès l'évaluation du module.
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
};
(globalThis as Record<string, unknown>).window = new EventTarget();

const COMPILED = new URL("./.__fournisseurs_compiled.mjs", import.meta.url).pathname;

const source = readFileSync("src/stores/fournisseurs-selection.svelte.ts", "utf8");
const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
// persisted.svelte.ts utilise $state : lui aussi doit être COMPILÉ (le
// relier au brut donnerait rune_outside_svelte). Son propre import
// (« @/lib/session ») se résout via le tsconfig racine, comme dans
// `persisted-cross-window.test.ts`.
const PERSISTE = new URL("./.__persisted_fourn_compiled.mjs", import.meta.url).pathname;
const srcPersiste = readFileSync("src/stores/persisted.svelte.ts", "utf8");
const jsPersiste = compileModule(
  new Bun.Transpiler({ loader: "ts" }).transformSync(srcPersiste),
  { filename: "persisted.svelte.ts", dev: false },
);
writeFileSync(PERSISTE, jsPersiste.js.code);
// L'import relatif "./persisted.svelte" ne survit pas au déplacement du
// fichier compilé dans tests/ : réécrit vers sa version compilée.
const reecrit = code.replace(
  /from "\.\/persisted\.svelte"/,
  `from "${PERSISTE}"`,
);
const { js } = compileModule(reecrit, {
  filename: "fournisseurs-selection.svelte.ts",
  dev: false,
});
writeFileSync(COMPILED, js.code);
const { fournisseursSelection } = await import(COMPILED);
rmSync(COMPILED, { force: true });
rmSync(PERSISTE, { force: true });

test("défaut : aucun fournisseur coché (opt-in assumé)", () => {
  store.clear();
  expect(fournisseursSelection.current).toEqual([]);
});

test("toggle coche puis décoche ; l'ordre d'arrivée est conservé", () => {
  fournisseursSelection.current = [];
  fournisseursSelection.toggle("opencode");
  fournisseursSelection.toggle("google");
  expect(fournisseursSelection.current).toEqual(["opencode", "google"]);
  fournisseursSelection.toggle("opencode");
  expect(fournisseursSelection.current).toEqual(["google"]);
  // Décocher un absent ne casse rien.
  fournisseursSelection.toggle("opencode");
  expect(fournisseursSelection.current).toEqual(["google", "opencode"]);
});

test("persistance : la valeur survit à une réévaluation du module", () => {
  fournisseursSelection.current = ["anthropic"];
  // Le Map localStorage porte la vérité — une nouvelle lecture du même store
  // (nouvelle fenêtre dans la vraie app) retrouve la liste.
  const brut = JSON.parse(store.get("mdview.agent.fournisseurs")!);
  expect(brut).toEqual(["anthropic"]);
});
