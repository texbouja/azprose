import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";
import { policeValide, MATHJAX_FONT_DEFAUT, type MathJaxFont } from "@/lib/mathjax-font";

const _preamble = persistedState<string>(STORAGE_KEYS.mathJaxPreamble, "");

export const mathJaxPreamble = {
  get current(): string { return _preamble.current; },
  set current(v: string) { _preamble.current = v; },
  reset() { _preamble.current = ""; },
};

const _packages = persistedState<string[]>(STORAGE_KEYS.mathJaxPackages, []);

export const mathJaxPackages = {
  get current(): string[] { return _packages.current; },
  set current(v: string[]) { _packages.current = v; },
  toggle(id: string) {
    const list = _packages.current;
    _packages.current = list.includes(id)
      ? list.filter(p => p !== id)
      : [...list, id];
  },
  reset() { _packages.current = []; },
};

/**
 * Police mathématique. Le moteur la lit AU CHARGEMENT : changer ce réglage
 * n'a d'effet qu'après redémarrage — d'où le bouton déjà présent dans le
 * module « MathJax » des réglages.
 */
const _font = persistedState<MathJaxFont>(
  STORAGE_KEYS.mathJaxFont,
  MATHJAX_FONT_DEFAUT,
  policeValide,
);

export const mathJaxFont = {
  get current(): MathJaxFont { return _font.current; },
  set current(v: MathJaxFont) { _font.current = v; },
  reset() { _font.current = MATHJAX_FONT_DEFAUT; },
};
