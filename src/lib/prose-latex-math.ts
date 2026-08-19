/**
 * Délimiteurs LaTeX `\(…\)` et `\[…\]` dans l'éditeur PROSE.
 *
 * ProseMark ne connaît que `$…$` et `$$…$$` (son `mathMarkdownSyntaxExtension`
 * n'accepte rien d'autre, vérifié dans sa source) : ce module ajoute la
 * grammaire manquante ET le widget qui la rend, en se raccrochant à sa
 * mécanique plutôt qu'en la doublant.
 *
 * **Pourquoi un widget à nous.** Le sien lit les délimiteurs en supposant un ou
 * deux caractères de dollar (`slice(from, from+2) === "$$"`, sinon `from+1`) :
 * un nœud ouvert par `\(` lui donnerait « (x^2\ » comme formule. Il n'est pas
 * exporté, donc pas réutilisable tel quel. Le nôtre porte en revanche la MÊME
 * classe CSS (`cm-latex-math`) et les mêmes attributs `data-*` : tout son thème
 * s'applique, et les deux sortes de formules se ressemblent au pixel près.
 *
 * Le rendu passe par `composerFormule`, donc par le préambule du projet et ses
 * macros — comme partout ailleurs dans l'application.
 */

import { Decoration, WidgetType, type EditorView } from "@codemirror/view";
import type { EditorState, Extension, Range } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";
import { styleTags } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";
import {
  foldableSyntaxFacet,
  mathDelimiterTag,
  mathFormulaTag,
} from "@prosemark/core";

/** Classe du widget de ProseMark — reprise à dessein, pour hériter de son
 *  thème (affichage en ligne ou en bloc, centrage, marges, erreurs). */
const CLASSE_WIDGET = "cm-latex-math";

/** Paires reconnues. `\(…\)` en ligne, `\[…\]` hors texte. */
const PAIRES = [
  { ouvrant: "(", fermant: "\\)", display: false },
  { ouvrant: "[", fermant: "\\]", display: true },
] as const;

const ANTISLASH = 92; // \

/**
 * Grammaire : `\(…\)` et `\[…\]` → nœud `LatexDelim`.
 *
 * ⚠️ Les nœuds s'appellent `LatexDelim…` et surtout PAS `…Math` : ProseMark
 * apparie ses décorations par SUFFIXE de chemin (`path.endsWith("Math")`), si
 * bien qu'un nœud nommé `LatexMath` était attrapé par SON widget, qui le
 * découpait comme des dollars — mesuré, la formule rendue était « (a \le b\ ».
 *
 * **Devant QUELLE règle** : `\(` est une séquence d'échappement CommonMark
 * valide, mangée par la première règle qui la voit. Dans l'éditeur BRUT c'est
 * `Escape`, native de lezer-markdown ; dans PROSE, ProseMark ajoute la sienne,
 * `EscapeMark`, elle-même posée avant `Escape` — se placer devant `Escape` n'y
 * suffit donc pas : mesuré, aucune formule n'était reconnue. D'où le paramètre,
 * chaque contexte nommant la règle qu'il doit devancer. Nommer une règle
 * ABSENTE fait lever lezer (« unknown parser »), d'où deux valeurs et pas une
 * chaîne libre.
 */
export function grammaireDelimiteursLatex(
  avant: "Escape" | "EscapeMark" = "Escape",
): MarkdownConfig {
  return {
    defineNodes: [
      { name: "LatexDelim", block: true },
      { name: "LatexDelimMark" },
      { name: "LatexDelimFormula" },
    ],
    props: [
      styleTags({
        LatexDelimMark: mathDelimiterTag,
        LatexDelimFormula: mathFormulaTag,
      }),
    ],
    parseInline: [
      {
        name: "LatexDelim",
        before: avant,
        parse: (cx, next, pos) => {
          if (next !== ANTISLASH) return -1;
          const paire = PAIRES.find(
            (p) => cx.char(pos + 1) === p.ouvrant.charCodeAt(0),
          );
          if (!paire) return -1;

          // Un antislash échappé (`\\(`) n'ouvre pas de formule : c'est un
          // antislash littéral suivi d'une parenthèse.
          if (pos > 0 && cx.char(pos - 1) === ANTISLASH) return -1;

          const contenuDebut = pos + 2;
          const fin = cx.slice(contenuDebut, cx.end).indexOf(paire.fermant);
          if (fin < 0) return -1;
          const contenuFin = contenuDebut + fin;
          if (!cx.slice(contenuDebut, contenuFin).trim()) return -1;

          return cx.addElement(
            cx.elt("LatexDelim", pos, contenuFin + 2, [
              cx.elt("LatexDelimMark", pos, contenuDebut),
              cx.elt("LatexDelimFormula", contenuDebut, contenuFin),
              cx.elt("LatexDelimMark", contenuFin, contenuFin + 2),
            ]),
          );
        },
      },
    ],
  };
}

class WidgetFormuleLatex extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }

  eq(autre: WidgetFormuleLatex): boolean {
    return this.tex === autre.tex && this.display === autre.display;
  }

  toDOM(view: EditorView): HTMLElement {
    const hote = document.createElement(this.display ? "div" : "span");
    hote.className = CLASSE_WIDGET;
    hote.setAttribute("data-latex", this.tex);
    hote.setAttribute("data-display", this.display ? "block" : "inline");

    // Composition ASYNCHRONE : le widget est posé vide puis rempli. La mesure
    // de CodeMirror est redemandée ensuite, sans quoi la ligne garderait la
    // hauteur de l'espace réservé.
    void import("@/lib/typeset-math")
      .then(({ composerFormule }) =>
        composerFormule(this.tex, { display: this.display }),
      )
      .then((compose) => {
        if (compose) hote.innerHTML = compose.svg;
        else hote.textContent = this.tex;
        view.requestMeasure();
      })
      .catch(() => {
        // Une formule qui ne se compose pas montre sa SOURCE : l'auteur doit
        // pouvoir la corriger, un widget vide ne dirait rien.
        hote.textContent = this.tex;
        hote.classList.add(`${CLASSE_WIDGET}-error`);
        view.requestMeasure();
      });

    return hote;
  }

  /** Les événements passent au widget (clic pour replacer le curseur). */
  ignoreEvent(): boolean {
    return false;
  }
}

/** Découpe le nœud : deux caractères de délimiteur de chaque côté. */
function decorerLatexDelim(
  state: EditorState,
  node: SyntaxNodeRef,
): Range<Decoration> | undefined {
  const ouvrant = state.doc.sliceString(node.from, node.from + 2);
  const display = ouvrant === "\\[";
  const tex = state.doc.sliceString(node.from + 2, node.to - 2).trim();
  if (!tex) return;
  return Decoration.replace({
    widget: new WidgetFormuleLatex(tex, display),
    block: display,
    inclusive: true,
  }).range(node.from, node.to);
}

/** Extension à ajouter aux extensions LaTeX de ProseMark. */
export function latexDelimitersExtensions(): Extension {
  return foldableSyntaxFacet.of({
    nodePath: "LatexDelim",
    buildDecorations: decorerLatexDelim,
  });
}
