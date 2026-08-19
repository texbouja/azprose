/**
 * Panneau de recherche de l'éditeur — le nôtre, pas celui de CodeMirror.
 *
 * Celui d'origine occupe toute la largeur, empile ses champs et ne dit RIEN du
 * nombre de correspondances : `@codemirror/search` n'expose aucun compteur, il
 * faut le calculer. Comme le compteur, la compacité et le placement en coin
 * demandaient de toute façon de reprendre le balisage, le panneau est réécrit
 * plutôt que rhabillé.
 *
 * Ce qui est CONSERVÉ de CodeMirror : l'état de recherche et ses commandes
 * (`setSearchQuery`, `findNext`, `findPrevious`, `replaceNext`, `replaceAll`).
 * Le clavier continue donc de fonctionner sans que ce fichier s'en mêle —
 * `searchKeymap` agit sur l'état, jamais sur ce DOM.
 *
 * Placement en HAUT À GAUCHE : le coin haut droit de l'onglet porte le menu
 * d'actions, qui doit rester atteignable pendant une recherche.
 */

import type { EditorView, Panel } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";

/**
 * Au-delà de ce nombre, on cesse de compter et on affiche « 500+ ».
 *
 * Le comptage parcourt le document à CHAQUE frappe : sur un fichier de
 * plusieurs mégaoctets, une recherche d'une seule lettre balaierait tout le
 * texte à chaque caractère tapé. Le plafond borne ce coût, et personne ne lit
 * le rang exact de la 500ᵉ correspondance.
 */
const PLAFOND = 500;

export interface Comptage {
  /** Nombre de correspondances, borné par `PLAFOND`. */
  total: number;
  /** Rang (1-based) de la correspondance sous le curseur, 0 si aucune. */
  courante: number;
  /** Le comptage s'est-il arrêté au plafond ? */
  tronque: boolean;
}

/**
 * Compte les correspondances et situe le curseur parmi elles.
 *
 * PUR : prend un état, rend des nombres — c'est la partie testable, et la
 * seule qui puisse coûter cher.
 */
export function compter(
  query: SearchQuery,
  state: Parameters<SearchQuery["getCursor"]>[0],
  selection: { from: number; to: number },
  plafond = PLAFOND,
): Comptage {
  if (!query.valid) return { total: 0, courante: 0, tronque: false };
  let total = 0;
  let courante = 0;
  const curseur = query.getCursor(state);
  for (;;) {
    const pas = curseur.next();
    if (pas.done) break;
    total++;
    // La correspondance « courante » est celle que la sélection recouvre —
    // c'est ainsi que se déplacent `findNext`/`findPrevious`.
    if (courante === 0 && pas.value.from === selection.from && pas.value.to === selection.to) {
      courante = total;
    }
    if (total >= plafond) return { total, courante, tronque: true };
  }
  return { total, courante, tronque: false };
}

/** Libellé affiché à droite du champ, à la manière de VS Code. */
export function libelleComptage(c: Comptage, aucunResultat: string): string {
  if (c.total === 0) return aucunResultat;
  const total = c.tronque ? `${c.total}+` : String(c.total);
  return c.courante > 0 ? `${c.courante}/${total}` : `${total}`;
}

interface Traductions {
  find: string;
  replace: string;
  noResults: string;
  matchCase: string;
  wholeWord: string;
  regexp: string;
  previous: string;
  next: string;
  close: string;
  replaceOne: string;
  replaceAll: string;
  toggleReplace: string;
}

function bouton(
  parent: HTMLElement,
  classe: string,
  titre: string,
  contenu: string,
  onclick: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = classe;
  b.title = titre;
  b.setAttribute("aria-label", titre);
  b.innerHTML = contenu;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onclick();
  });
  parent.appendChild(b);
  return b;
}

/** Icônes du pack d'icônes de l'application — mêmes formes que partout
 *  ailleurs. */
const ICONES = {
  // Le pack n'a pas de chevron vers le HAUT : les flèches y suppléent, et
  // elles disent de toute façon mieux « précédent / suivant ».
  prev: '<i class="wxi-arrow-up"></i>',
  next: '<i class="wxi-arrow-down"></i>',
  close: '<i class="wxi-close"></i>',
  deplier: '<i class="wxi-chevron-right"></i>',
  remplacer: '<i class="wxi-replace"></i>',
  remplacerTout: '<i class="wxi-replace-all"></i>',
};

export function creerPanneauRecherche(view: EditorView, t: Traductions): Panel {
  const dom = document.createElement("div");
  dom.className = "mdv-find";
  // Le panneau ne prend pas le focus au clic sur son fond : sans cela, cliquer
  // à côté d'un bouton retirerait le curseur du document.
  dom.addEventListener("mousedown", (e) => {
    if (e.target === dom) e.preventDefault();
  });

  let replaceVisible = false;

  const bascule = bouton(dom, "mdv-find__toggle", t.toggleReplace, ICONES.deplier, () => {
    replaceVisible = !replaceVisible;
    dom.classList.toggle("is-replacing", replaceVisible);
    bascule.setAttribute("aria-expanded", String(replaceVisible));
    if (replaceVisible) champRemplace.focus();
  });
  bascule.setAttribute("aria-expanded", "false");

  const lignes = document.createElement("div");
  lignes.className = "mdv-find__rows";
  dom.appendChild(lignes);

  // ── Ligne « chercher » ────────────────────────────────────────────────────
  const ligneFind = document.createElement("div");
  ligneFind.className = "mdv-find__row";
  lignes.appendChild(ligneFind);

  const boite = document.createElement("div");
  boite.className = "mdv-find__box";
  ligneFind.appendChild(boite);

  const champ = document.createElement("input");
  champ.className = "mdv-find__input";
  champ.placeholder = t.find;
  champ.setAttribute("aria-label", t.find);
  boite.appendChild(champ);

  const compteur = document.createElement("span");
  compteur.className = "mdv-find__count";
  compteur.setAttribute("aria-live", "polite");
  boite.appendChild(compteur);

  const options = document.createElement("div");
  options.className = "mdv-find__options";
  boite.appendChild(options);

  const casse = bouton(options, "mdv-find__opt", t.matchCase, "Aa", () => envoyer({ caseSensitive: !etat().caseSensitive }));
  const mot = bouton(options, "mdv-find__opt", t.wholeWord, "ab", () => envoyer({ wholeWord: !etat().wholeWord }));
  const regex = bouton(options, "mdv-find__opt", t.regexp, ".*", () => envoyer({ regexp: !etat().regexp }));

  bouton(ligneFind, "mdv-find__nav", t.previous, ICONES.prev, () => findPrevious(view));
  bouton(ligneFind, "mdv-find__nav", t.next, ICONES.next, () => findNext(view));
  bouton(ligneFind, "mdv-find__nav", t.close, ICONES.close, () => closeSearchPanel(view));

  // ── Ligne « remplacer » ───────────────────────────────────────────────────
  const ligneReplace = document.createElement("div");
  ligneReplace.className = "mdv-find__row mdv-find__row--replace";
  lignes.appendChild(ligneReplace);

  const champRemplace = document.createElement("input");
  champRemplace.className = "mdv-find__input";
  champRemplace.placeholder = t.replace;
  champRemplace.setAttribute("aria-label", t.replace);
  ligneReplace.appendChild(champRemplace);

  bouton(ligneReplace, "mdv-find__nav", t.replaceOne, ICONES.remplacer, () => replaceNext(view));
  bouton(ligneReplace, "mdv-find__nav", t.replaceAll, ICONES.remplacerTout, () => replaceAll(view));

  const etat = () => getSearchQuery(view.state);

  function envoyer(patch: Partial<{
    search: string;
    replace: string;
    caseSensitive: boolean;
    wholeWord: boolean;
    regexp: boolean;
  }>) {
    const q = etat();
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: patch.search ?? q.search,
          replace: patch.replace ?? q.replace,
          caseSensitive: patch.caseSensitive ?? q.caseSensitive,
          wholeWord: patch.wholeWord ?? q.wholeWord,
          regexp: patch.regexp ?? q.regexp,
        }),
      ),
    });
    view.focus();
  }

  champ.addEventListener("input", () => envoyerSansFocus({ search: champ.value }));
  champRemplace.addEventListener("input", () => envoyerSansFocus({ replace: champRemplace.value }));

  /** Même chose, mais le focus RESTE dans le champ : on tape encore. */
  function envoyerSansFocus(patch: Parameters<typeof envoyer>[0]) {
    const q = etat();
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: patch.search ?? q.search,
          replace: patch.replace ?? q.replace,
          caseSensitive: q.caseSensitive,
          wholeWord: q.wholeWord,
          regexp: q.regexp,
        }),
      ),
    });
  }

  // Entrée = suivant, Maj+Entrée = précédent, Échap = fermer — les habitudes
  // de VS Code, et celles du panneau d'origine.
  for (const c of [champ, champRemplace]) {
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (c === champRemplace) replaceNext(view);
        else if (e.shiftKey) findPrevious(view);
        else findNext(view);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeSearchPanel(view);
        view.focus();
      }
    });
  }

  function rafraichir() {
    const q = etat();
    if (champ.value !== q.search) champ.value = q.search;
    if (champRemplace.value !== q.replace) champRemplace.value = q.replace;
    casse.classList.toggle("is-on", q.caseSensitive);
    mot.classList.toggle("is-on", q.wholeWord);
    regex.classList.toggle("is-on", q.regexp);
    // Un motif d'expression régulière invalide se signale sur le champ plutôt
    // que par un message : l'utilisateur est en train de le taper.
    champ.classList.toggle("is-invalid", q.search.length > 0 && !q.valid);

    const sel = view.state.selection.main;
    const c = q.search ? compter(q, view.state, { from: sel.from, to: sel.to }) : { total: 0, courante: 0, tronque: false };
    compteur.textContent = q.search ? libelleComptage(c, t.noResults) : "";
    compteur.classList.toggle("is-empty", Boolean(q.search) && c.total === 0);
  }

  rafraichir();

  return {
    dom,
    top: true,
    mount() {
      champ.focus();
      champ.select();
    },
    update(u) {
      if (u.docChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))) {
        rafraichir();
      }
    },
  };
}
