#!/usr/bin/env node
/**
 * Fabrique l'archive distribuable du corpus de programmes.
 *
 *   bun run corpus            # construit corpus-dist/
 *   bun run corpus --check    # vérifie seulement, n'écrit rien
 *
 * Le corpus n'est PAS embarqué dans l'application (cf. `corpus/README.md`) :
 * il est publié à part, en pièce jointe de release GitHub. Ce script produit
 * les deux artefacts nécessaires :
 *
 *   corpus-dist/programmes-<version>.tar.gz   l'archive
 *   corpus-dist/manifeste.json                version, liste, EMPREINTES
 *
 * L'empreinte n'est pas décorative : l'application téléchargera ces fichiers
 * et les donnera pour référence pédagogique. Un contenu altéré ne planterait
 * rien — il fausserait silencieusement le travail de l'utilisateur.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(racine, "corpus");
const OUT = join(racine, "corpus-dist");
const CHECK = process.argv.includes("--check");

/** Version = date du jour + rang, à ajuster à la main pour une republication. */
function versionParDefaut() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function frontMatter(texte) {
  const lignes = texte.split(/\r?\n/);
  if (lignes[0]?.trim() !== "---") return {};
  const fin = lignes.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (fin < 0) return {};
  const champs = {};
  for (let i = 1; i < fin; i++) {
    const m = /^([A-Za-z_]+):\s*(.*)$/.exec(lignes[i]);
    if (!m) continue;
    const [, clef, brut] = m;
    if (brut.startsWith("[") && brut.endsWith("]")) {
      champs[clef] = brut.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (brut !== "") {
      champs[clef] = brut.replace(/^["']|["']$/g, "");
    } else {
      const items = [];
      let j = i + 1;
      while (j < fin && /^\s+-\s+/.test(lignes[j])) items.push(lignes[j].replace(/^\s*-\s+/, "").trim()), j++;
      champs[clef] = items;
      i = j - 1;
    }
  }
  return champs;
}

const fichiers = existsSync(SRC)
  ? readdirSync(SRC).filter((f) => f.toLowerCase().endsWith(".md") && f !== "README.md").sort()
  : [];

if (fichiers.length === 0) {
  console.error("[corpus] aucun programme dans corpus/ — rien à publier.");
  process.exit(CHECK ? 0 : 1);
}

// ── Vérification : chaque fichier passe par le vérificateur Rust ────────────
// Publier une transcription non conforme reviendrait à distribuer un
// référentiel faux — pire que pas de référentiel du tout.
let refus = 0;
const entrees = [];
for (const nom of fichiers) {
  const chemin = join(SRC, nom);
  const contenu = readFileSync(chemin);
  try {
    execFileSync(
      "cargo",
      ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--example", "programme_check", "--", chemin],
      { cwd: racine, stdio: "pipe" },
    );
  } catch {
    console.error(`[corpus] REFUSÉ — ${nom} porte une anomalie grave.`);
    console.error(`         détail : cargo run --example programme_check -- corpus/${nom}`);
    refus++;
    continue;
  }
  const fm = frontMatter(contenu.toString("utf8"));
  entrees.push({
    fichier: nom,
    id: fm.id ?? nom.replace(/\.md$/, ""),
    filiere: Array.isArray(fm.filiere) ? fm.filiere : [fm.filiere].filter(Boolean),
    matiere: fm.matiere ?? null,
    niveau: fm.niveau ?? null,
    source: fm.source ?? null,
    statut: fm.statut ?? "complet",
    couverture: Array.isArray(fm.couverture) ? fm.couverture : [],
    octets: contenu.length,
    sha256: createHash("sha256").update(contenu).digest("hex"),
  });
}

if (refus > 0) {
  console.error(`[corpus] ${refus} fichier(s) refusé(s) — archive NON produite.`);
  process.exit(1);
}
if (CHECK) {
  console.log(`[corpus] ${entrees.length} fichier(s) conformes.`);
  process.exit(0);
}

// ── Archive + manifeste ────────────────────────────────────────────────────
const version = process.env.CORPUS_VERSION || versionParDefaut();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const archive = `programmes-${version}.tar.gz`;
execFileSync("tar", ["-czf", join(OUT, archive), "-C", SRC, ...fichiers], { stdio: "inherit" });

const manifeste = {
  version,
  archive,
  archiveSha256: createHash("sha256").update(readFileSync(join(OUT, archive))).digest("hex"),
  programmes: entrees,
};
writeFileSync(join(OUT, "manifeste.json"), JSON.stringify(manifeste, null, 2) + "\n");

console.log(`[corpus] version ${version} — ${entrees.length} programme(s)`);
console.log(`[corpus] ${join("corpus-dist", archive)}`);
console.log(`[corpus] publier : gh release create corpus-v${version} corpus-dist/* --title "Programmes ${version}"`);
