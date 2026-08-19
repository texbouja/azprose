/**
 * Coloration des mathématiques dans l'éditeur — grammaire lezer-markdown.
 *
 * QUATRE délimiteurs, les mêmes que le pipeline de rendu (`math-plugin.ts`) :
 * `$…$`, `$$…$$`, `\(…\)` et `\[…\]`. L'éditeur et l'aperçu reconnaissent donc
 * exactement les mêmes formules — c'était déjà le contrat, il ne l'était plus
 * dès qu'on ajoutait un délimiteur d'un seul côté.
 *
 * Ce module remplace `mathMarkdownSyntaxExtension` de `@prosemark/core`, retiré
 * avec le mode WYSIWYM (2026-08-19). Il n'en garde que ce dont l'éditeur BRUT
 * avait besoin : des nœuds à colorer. Aucun widget, aucun rendu — l'éditeur
 * montre la SOURCE, le visualiseur montre les formules.
 *
 * ⚠️ `before: "Escape"` n'est pas un détail : `\(` est une séquence
 * d'échappement CommonMark valide. Sans cette précédence, la règle `Escape`
 * consomme le backslash et la formule n'est jamais reconnue — mesuré.
 */

import { styleTags, Tag } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";

/** Étiquette des délimiteurs (`$`, `$$`, `\(`, `\[`…). */
export const mathDelimiterTag = Tag.define();

/** Étiquette du corps de la formule. */
export const mathFormulaTag = Tag.define();

const ANTISLASH = 92; // \
const DOLLAR = 36; // $

/** Paires reconnues, dans l'ordre d'essai : le plus long d'abord, sans quoi
 *  `$$` serait pris pour deux `$` vides. */
const PAIRES = [
  { ouvrant: "$$", fermant: "$$" },
  { ouvrant: "$", fermant: "$" },
  { ouvrant: "\\(", fermant: "\\)" },
  { ouvrant: "\\[", fermant: "\\]" },
] as const;

export const mathSyntaxExtension: MarkdownConfig = {
  defineNodes: [
    { name: "Math", block: true },
    { name: "MathMark" },
    { name: "MathFormula" },
  ],
  props: [
    styleTags({
      MathMark: mathDelimiterTag,
      MathFormula: mathFormulaTag,
    }),
  ],
  parseInline: [
    {
      name: "Math",
      before: "Escape",
      parse: (cx, next, pos) => {
        if (next !== DOLLAR && next !== ANTISLASH) return -1;

        // Un caractère échappé n'ouvre rien : `\$12` est un prix, `\\(` est un
        // antislash suivi d'une parenthèse.
        if (pos > 0 && cx.char(pos - 1) === ANTISLASH) return -1;

        const paire = PAIRES.find((p) => cx.slice(pos, pos + p.ouvrant.length) === p.ouvrant);
        if (!paire) return -1;

        const taille = paire.ouvrant.length;
        const debut = pos + taille;
        const reste = cx.slice(debut, cx.end);
        const fin = reste.indexOf(paire.fermant);
        // Sans fermeture on ne consomme rien : le texte reste du texte.
        if (fin < 0) return -1;
        const finContenu = debut + fin;
        if (!cx.slice(debut, finContenu).trim()) return -1;

        return cx.addElement(
          cx.elt("Math", pos, finContenu + paire.fermant.length, [
            cx.elt("MathMark", pos, debut),
            cx.elt("MathFormula", debut, finContenu),
            cx.elt("MathMark", finContenu, finContenu + paire.fermant.length),
          ]),
        );
      },
    },
  ],
};
