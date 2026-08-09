#!/usr/bin/env node
/**
 * Synchro de la documentation utilisateur vers l'aide embarquée — scénario
 * EXPLICITE, lancé à la demande :
 *
 *   bun run help          # une passe (source → bundle + catalogue)
 *   bun run help --watch  # surveille docs/user/ et re-synchronise
 *   bun run doc           # alias de help
 *
 * La source de vérité de la doc est `docs/user/` (le guide écrit dans le
 * vault). À CHAQUE passe le script régénère intégralement :
 *
 *   - `src/help/md/**`            copie des .md de docs/user (structure
 *                                 préservée), APRES purge des fichiers
 *                                 obsolètes — le bundle (`import.meta.glob`
 *                                 de help-bundle.ts) embarque exactement
 *                                 cette arborescence dans l'exécutable ;
 *   - `src/help/catalog-data.ts`  manifeste GÉNÉRÉ : `HELP_VERSION` (hash du
 *                                 contenu — un edit de doc change la version,
 *                                 ce qui déclenche la réinstallation de
 *                                 `.azprose/help/` au démarrage) et
 *                                 `catalog` (titre = premier `# ` H1 de la
 *                                 page, repli nom de fichier).
 *
 * Ordre du catalogue (précédent/suivant du lecteur DocPreview) : `index.md`
 * en tête, puis tri alphabétique du chemin relatif. Les dossiers listés dans
 * EXCLUDE_FROM_CATALOG restent EMBARQUÉS (les wikilinks du guide y résolvent
 * dans le lecteur) mais n'ont pas de footer de navigation.
 *
 * Les scripts `build` / `dev` utilisent `src/help` TEL QU'IL EST (la doc est
 * commitée dans le repo) : lancer `bun run help` après chaque édition de
 * `docs/user/`, avant de builder ou de lancer l'app.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "docs", "user");
const DEST = join(root, "src", "help", "md");
const OUT = join(root, "src", "help", "catalog-data.ts");

/** Dossiers embarqués mais EXCLUS du catalogue (pas de footer prev/next). */
const EXCLUDE_FROM_CATALOG = new Set(["exemples"]);

/** Racine de la doc : sa TOC est toujours affichée dans la sidebar. */
const HELP_ROOT = "index.md";

function walk(dir, base, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    const rel = join(base, e.name);
    if (e.isDirectory()) walk(abs, rel, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(rel.replaceAll("\\", "/"));
  }
}

/** Retire le front matter YAML de tête (--- … ---) avant la recherche de titre. */
function stripFrontMatter(lines) {
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) return lines.slice(end + 1);
  }
  return lines;
}

/** Premier `# ` H1 hors fences et hors front matter ; repli nom de fichier. */
function extractTitle(content, fallback) {
  let inFence = false;
  for (const line of stripFrontMatter(content.split(/\r?\n/))) {
    const t = line.trim();
    if (t.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^#\s+/.test(t)) return t.replace(/^#\s+/, "").trim();
  }
  return fallback;
}

function humanName(rel) {
  const base = rel.replace(/\.md$/i, "").split("/").pop() ?? rel;
  return base.replace(/[-_]+/g, " ").trim() || base;
}

function sync() {
  if (!existsSync(SRC)) {
    console.error(`[sync-help] introuvable : ${SRC} — rien à faire.`);
    return;
  }

  const files = [];
  walk(SRC, "", files);
  files.sort();
  if (files.length === 0) {
    console.error("[sync-help] aucun .md dans docs/user/.");
    return;
  }

  // 1. Copie dans le bundle (mkdir -p) + collecte rel/contenu/titre.
  const entries = [];
  for (const rel of files) {
    const srcPath = join(SRC, ...rel.split("/"));
    const dstPath = join(DEST, ...rel.split("/"));
    mkdirSync(dirname(dstPath), { recursive: true });
    const content = readFileSync(srcPath, "utf8");
    writeFileSync(dstPath, content);
    entries.push({ rel, content, title: extractTitle(content, humanName(rel)) });
  }

  // 2. Purge des .md obsolètes du bundle (mirror strict de docs/user).
  const wanted = new Set(files);
  const stale = [];
  const existing = [];
  walk(DEST, "", existing);
  for (const rel of existing) {
    if (!wanted.has(rel)) stale.push(join(DEST, ...rel.split("/")));
  }
  for (const p of stale) {
    rmSync(p, { force: true });
  }

  // 3. Version = hash du contenu (même contenu → même version → aucune
  //    réinstallation ; un edit de doc change la version → réinstallation).
  const digest = createHash("sha256");
  for (const { rel, content } of entries) digest.update(`${rel}\0${content}\0`);
  const HELP_VERSION = digest.digest("hex").slice(0, 12);

  // 4. Catalogue : index.md en tête, puis tri alphabétique du relatif.
  const inCatalog = entries.filter((e) => !EXCLUDE_FROM_CATALOG.has(e.rel.split("/")[0]));
  inCatalog.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const iRoot = inCatalog.findIndex((e) => e.rel === HELP_ROOT);
  if (iRoot > 0) {
    const [rootEntry] = inCatalog.splice(iRoot, 1);
    inCatalog.unshift(rootEntry);
  }

  const catLines = inCatalog.map(
    (e) => `  { path: ${JSON.stringify(e.rel)}, title: ${JSON.stringify(e.title)} },`,
  );
  const out = [
    "// GÉNÉRÉ AUTOMATIQUEMENT par scripts/sync-help.mjs — ne pas éditer à la main.",
    "// La source de vérité est docs/user/ ; ce fichier est régénéré via",
    "// `bun run help` (scénario explicite) après chaque édition de la doc.",
    "",
    `export const HELP_VERSION = ${JSON.stringify(HELP_VERSION)};`,
    "",
    "export const catalog = [",
    ...catLines,
    "];",
    "",
  ].join("\n");
  writeFileSync(OUT, out);

  console.log(
    `[sync-help] ${files.length} fichier(s) → src/help/md/ ; version ${HELP_VERSION} ; ` +
      `${inCatalog.length} article(s) au catalogue (${files.length - inCatalog.length} hors catalogue, embarqués).`,
  );
  if (stale.length) console.log(`[sync-help] purge : ${stale.length} fichier(s) obsolète(s) retiré(s).`);
}

const args = process.argv.slice(2);
if (args.includes("--watch")) {
  sync();
    console.log("[sync-help] surveillance de docs/user/ (Ctrl-C pour arrêter)…");
    let timer = null;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, 300);
    };
    try {
      watch(SRC, { recursive: true }, onChange);
    } catch {
      console.error("[sync-help] watch récursif non supporté — relancez `bun run help` après chaque édition.");
    }
} else {
  sync();
}
