import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

/**
 * Préambule LaTeX personnel — le jumeau du préambule MathJax de l'aperçu.
 *
 * Ce que l'utilisateur saisit ici est déposé à chaque compilation dans
 * `.azprose/texmf/tex/latex/azlocal/user.def`, que `azbase.sty` charge à la fin
 * du préambule de chaque document.
 *
 * Le POURQUOI : azkit interdit les définitions de macros dans le préambule d'un
 * document, pour qu'un fragment puisse voyager sans emporter ses dépendances.
 * Il fallait donc un endroit UNIQUE pour les commandes personnelles — et cet
 * endroit ne doit pas être un chemin que l'utilisateur ait à connaître.
 */
const _preamble = persistedState<string>(STORAGE_KEYS.latexPreamble, "");

export const latexPreamble = {
  get current(): string { return _preamble.current; },
  set current(v: string) { _preamble.current = v; },
  reset() { _preamble.current = ""; },
};
