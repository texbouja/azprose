/**
 * État de la fenêtre NAV — à la portée MODULE (phase 1.4, vague 1).
 *
 * Piège HMR corrigé ici : en Svelte 5, une mise à jour HMR RECRÉE l'instance
 * du composant touché. Tant que cet état vivait dans le scope d'INSTANCE de
 * `browse-app.svelte`, toute mise à jour dont la propagation s'arrêtait sur ce
 * composant — exactement les modules qu'on édite en travaillant sur NAV
 * (`nav/address.ts`, `toc-declared.ts`, `browse-window.ts`, `nav-stack.ts`,
 * `panel-store.ts`) — VIDAIT la fenêtre (onglets perdus). Un module survit au
 * remontage d'un composant : le sortir d'ici suffit.
 *
 * LIMITE ASSUMÉE, à ne pas oublier en éditant ce fichier : une mise à jour HMR
 * de CE module lui-même réinitialise l'état. Acceptable — il est petit et
 * rarement édité, et c'est précisément pourquoi l'état de fenêtre doit y vivre
 * plutôt que dans le gros composant.
 */
import { PanelState } from "@/lib/panel-store";
import { createNavStack, type NavStack } from "@/lib/nav-stack";

/** Version RUNTIME du panel — bump à chaque mutation (`PanelState.notify`, via
 *  le callback `onSessionChange`). `PanelState.tabs` n'est pas un `$state`,
 *  cette révision est le pont vers la réactivité Svelte (convention du reste
 *  de l'app, cf. `_panelVersion` de `app.svelte`). */
let panelRev = $state(0);

/** Pile back/forward PAR ONGLET — closure PURE hors runes (une `Map` mutée en
 *  place n'a pas à être `$state` : `stackRev` est le pont de réactivité, comme
 *  `panelRev` pour le panel). Un onglet fermé purge sa pile. */
const navStacks = new Map<string, NavStack>();
let stackRev = $state(0);

/** Page PDF cible par onglet — closure PURE, comme `navStacks` : posée par le
 *  listener `azprose:pdf-rect-navigate`, lue au rendu (`LazyPdfViewer` prop
 *  `page`). */
const pdfPages = new Map<string, number>();

// Piège : PanelState lit localStorage via ContentStore/session — ici construit
// SANS ContentStore ni callbacks de session (comportement actuel, préservé).
// Aucun callback onFileOpen/onError : NAV ne touche jamais à la session ni aux
// notifications de la fenêtre de projet (R1/R3).
const panel = new PanelState("nav", {
  onSessionChange: () => { panelRev++; },
  // Case 3 (matrice, cf. panel-store.ts) : la pile back/forward de l'onglet
  // (et sa page PDF cible) meurent avec lui.
  onTabClosed: (tabId) => { navStacks.delete(tabId); pdfPages.delete(tabId); },
});

function stackFor(tabId: string): NavStack {
  let s = navStacks.get(tabId);
  if (!s) {
    s = createNavStack();
    navStacks.set(tabId, s);
  }
  return s;
}

export const navState = {
  get panelRev() { return panelRev; },
  bumpPanel() { panelRev++; },
  get stackRev() { return stackRev; },
  bumpStack() { stackRev++; },
  panel,
  navStacks,
  pdfPages,
  stackFor,
};
