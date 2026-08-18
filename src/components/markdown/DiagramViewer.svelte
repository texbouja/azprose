<script lang="ts">
/**
 * Visionneuse de diagramme — un diagramme composé, ouvert en grand, avec zoom
 * et déplacement.
 *
 * Motif : un diagramme sérieux dépasse vite la largeur d'un aperçu, et le
 * réduire à la largeur du texte le rend illisible. La visionneuse rend
 * l'espace de la fenêtre entière sans toucher au document.
 *
 * Le SVG est repris TEL QUEL depuis le bloc déjà composé (chaîne HTML) : on ne
 * recompose rien, donc ouvrir la visionneuse ne coûte ni chargement ni rendu.
 */
import { getT, language } from "@/lib/i18n";

let { svg, onClose }: { svg: string; onClose: () => void } = $props();

let t = $derived(getT($language));

const ECHELLE_MIN = 0.25;
const ECHELLE_MAX = 8;
/** Pas des BOUTONS et du clavier : gestes discrets, un cran franc. */
const PAS = 1.25;
/**
 * Sensibilité de la molette, par pixel de défilement.
 *
 * Un cran de souris vaut ~100 px et donne ici ~8 % — un geste de molette
 * complet reste donc progressif au lieu de traverser toute la plage de zoom.
 * Les pavés tactiles envoient beaucoup d'événements de faible amplitude : la
 * loi exponentielle les rend continus, sans à-coups.
 */
const SENSIBILITE_MOLETTE = 0.0008;

let echelle = $state(1);
let dx = $state(0);
let dy = $state(0);
// `$state` : le curseur (grab/grabbing) est lié à cette valeur, elle doit donc
// déclencher un rendu.
let deplacement = $state<{ x: number; y: number } | null>(null);

function borner(v: number): number {
  return Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, v));
}

function zoomer(facteur: number): void {
  echelle = borner(echelle * facteur);
}

function reinitialiser(): void {
  echelle = 1;
  dx = 0;
  dy = 0;
}

function surMolette(e: WheelEvent): void {
  // Sans `preventDefault`, la molette ferait défiler le document DERRIÈRE la
  // visionneuse — elle est en surimpression, pas dans le flux.
  e.preventDefault();
  // `deltaMode` normalisé en pixels : selon la source (pavé tactile, molette,
  // certains pilotes), le même geste arrive en pixels, en lignes ou en pages.
  // Sans cette conversion, un cran de molette en mode « ligne » (deltaY = 3)
  // zoomerait trente fois moins qu'en mode pixel.
  const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  echelle = borner(echelle * Math.exp(-px * SENSIBILITE_MOLETTE));
}

function surAppui(e: PointerEvent): void {
  if (e.button !== 0) return;
  deplacement = { x: e.clientX - dx, y: e.clientY - dy };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function surMouvement(e: PointerEvent): void {
  if (!deplacement) return;
  dx = e.clientX - deplacement.x;
  dy = e.clientY - deplacement.y;
}

function surRelache(e: PointerEvent): void {
  deplacement = null;
  (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
}

function surTouche(e: KeyboardEvent): void {
  if (e.key === "Escape") { e.preventDefault(); onClose(); }
  else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomer(PAS); }
  else if (e.key === "-") { e.preventDefault(); zoomer(1 / PAS); }
  else if (e.key === "0") { e.preventDefault(); reinitialiser(); }
}

// Le focus vient sur la visionneuse à l'ouverture : sans lui, les raccourcis
// clavier iraient à l'éditeur resté dessous.
let racine: HTMLDivElement | undefined = $state();
$effect(() => { racine?.focus(); });
</script>

<div
  class="mdv-diagram-viewer"
  role="dialog"
  aria-modal="true"
  aria-label={t("diagram.viewerTitle")}
  tabindex="-1"
  bind:this={racine}
  onkeydown={surTouche}
>
  <div class="mdv-diagram-viewer__bar">
    <button type="button" title={t("diagram.zoomOut")} aria-label={t("diagram.zoomOut")} onclick={() => zoomer(1 / PAS)}>
      <i class="wxi-minus" aria-hidden="true"></i>
    </button>
    <span class="mdv-diagram-viewer__scale">{Math.round(echelle * 100)} %</span>
    <button type="button" title={t("diagram.zoomIn")} aria-label={t("diagram.zoomIn")} onclick={() => zoomer(PAS)}>
      <i class="wxi-plus" aria-hidden="true"></i>
    </button>
    <button type="button" title={t("diagram.reset")} aria-label={t("diagram.reset")} onclick={reinitialiser}>
      <i class="wxi-refresh" aria-hidden="true"></i>
    </button>
    <button type="button" title={t("diagram.close")} aria-label={t("diagram.close")} onclick={onClose}>
      <i class="wxi-close" aria-hidden="true"></i>
    </button>
  </div>

  <!-- `application` : cette zone capte molette et pointeur pour son propre
       usage (zoom, déplacement), ce que le rôle annonce aux technologies
       d'assistance. Les mêmes gestes restent accessibles au clavier
       (+ / - / 0), gérés par le conteneur. -->
  <div
    class="mdv-diagram-viewer__stage"
    role="application"
    aria-label={t("diagram.viewerTitle")}
    class:is-dragging={deplacement !== null}
    onwheel={surMolette}
    onpointerdown={surAppui}
    onpointermove={surMouvement}
    onpointerup={surRelache}
    onpointercancel={surRelache}
  >
    <div class="mdv-diagram-viewer__canvas" style="transform: translate({dx}px, {dy}px) scale({echelle})">
      <!-- Le SVG vient d'un diagramme DÉJÀ composé et assaini par Mermaid
           (DOMPurify) : aucune source externe n'est introduite ici. -->
      {@html svg}
    </div>
  </div>
</div>

<style>
.mdv-diagram-viewer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.mdv-diagram-viewer:focus {
  outline: none;
}
.mdv-diagram-viewer__bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.mdv-diagram-viewer__bar button {
  display: inline-flex;
  align-items: center;
  padding: 4px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
}
.mdv-diagram-viewer__bar button:hover {
  background: var(--surface-hover);
}
.mdv-diagram-viewer__scale {
  min-width: 52px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.mdv-diagram-viewer__stage {
  flex: 1;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.mdv-diagram-viewer__stage.is-dragging {
  cursor: grabbing;
}
.mdv-diagram-viewer__canvas {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  transform-origin: center;
}
.mdv-diagram-viewer__canvas :global(svg) {
  max-width: none;
  height: auto;
}
</style>
