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
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(racine, "corpus");
const DEST = join(racine, "src", "programmes");
const CATALOGUE = join(DEST, "catalog-data.ts");
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

  // Un programme livré est MONOLITHIQUE. Il est lu depuis le dépôt applicatif
  // ($APPDATA/programmes/), hors du vault : la couche qui résout les wikilinks
  // et les transclusions n'y opère pas. Un `[[…]]` y resterait donc affiché
  // tel quel — ou pire, une transclusion rendrait le document incomplet en
  // silence. (Les transclusions légitimes vivent dans l'archive OCR
  // `corpus/sources/`, document de travail jamais livré.)
  const contenu = readFileSync(join(SRC, nom), "utf8");
  if (contenu.includes("[[")) {
    const ligne = contenu.split("\n").findIndex((l) => l.includes("[[")) + 1;
    console.error(`[corpus] REFUSÉ — ${nom}:${ligne} contient un wikilink ou une transclusion.`);
    console.error("         Un programme livré doit être monolithique : il est lu hors du vault.");
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

// ── Catalogue (métadonnées SEULES) ─────────────────────────────────────────
// Jumeau de `catalog-data.ts` de l'aide. Il alimente la complétion `programme:`
// de la barre d'adresse NAV et le filtrage par critères : matière, filière,
// niveau. Le CONTENU des programmes n'y entre JAMAIS — sinon ce module, chargé
// au démarrage, redeviendrait le corpus entier (2,7 Mo à trente programmes),
// alors que les métadonnées tiennent en quelques kilo-octets.

/** Valeur d'un champ de front matter : scalaire, liste en ligne ou en bloc. */
function champ(frontMatter, clef) {
  const lignes = frontMatter.split("\n");
  const i = lignes.findIndex((l) => l.startsWith(`${clef}:`));
  if (i < 0) return null;
  const brut = lignes[i].slice(clef.length + 1).trim();
  if (brut.startsWith("[")) {
    return brut.slice(1, brut.lastIndexOf("]")).split(",").map((v) => nettoie(v)).filter(Boolean);
  }
  if (brut) return nettoie(brut);
  // Liste en bloc : les « - valeur » qui suivent, tant qu'ils sont indentés.
  const bloc = [];
  for (let j = i + 1; j < lignes.length && /^\s*-\s/.test(lignes[j]); j++) {
    bloc.push(nettoie(lignes[j].replace(/^\s*-\s/, "")));
  }
  return bloc.length ? bloc : null;
}

function nettoie(v) {
  return v.trim().replace(/^["']|["']$/g, "").trim();
}

const entrees = [];
for (const nom of fichiers) {
  const contenu = readFileSync(join(SRC, nom), "utf8");
  const fin = contenu.indexOf("\n---", 4);
  const frontMatter = contenu.startsWith("---") && fin > 0 ? contenu.slice(4, fin) : "";
  const titre = (contenu.match(/^#\s+(.+)$/m)?.[1] ?? nom.replace(/\.md$/, "")).trim();
  const filiere = champ(frontMatter, "filiere");
  const niveau = champ(frontMatter, "niveau");

  const entree = {
    fichier: nom,
    id: champ(frontMatter, "id") ?? nom.replace(/\.md$/, ""),
    titre,
    matiere: champ(frontMatter, "matiere") ?? "",
    filiere: Array.isArray(filiere) ? filiere : filiere ? [filiere] : [],
    // `niveau` ABSENT est signifiant : le programme vaut pour toutes les années
    // (sciences industrielles, informatique). On ne comble donc pas ce trou.
    ...(niveau ? { niveau: Number(niveau) } : {}),
  };
  if (!entree.matiere || entree.filiere.length === 0) {
    console.error(`[corpus] REFUSÉ — ${nom} : front matter incomplet (matiere/filiere).`);
    process.exit(1);
  }
  entrees.push(entree);
}

// Version = hash du contenu livré. Le dépôt applicatif ($APPDATA/programmes/)
// la compare à son stamp : même contenu → aucune réécriture au démarrage.
const digest = createHash("sha256");
for (const nom of fichiers) digest.update(nom).update(readFileSync(join(SRC, nom)));
const CORPUS_VERSION = digest.digest("hex").slice(0, 12);

writeFileSync(CATALOGUE, [
  "// GÉNÉRÉ AUTOMATIQUEMENT par scripts/build-corpus.mjs — ne pas éditer à la main.",
  "// La source de vérité est corpus/ ; ce fichier est régénéré via `bun run corpus`.",
  "//",
  "// MÉTADONNÉES SEULES — jamais le contenu des programmes (cf. le plan",
  "// ../agents/azprose/programmes-nav-plan.md, invariant 2).",
  "",
  `export const CORPUS_VERSION = ${JSON.stringify(CORPUS_VERSION)};`,
  "",
  "export const catalogue = [",
  ...entrees.map((e) => `  ${JSON.stringify(e)},`),
  "];",
  "",
].join("\n"));

console.log(`[corpus] ${fichiers.length} programme(s) → src/programmes/`);
if (purges) console.log(`[corpus] purge : ${purges} fichier(s) obsolète(s) retiré(s).`);
console.log(`[corpus] catalogue : ${entrees.length} entrée(s) ; version ${CORPUS_VERSION}.`);
