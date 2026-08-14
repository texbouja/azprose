// Icon pack build (part of `bun run build` — voir package.json "icons").
//
//   bun run scripts/build-icons.mjs
//
// Source unique = src/styles/wxi-lucide.source.css (bibliothèque complète,
// maintenue à la main — c'est LÀ qu'on ajoute une icône, modèle .wxi-compass).
// Ce script en émet src/styles/wxi-lucide.css (GÉNÉRÉ, versionné comme
// tokens.css) : TOUTES les icônes de la source, chaque data URI écrit UNE
// fois (propriété personnalisée --wxi) plutôt que deux (-webkit-mask-image
// ET mask-image dupliqués dans la source).
//
// Vague 2, phase 2.3 de la refonte UI : posait AUSSI un tree-shaking par
// usage (scan de src/**, icônes non référencées exclues). Retiré en vague 4
// (retour utilisateur après tests) : le gain (~200 Ko) était marginal à
// l'échelle de l'app, et le risque — une icône silencieusement absente du
// pack généré si son usage échappait au scanner (ex. DataFilterViewer.svelte,
// vu tardivement) — ne le justifiait pas. Seule la déduplication reste.

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(root, "src/styles/wxi-lucide.source.css");
const OUT = resolve(root, "src/styles/wxi-lucide.css");

// Utilitaires connus : blocs `.wxi-X::before { … }` qui ne portent PAS de
// data URI (pas des icônes). Émis TELS QUELS depuis la source, pas recopiés
// en dur ici — seul leur NOM est une liste blanche, pour qu'un bloc
// réellement inconnu fasse ÉCHOUER le script (§piège ci-dessous) plutôt que
// d'être silencieusement perdu.
const KNOWN_UTILITIES = new Set(["empty", "spin"]);

/** Extrait le bloc `{ … }` équilibré démarrant à `startIndex` (position du
 *  PREMIER `{`) — une regex à profondeur fixe (`\{[^}]*\}`) casse dès qu'un
 *  bloc contient PLUSIEURS sous-blocs (ex. `@keyframes` avec `from{}`
 *  ET `to{}` : elle s'arrête à la première accolade fermante rencontrée,
 *  laissant le second sous-bloc, et donc le CSS entier, mal formé —
 *  constaté à l'exécution sur wxi-spin-anim). */
function extractBalancedBlock(css, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(startIndex, i + 1);
    }
  }
  throw new Error("icônes: accolade non fermée en cherchant un bloc équilibré (source corrompue ?)");
}

// ── 1. Parser la source ──────────────────────────────────────────────────
// Chaque bloc `.wxi-X::before { … }` est soit une ICÔNE (les deux propriétés
// mask-image, même data URI), soit un UTILITAIRE de la liste blanche
// ci-dessus (recopié tel quel). Tout le reste fait échouer le script : un
// format d'icône qui aurait dérivé serait sinon silencieusement absent du
// pack généré, plutôt qu'un échec bruyant.
function parseSource(css) {
  const blockRe = /((?:\/\*[^*]*\*\/\s*\n)?)\.wxi-([a-z0-9-]+)::before\s*\{([^}]*)\}\n?/g;
  const icons = new Map();     // nom → data URI
  const utilities = [];        // { raw } — texte du bloc, verbatim
  const unrecognized = [];
  let m;
  while ((m = blockRe.exec(css)) !== null) {
    const [raw, , name, body] = m;
    const maskMatch = body.match(/-webkit-mask-image:\s*url\("([^"]+)"\);\s*mask-image:\s*url\("([^"]+)"\);/);
    if (maskMatch) {
      const [, webkitUri, standardUri] = maskMatch;
      if (webkitUri !== standardUri) {
        throw new Error(`icônes: -webkit-mask-image et mask-image divergent pour .wxi-${name} — source corrompue ?`);
      }
      if (icons.has(name)) throw new Error(`icônes: .wxi-${name} déclarée deux fois dans la source`);
      icons.set(name, webkitUri);
    } else if (KNOWN_UTILITIES.has(name)) {
      utilities.push({ name, raw: raw.trimEnd() });
    } else {
      unrecognized.push(name);
    }
  }
  if (unrecognized.length > 0) {
    throw new Error(
      `icônes: bloc(s) .wxi-*::before ni icône (paire mask-image) ni utilitaire connu ` +
      `(KNOWN_UTILITIES) : ${unrecognized.map((n) => `.wxi-${n}`).join(", ")}. ` +
      `Ajouter à KNOWN_UTILITIES si c'est voulu, sinon corriger le format source.`
    );
  }
  // wxi-spin s'accompagne d'un @keyframes séparé (pas un bloc ::before) —
  // recopié verbatim s'il est présent, échec sinon (même logique : mieux
  // vaut un échec bruyant qu'une animation cassée silencieusement).
  let keyframes = "";
  if (utilities.some((u) => u.name === "spin")) {
    const kfStart = css.indexOf("@keyframes wxi-spin-anim");
    if (kfStart === -1) throw new Error("icônes: .wxi-spin présent mais @keyframes wxi-spin-anim introuvable dans la source.");
    const braceStart = css.indexOf("{", kfStart);
    keyframes = css.slice(kfStart, braceStart) + extractBalancedBlock(css, braceStart);
  }
  return { icons, utilities, keyframes };
}

// ── 2. Émettre le pack généré ────────────────────────────────────────────
function render(icons, utilities, keyframes) {
  const allIcons = [...icons.entries()].sort(([a], [b]) => a.localeCompare(b));

  const banner = "/* GÉNÉRÉ par scripts/build-icons.mjs — ne pas éditer.\n" +
    "   Éditer src/styles/wxi-lucide.source.css, puis `bun run icons`. */\n";

  const header =
    `/* ================================================================\n` +
    ` * wxi-lucide.css — icônes via masques CSS (${allIcons.length} icônes, pack complet — pas de tree-shaking, cf. commentaire d'en-tête du script)\n` +
    ` * API: <i class="wxi-*"></i> or <i class="wxi-*" style="font-size:16px">\n` +
    ` * ================================================================ */\n\n`;

  // Neutralise le fallback @font-face si un CDN était accidentellement chargé.
  const neutralize =
    `i[class^="wxi-"]::before,\n` +
    `i[class*=" wxi-"]::before {\n` +
    `  font-family: inherit !important;\n` +
    `}\n\n`;

  // Règle de base — les DEUX propriétés, écrites UNE seule fois pour tout le
  // pack : chaque icône ne pose plus que --wxi.
  const base =
    `[class^="wxi-"]::before,\n` +
    `[class*=" wxi-"]::before {\n` +
    `  content: "";\n` +
    `  display: inline-block;\n` +
    `  width: 1em;\n` +
    `  height: 1em;\n` +
    `  vertical-align: middle;\n` +
    `  background: currentColor;\n` +
    `  -webkit-mask-image: var(--wxi);\n` +
    `  mask-image: var(--wxi);\n` +
    `  -webkit-mask-size: contain;\n` +
    `  mask-size: contain;\n` +
    `  -webkit-mask-repeat: no-repeat;\n` +
    `  mask-repeat: no-repeat;\n` +
    `  -webkit-mask-position: center;\n` +
    `  mask-position: center;\n` +
    `  flex-shrink: 0;\n` +
    `}\n\n`;

  // Utilitaires (wxi-empty, wxi-spin…) — pas des icônes, recopiés VERBATIM
  // depuis la source (cf. KNOWN_UTILITIES).
  const utilBlocks = utilities.map((u) => u.raw).join("\n\n");
  const utilSection = utilBlocks ? utilBlocks + "\n\n" + (keyframes ? keyframes + "\n\n" : "") : "";

  // Une déclaration --wxi par icône de la source — TOUTES, pack complet.
  const decls = allIcons
    .map(([name, uri]) => `.wxi-${name} { --wxi: url("${uri}"); }`)
    .join("\n");

  return banner + header + neutralize + base + utilSection + decls + "\n";
}

function main() {
  const sourceCss = readFileSync(SOURCE, "utf8");
  const { icons, utilities, keyframes } = parseSource(sourceCss);

  const out = render(icons, utilities, keyframes);
  const before = statSync(SOURCE).size;
  writeFileSync(OUT, out, "utf8");
  const after = Buffer.byteLength(out, "utf8");

  console.log(`icons: ${icons.size} icônes (pack complet), ${after} octets (source: ${before} octets)`);
}

main();
