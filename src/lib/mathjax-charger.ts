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

import { policeValide, scriptLocal, type MathJaxFont } from "@/lib/mathjax-font";
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
 * Par BALISE `<script>`, jamais par `import` : un moteur MathJax ne survit pas
 * à l'empaquetage (voir `scriptLocal` — le démarrage n'aboutit pas et le
 * document reste en LaTeX brut). Le fichier est un actif servi, déposé par
 * `bun run mathjax`.
 *
 * Les deux polices arrivent par deux fichiers différents : `tex-svg.js`
 * embarque New Computer Modern en entier, tandis que Fira laisse six plages de
 * glyphes se charger à la demande depuis `public/mathjax-fonts/`.
 */
export function chargerMathJax(): Promise<void> {
  if (!charge) {
    charge = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptLocal(policeDemandee());
      script.async = true;
      script.addEventListener("load", () => resolve(), { once: true });
      // Un moteur absent n'est PAS silencieux : sans cela, l'appelant
      // attendrait une promesse qui ne se résout jamais — exactement le
      // symptôme qu'on vient de corriger.
      script.addEventListener(
        "error",
        () => reject(new Error(`moteur MathJax introuvable : ${script.src}`)),
        { once: true },
      );
      document.head.appendChild(script);
    });
  }
  return charge;
}
