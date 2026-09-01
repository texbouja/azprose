/**
 * L'autorité du coffre — `src/lib/vault.svelte.ts`.
 *
 * Ce qui est vérifié ici est la garantie CENTRALE du cloisonnement :
 * **la racine est immuable pendant la vie d'une fenêtre**. C'est elle qui rend
 * les anciens défauts impossibles au lieu de les ordonner — une valeur qui ne
 * change pas n'a pas de course à arbitrer.
 *
 * Même méthode que `persisted-cross-window.test.ts` : le module utilise `$state`,
 * absent du runtime bun brut, on le compile avec le compilateur Svelte et on
 * l'exécute tel quel. C'est pour rester compilable ainsi que le module reçoit
 * son signalement par injection au lieu d'importer le store Diagnostics.
 */
// @ts-nocheck
import { afterAll, beforeEach, expect, test } from "bun:test";
import { compileModule } from "svelte/compiler";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

afterAll(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});

const COMPILED = new URL("./.__vault_compiled.mjs", import.meta.url).pathname;
{
  const source = readFileSync("src/lib/vault.svelte.ts", "utf8");
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const { js } = compileModule(code, { filename: "vault.svelte.ts", dev: false });
  writeFileSync(COMPILED, js.code);
}
const vault: any = await import(COMPILED);
rmSync(COMPILED, { force: true });

const refus: string[] = [];
vault.brancherSignalementCoffre((m: string) => refus.push(m));

beforeEach(() => {
  vault.fermerCoffre();
  store.clear();
  refus.length = 0;
});

// ── L'invariant d'immuabilité ──────────────────────────────────────────────

test("ouvrir un coffre pose la racine", () => {
  vault.ouvrirCoffre("/coffres/MP2");
  expect(vault.racine()).toBe("/coffres/MP2");
});

test("une SECONDE racine est REFUSÉE et signalée", () => {
  // Le cœur du cloisonnement : une fenêtre ouverte sur un projet n'en change
  // jamais. Un autre projet ouvre une autre fenêtre.
  vault.ouvrirCoffre("/coffres/MP2");
  vault.ouvrirCoffre("/coffres/PC1");
  expect(vault.racine()).toBe("/coffres/MP2");
  expect(refus).toHaveLength(1);
  expect(refus[0]).toContain("/coffres/PC1");
});

test("rouvrir LA MÊME racine est sans effet et sans reproche", () => {
  // Le démarrage peut appeler plusieurs fois : ce n'est pas une anomalie.
  vault.ouvrirCoffre("/coffres/MP2");
  vault.ouvrirCoffre("/coffres/MP2");
  expect(vault.racine()).toBe("/coffres/MP2");
  expect(refus).toEqual([]);
});

test("fermer puis rouvrir sur un AUTRE projet est permis", () => {
  // `racine → null → autre racine` reste légal : c'est le retour à la porte de
  // projet, pas un glissement silencieux.
  vault.ouvrirCoffre("/coffres/MP2");
  vault.fermerCoffre();
  vault.ouvrirCoffre("/coffres/PC1");
  expect(vault.racine()).toBe("/coffres/PC1");
  expect(refus).toEqual([]);
});

// ── Le périmètre ───────────────────────────────────────────────────────────

test("sans projet ouvert, le périmètre est vide et n'autorise rien", () => {
  expect(vault.perimetre()).toEqual([]);
  expect(vault.appartientAuCoffre("/coffres/MP2/x.md")).toBe(false);
});

test("le périmètre place la racine EN PREMIER, les invités ensuite", () => {
  // L'ordre est celui de la sidebar : `isPrimary` est l'indice 0.
  vault.ouvrirCoffre("/coffres/MP2");
  vault.ajouterInvite("/ailleurs/Colles");
  expect(vault.perimetre()).toEqual(["/coffres/MP2", "/ailleurs/Colles"]);
});

test("un invité est du contenu légitime (arbitrage A)", () => {
  vault.ouvrirCoffre("/coffres/MP2");
  vault.ajouterInvite("/ailleurs/Colles");
  expect(vault.appartientAuCoffre("/ailleurs/Colles/planche.md")).toBe(true);
  expect(vault.appartientAuCoffre("/coffres/PC1/vole.md")).toBe(false);
});

test("sans projet ouvert, ajouter un dossier OUVRE le projet", () => {
  vault.ajouterInvite("/coffres/MP2");
  expect(vault.racine()).toBe("/coffres/MP2");
  expect(vault.invites()).toEqual([]);
});

test("retirer la RACINE ferme le projet au lieu de promouvoir un invité", () => {
  // La promotion re-scopait tout l'état de la fenêtre sans que rien ne le dise.
  vault.ouvrirCoffre("/coffres/MP2");
  vault.ajouterInvite("/ailleurs/Colles");
  vault.retirerDuPerimetre("/coffres/MP2");
  expect(vault.racine()).toBeNull();
  expect(vault.perimetre()).toEqual([]);
});

test("retirer un invité laisse le projet en place", () => {
  vault.ouvrirCoffre("/coffres/MP2");
  vault.ajouterInvite("/ailleurs/Colles");
  vault.retirerDuPerimetre("/ailleurs/Colles");
  expect(vault.racine()).toBe("/coffres/MP2");
  expect(vault.invites()).toEqual([]);
});

// ── Les invités sont scopés par coffre ─────────────────────────────────────

test("les invités d'un coffre ne suivent pas dans un autre", () => {
  // Ils sont persistés sous une clé SCOPÉE : c'est ce qui les empêche de
  // télescoper d'un projet à l'autre.
  vault.ouvrirCoffre("/coffres/MP2");
  vault.ajouterInvite("/ailleurs/Colles");
  vault.fermerCoffre();

  vault.ouvrirCoffre("/coffres/PC1");
  expect(vault.invites()).toEqual([]);

  vault.fermerCoffre();
  vault.ouvrirCoffre("/coffres/MP2");
  expect(vault.invites()).toEqual(["/ailleurs/Colles"]);
});

// ── Mémoire du dernier projet ──────────────────────────────────────────────

test("ouvrir un coffre le mémorise comme dernier projet", () => {
  vault.ouvrirCoffre("/coffres/MP2");
  expect(vault.dernierProjet()).toBe("/coffres/MP2");
});

test("`memoriser: false` (fenêtre NAV) ne touche PAS le dernier projet", () => {
  // NAV adopte une racine pour résoudre ses wikilinks ; elle n'ouvre pas le
  // projet, et ne doit pas décider de ce qui se rouvrira au démarrage suivant.
  vault.ouvrirCoffre("/coffres/MP2");
  vault.fermerCoffre();
  vault.ouvrirCoffre("/coffres/PC1", { memoriser: false });
  expect(vault.dernierProjet()).toBe("/coffres/MP2");
});
