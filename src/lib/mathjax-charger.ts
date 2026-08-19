/**
 * Chargement du moteur MathJax — POINT D'ENTRÉE UNIQUE de l'application.
 *
 * Trois modules importaient `mathjax/tex-svg.js` chacun de son côté
 * (`typeset-math.ts`, `SlideDeck.svelte`, `ProseMarkEditor.svelte`). Depuis que
 * la police est un réglage, ce fichier n'est plus le bon dans tous les cas :
 * l'import passe donc par ici, et par ici seulement — sinon une surface
 * chargerait une police et une autre surface l'autre, dans la même fenêtre.
 *
 * `window.MathJax` doit être configuré AVANT (voir `initMathJaxConfig` dans
 * `shell/boot.ts`) : c'est le moteur qui lit cet objet à son chargement.
 */

import { policeValide, type MathJaxFont } from "@/lib/mathjax-font";
// Import DIRECT, pas par le baril `@/lib` : ce module est chargé au démarrage,
// avant tout le reste, et le baril entraînerait la moitié de l'application.
import { STORAGE_KEYS } from "@/lib/storage";

let charge: Promise<void> | null = null;

/**
 * Police demandée, lue sur `localStorage`.
 *
 * Volontairement PAS lue sur le store à runes : ce module est appelé depuis des
 * chemins qui n'ont pas de contexte réactif (impression, aperçu détaché), et
 * `boot.ts` lit déjà la même clé de la même façon. Un changement de police
 * demande de toute façon un redémarrage — la valeur ne bouge pas en cours de
 * session.
 */
export function policeDemandee(): MathJaxFont {
  try {
    return policeValide(JSON.parse(localStorage.getItem(STORAGE_KEYS.mathJaxFont) ?? '""'));
  } catch {
    return policeValide(null);
  }
}

/**
 * Charge le moteur, une seule fois par fenêtre.
 *
 * Les deux polices ne se chargent pas par le même fichier : `tex-svg.js`
 * embarque New Computer Modern en entier, alors que Fira arrive par le fichier
 * combiné de son propre paquet, qui laisse six plages de glyphes se charger à
 * la demande depuis `public/mathjax-fonts/` (cf. `mathjax-font.ts`).
 *
 * Les deux chemins sont des imports STATIQUEMENT ANALYSABLES : Vite en fait
 * deux chunks distincts, et seul celui de la police retenue est téléchargé.
 */
export function chargerMathJax(): Promise<void> {
  if (!charge) {
    charge =
      policeDemandee() === "fira"
        ? import("@mathjax/mathjax-fira-font/tex-mml-svg-mathjax-fira.js").then(() => undefined)
        : import("mathjax/tex-svg.js").then(() => undefined);
  }
  return charge;
}
