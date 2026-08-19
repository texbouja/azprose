// Synchronise les actifs MathJax servis par l'application.
//
//   bun run mathjax
//
// L'application ne charge PAS MathJax depuis le bundle : le moteur, ses
// extensions TeX, SRE et les données de police sont des ACTIFS SERVIS
// (`public/mathjax*`). Ce script les recopie depuis `node_modules`, pour que
// leur version suive celle des paquets installés.
//
// POURQUOI : ces fichiers étaient copiés à la main. Le moteur a été mis à jour
// sans eux, et le décalage s'est vu en production — « Component [tex]/mathtools
// uses 4.1.2 of MathJax; version in use is 4.1.3 ». Une copie manuelle dérive ;
// une copie scriptée se rejoue.

import { cpSync, rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = resolve(root, "node_modules");
const dest = resolve(root, "public");

/** Version d'un paquet installé — sert à vérifier qu'elles concordent. */
function version(paquet) {
  const p = resolve(modules, paquet, "package.json");
  if (!existsSync(p)) throw new Error(`paquet absent : ${paquet} (bun install ?)`);
  return JSON.parse(readFileSync(p, "utf8")).version;
}

function copier(src, cible) {
  rmSync(cible, { recursive: true, force: true });
  mkdirSync(dirname(cible), { recursive: true });
  cpSync(src, cible, { recursive: true });
}

const vMoteur = version("mathjax");
const vFira = version("@mathjax/mathjax-fira-font");

// Le paquet d'une police embarque SON PROPRE moteur : deux versions
// différentes, ce sont deux MathJax dans la même application, et les
// avertissements de composants dépareillés qui vont avec.
if (vMoteur !== vFira) {
  console.warn(
    `[sync-mathjax] ⚠ versions dépareillées : mathjax ${vMoteur} ≠ ` +
    `@mathjax/mathjax-fira-font ${vFira} — aligner les deux dans package.json.`,
  );
}

// 1. Moteur newcm (police embarquée) + 2. moteur Fira, servis tels quels : les
//    empaqueter casse le démarrage de MathJax en production (mesuré — la
//    promesse `startup.promise` ne se résout jamais).
copier(
  resolve(modules, "mathjax/tex-svg.js"),
  resolve(dest, "mathjax/tex-svg.js"),
);
copier(
  resolve(modules, "@mathjax/mathjax-fira-font/tex-mml-svg-mathjax-fira.js"),
  resolve(dest, "mathjax/tex-mml-svg-mathjax-fira.js"),
);

// 3. Extensions TeX chargées à la demande (`loader.paths.mathjax`) et SRE.
copier(resolve(modules, "mathjax/input"), resolve(dest, "mathjax/input"));
copier(resolve(modules, "mathjax/sre"), resolve(dest, "mathjax/sre"));

// 4. Données de glyphes de Fira : six plages se chargent à l'exécution
//    (`\mathbb`, `\mathcal`, `\mathfrak`…) et leur absence est FATALE — la
//    formule ne s'affiche pas du tout. New Computer Modern n'en a pas besoin,
//    elle résout les siennes toute seule.
copier(
  resolve(modules, "@mathjax/mathjax-fira-font/svg"),
  resolve(dest, "mathjax-fonts/mathjax-fira-font/svg"),
);

console.log(
  `[sync-mathjax] moteurs + extensions + SRE (mathjax ${vMoteur}) ` +
  `et police Fira (${vFira}) → public/`,
);
