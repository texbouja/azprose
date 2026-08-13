import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_THEMES, THEME_GROUPS, readMode, getSystemTheme } from "../src/lib/theme";
import { STORAGE_KEYS } from "../src/lib/storage";

// Catalogue des thèmes — garde-fou contre la dérive entre BUILTIN_THEMES (la liste
// canonique) et THEME_GROUPS (ce que le menu affiche). Ajouté en phase 1.1 de la
// refonte UI (suppression des thèmes crafted, builtins seuls — R4).

test("BUILTIN_THEMES contient exactement 9 identifiants, ni mono ni mono-dark", () => {
  expect(BUILTIN_THEMES.length).toBe(9);
  expect(BUILTIN_THEMES).not.toContain("mono");
  expect(BUILTIN_THEMES).not.toContain("mono-dark");
});

test("tout thème de BUILTIN_THEMES apparaît dans un groupe du menu", () => {
  const choiceValues = new Set(THEME_GROUPS.flatMap((g) => g.choices.map((c) => c.value)));
  for (const id of BUILTIN_THEMES) {
    expect(choiceValues.has(id)).toBe(true);
  }
});

test("tout choix du menu (hors system) pointe vers un thème existant", () => {
  const builtinSet = new Set<string>(BUILTIN_THEMES);
  for (const group of THEME_GROUPS) {
    for (const choice of group.choices) {
      if (choice.value === "system") continue;
      expect(builtinSet.has(choice.value)).toBe(true);
    }
  }
});

test("THEME_GROUPS ne contient plus de groupe crafted", () => {
  expect(THEME_GROUPS.some((g) => g.label === "crafted")).toBe(false);
});

// Cycle de vie du thème (phase 1.2, R5) — défaut = suivre l'OS, jamais un
// crash en l'absence de `window`. `window` n'existe PAS par défaut sous bun :
// les deux premiers tests exploitent cet environnement brut à dessein (AVANT
// tout polyfill — bun exécute tout le code de top-level du fichier avant le
// premier callback de test, donc le polyfill ne peut être installé que DANS
// un callback, jamais entre deux `test()` au niveau du module).

test("sans window (bun brut), readMode() retombe sur system", () => {
  expect(typeof window).toBe("undefined");
  expect(readMode()).toBe("system");
});

test("sans window, getSystemTheme() ne lève pas et ne retourne jamais 'system'", () => {
  const resolved = getSystemTheme();
  expect(resolved).toBe("latte");
  expect(resolved).not.toBe("system");
});

test("localStorage vide → readMode() === system (polyfill installé ici)", () => {
  // Polyfill minimal — installé DANS le callback (cf. note ci-dessus), il
  // persiste pour les tests suivants du même fichier (mutation réelle de
  // globalThis, pas juste locale à ce callback).
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    },
  };
  expect(readMode()).toBe("system");
});

test("localStorage contient mocha → readMode() === mocha", () => {
  (window as unknown as { localStorage: Storage }).localStorage.setItem(STORAGE_KEYS.themeMode, "mocha");
  expect(readMode()).toBe("mocha");
});

// Bun ne garantit PAS l'isolation de `globalThis` entre fichiers de test (deux
// fichiers peuvent partager le même thread/realm selon l'ordonnancement interne
// du runner) — on restaure l'état natif de bun (pas de `window`) pour ne pas
// fuiter vers un fichier exécuté après celui-ci.
afterAll(() => {
  delete (globalThis as Record<string, unknown>).window;
});

// Fragment de boot (phase 2.5) — index.html ET nav.html peignent #boot avant
// tout JS, depuis une table BG générée par scripts/build-themes.mjs à partir
// de themes.json. C'est le test qui empêche la dérive : ajouter un thème sans
// régénérer le boot (`bun run themes`) devient une erreur rouge ici, pas un
// flash silencieux au démarrage d'une des deux fenêtres.
const ROOT = join(import.meta.dir, "..");

function extractBootBgKeys(htmlPath: string): Set<string> {
  const html = readFileSync(htmlPath, "utf8");
  const m = html.match(/var BG = \{([\s\S]*?)\};/);
  if (!m) throw new Error(`table BG introuvable dans ${htmlPath}`);
  const keys = new Set<string>();
  for (const line of m[1].split("\n")) {
    const bare = line.match(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/);
    const quoted = line.match(/^\s*'([^']+)'\s*:/);
    const key = bare?.[1] ?? quoted?.[1];
    if (key) keys.add(key);
  }
  return keys;
}

for (const html of ["index.html", "nav.html"]) {
  test(`chaque identifiant de BUILTIN_THEMES a une entrée dans la table BG générée de ${html}`, () => {
    const keys = extractBootBgKeys(join(ROOT, html));
    for (const id of BUILTIN_THEMES) {
      expect(keys.has(id)).toBe(true);
    }
  });
}
