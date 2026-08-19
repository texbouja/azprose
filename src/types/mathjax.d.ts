// Extensions TeX importées statiquement par `stores/mathjax-all-extensions.ts`.
// Le MOTEUR, lui, n'est jamais importé : il est servi depuis `public/mathjax/`
// et chargé par balise `<script>` (cf. `lib/mathjax-charger.ts`).
declare module "mathjax/input/tex/extensions/empheq.js" {}
declare module "mathjax/input/tex/extensions/mathtools.js" {}
declare module "mathjax/input/tex/extensions/mhchem.js" {}
declare module "mathjax/input/tex/extensions/physics.js" {}

// `window.MathJax` était typé par les ambiants de `@prosemark/latex`, retiré
// avec le mode WYSIWYM (2026-08-19). La déclaration vit désormais ici : le
// moteur est posé sur `window` par le script servi, il n'a pas d'autre type.
declare global {
  interface Window {
    MathJax?: any;
  }
}

export {};
