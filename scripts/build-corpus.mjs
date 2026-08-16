#!/usr/bin/env node
/**
 * Synchro du corpus de programmes vers le bundle applicatif — scénario
 * EXPLICITE, jumeau de `bun run help` :
 *
 *   bun run corpus          # vérifie puis synchronise corpus/ → src/programmes/
 *   bun run corpus --check  # vérifie seulement, n'écrit rien
 *
 * La source de vérité est `corpus/` (les transcriptions préparées, avec leurs
 * PDF sources à côté, non versionnés). `src/programmes/**` en est le MIROIR
 * GÉNÉRÉ, embarqué dans l'exécutable — les programmes sont **livrés avec
 * l'application** (décision du 2026-08-16), il n'y a plus ni téléchargement ni
 * archive à publier.
 *
 * Chaque fichier passe par `programme_check` AVANT d'être copié : publier une
 * transcription non conforme reviendrait à distribuer un référentiel faux, ce
 * qui est pire que ne rien distribuer.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(racine, "corpus");
const DEST = join(racine, "src", "programmes");
const CHECK = process.argv.includes("--check");

if (!existsSync(SRC)) {
  console.error(`[corpus] introuvable : ${SRC} — rien à faire.`);
  process.exit(0);
}

const fichiers = readdirSync(SRC)
  .filter((f) => f.toLowerCase().endsWith(".md") && f !== "README.md")
  .sort();

if (fichiers.length === 0) {
  console.error("[corpus] aucun programme dans corpus/.");
  process.exit(CHECK ? 0 : 1);
}

// ── Vérification ───────────────────────────────────────────────────────────
let refus = 0;
for (const nom of fichiers) {
  try {
    execFileSync(
      "cargo",
      ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml",
       "--example", "programme_check", "--", join(SRC, nom)],
      { cwd: racine, stdio: "pipe" },
    );
  } catch {
    console.error(`[corpus] REFUSÉ — ${nom} porte une anomalie grave.`);
    console.error(`         détail : cargo run --quiet --manifest-path src-tauri/Cargo.toml \\`);
    console.error(`                    --example programme_check -- corpus/${nom}`);
    refus++;
  }
}

if (refus > 0) {
  console.error(`[corpus] ${refus} fichier(s) refusé(s) — synchro ANNULÉE.`);
  process.exit(1);
}
if (CHECK) {
  console.log(`[corpus] ${fichiers.length} fichier(s) conformes.`);
  process.exit(0);
}

// ── Synchro (miroir strict) ────────────────────────────────────────────────
mkdirSync(DEST, { recursive: true });
for (const nom of fichiers) {
  writeFileSync(join(DEST, nom), readFileSync(join(SRC, nom)));
}

// Purge des .md obsolètes du miroir — un programme retiré de corpus/ ne doit
// pas survivre dans le bundle.
const voulus = new Set(fichiers);
let purges = 0;
for (const nom of readdirSync(DEST).filter((f) => f.toLowerCase().endsWith(".md"))) {
  if (!voulus.has(nom)) {
    rmSync(join(DEST, nom), { force: true });
    purges++;
  }
}

console.log(`[corpus] ${fichiers.length} programme(s) → src/programmes/`);
if (purges) console.log(`[corpus] purge : ${purges} fichier(s) obsolète(s) retiré(s).`);
