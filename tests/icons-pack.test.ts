import { expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Garde-fou contre la dérive du pack d'icônes généré (phase 2.3 de la
// refonte UI, vague 2 ; tree-shaking par usage RETIRÉ en vague 4 — pack
// complet désormais, cf. commentaire d'en-tête de scripts/build-icons.mjs).
// Module pur, lit les fichiers CSS/source, aucun DOM. Si une icône utilisée
// dans le code n'est plus émise (pack périmé, non régénéré après un ajout
// dans wxi-lucide.source.css), ce test doit rougir plutôt qu'un flash
// silencieux d'icône manquante au runtime (même principe que
// theme-catalog.test.ts §2.5).

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

test("la règle de base contient -webkit-mask-image et mask-image (via var(--wxi))", () => {
  expect(GENERATED).toContain("-webkit-mask-image: var(--wxi);");
  expect(GENERATED).toContain("mask-image: var(--wxi);");
});
