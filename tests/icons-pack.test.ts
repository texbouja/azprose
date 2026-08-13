import { expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Garde-fou contre la dérive du pack d'icônes généré (phase 2.3 de la
// refonte UI, vague 2) — module pur, lit les fichiers CSS/source, aucun DOM.
// Miroir de scripts/build-icons.mjs : si une icône utilisée dans le code
// n'est plus émise (ou si un pack périmé traîne, non régénéré après un
// changement source), ce test doit rougir plutôt qu'un flash silencieux
// d'icône manquante au runtime (même principe que theme-catalog.test.ts §2.5).

const ROOT = join(import.meta.dir, "..");
const SRC_DIR = join(ROOT, "src");
const GENERATED = readFileSync(join(ROOT, "src/styles/wxi-lucide.css"), "utf8");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (extname(p) === ".ts" || extname(p) === ".svelte") files.push(p);
  }
  return files;
}

const files = walk(SRC_DIR);

function scanUsedNames(): Set<string> {
  const used = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/wxi-[a-z0-9-]+/g)) used.add(m[0].slice(4));
  }
  return used;
}

function declaredNames(css: string): Set<string> {
  const declared = new Set<string>();
  for (const m of css.matchAll(/^\.wxi-([a-z0-9-]+)\s*\{/gm)) declared.add(m[1]);
  return declared;
}

test("toute classe wxi-* littérale trouvée dans src/** a une déclaration dans le pack généré", () => {
  const used = scanUsedNames();
  const declared = declaredNames(GENERATED);
  const missing = [...used].filter((n) => !declared.has(n));
  expect(missing).toEqual([]);
});

test("le pack généré ne contient aucune icône non utilisée", () => {
  const used = scanUsedNames();
  const declared = declaredNames(GENERATED);
  // Les utilitaires (wxi-empty, wxi-spin) ne sont pas des icônes tree-shakées
  // par usage (cf. KNOWN_UTILITIES du générateur) — exclus de cette vérification.
  const KNOWN_UTILITIES = new Set(["empty", "spin"]);
  const unused = [...declared].filter((n) => !used.has(n) && !KNOWN_UTILITIES.has(n));
  expect(unused).toEqual([]);
});

test("la règle de base contient -webkit-mask-image et mask-image (via var(--wxi))", () => {
  expect(GENERATED).toContain("-webkit-mask-image: var(--wxi);");
  expect(GENERATED).toContain("mask-image: var(--wxi);");
});

test("aucune source ne construit de classe wxi-* dynamiquement", () => {
  const offenders = files.filter((f) => {
    const text = readFileSync(f, "utf8");
    return /`wxi-\$\{|"wxi-"\s*\+|'wxi-'\s*\+/.test(text);
  });
  expect(offenders).toEqual([]);
});
