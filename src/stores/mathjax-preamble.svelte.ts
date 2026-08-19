import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";
import { policeValide, MATHJAX_FONT_DEFAUT, type MathJaxFont } from "@/lib/mathjax-font";
import {
  espacementEm,
  espacementValide,
  MATH_SPACING_DEFAUT,
  type MathSpacing,
} from "@/lib/mathjax-spacing";

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

/**
 * Espace vertical autour des formules hors texte.
 *
 * Contrairement à la police, c'est du CSS : l'effet est IMMÉDIAT, sans
 * redémarrage. La valeur est posée en variable sur la racine du document —
 * `applyMathSpacing` — et `preview.css` la consomme.
 */
export function applyMathSpacing(v: MathSpacing): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--math-space", `${espacementEm(v)}em`);
}

const _spacing = persistedState<MathSpacing>(
  STORAGE_KEYS.mathJaxSpacing,
  MATH_SPACING_DEFAUT,
  espacementValide,
  // Écriture venue d'une AUTRE fenêtre : le setter n'est pas passé, la
  // variable CSS ne serait jamais rejouée sans ce rappel.
  applyMathSpacing,
);

export const mathJaxSpacing = {
  get current(): MathSpacing { return _spacing.current; },
  set current(v: MathSpacing) {
    _spacing.current = v;
    applyMathSpacing(_spacing.current);
  },
  reset() { mathJaxSpacing.current = MATH_SPACING_DEFAUT; },
};
