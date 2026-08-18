/**
 * Typeset MathJax on a DOM element.
 * Shared by MarkdownPreview and ColleCard (async import, startup promise, preamble).
 */
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";

type MathJaxGlobal =
  | {
      startup?: {
        promise?: Promise<void>;
        output?: { options?: Record<string, unknown> };
      };
      tex2svgPromise?: (
        tex: string,
        opts: { display: boolean; containerWidth?: number },
      ) => Promise<unknown>;
      typesetPromise?: (els: HTMLElement[]) => Promise<void>;
    }
  | undefined;

export async function typesetMath(el: HTMLElement): Promise<void> {
  const mj = await prepareMathJax();
  if (!mj) return;
  await mj.typesetPromise?.([el]);
}

/**
 * Charge MathJax et joue le préambule du projet — c'est lui qui DÉFINIT les
 * macros de l'utilisateur (`\R`, `\abs`…). Toute composition doit passer par
 * ici, sans quoi une macro maison échouerait.
 */
async function prepareMathJax(): Promise<Exclude<MathJaxGlobal, undefined> | null> {
  await import("mathjax/tex-svg.js");
  const mj = window.MathJax as MathJaxGlobal;
  if (!mj?.startup?.promise) return null;
  await mj.startup.promise;
  const preamble = mathJaxPreamble.current.trim();
  if (preamble) await mj.tex2svgPromise?.(preamble, { display: true });
  return mj;
}

/**
 * Fige la peinture d'une formule destinée à un diagramme.
 *
 * Mermaid injecte sa feuille de style **à l'intérieur** de son SVG, et ses
 * règles atteignent les tracés de la formule : `#mermaid-3 .node path` peint
 * les glyphes du fond des nœuds et les cerne de la couleur des bordures. À
 * l'écran, la feuille de l'aperçu pouvait encore reprendre la main ; sur le
 * papier et à l'export, non — le document imprimé ne reprend pas `preview.css`,
 * d'où des formules cernées ou invisibles (signalé le 2026-08-18).
 *
 * Un style EN LIGNE l'emporte sur toute règle de feuille non `!important`, et
 * Mermaid n'en pose aucune : la peinture voyage donc avec la formule, dans
 * l'aperçu comme à l'impression, sans qu'aucun pipeline ait à la connaître.
 * `currentColor` garde la formule accordée à la couleur du libellé.
 */
function figerPeinture(svg: SVGElement): void {
  for (const el of svg.querySelectorAll<SVGElement>("g, path, rect, use, polygon, line")) {
    // Les messages d'erreur de MathJax gardent LEUR peinture : leur fond est
    // un `<rect>` que repeindre en couleur du texte transformerait en pavé
    // noir couvrant le message — une formule fautive doit rester lisible.
    if (el.closest('[data-mml-node="merror"]')) continue;
    el.style.fill = "currentColor";
    el.style.stroke = "none";
  }
}

/** Une formule composée, prête à être posée dans un document. */
export interface FormuleComposee {
  /** Balisage `<svg>` produit par MathJax. */
  svg: string;
  /** Largeur rendue, en pixels — sert à dimensionner ce qui l'accueille. */
  largeur: number;
  /** Hauteur rendue, en pixels. */
  hauteur: number;
}

/**
 * Compose UNE formule et rend son SVG, avec ses dimensions.
 *
 * Sert aux diagrammes : Mermaid compose les maths de ses libellés en appelant
 * `katex.renderToString`, point d'ancrage détourné vers MathJax (voir
 * `katex-mathjax.ts`) — la composition se fait donc ici, avec le préambule du
 * projet et ses macros.
 *
 * MathJax exprime ses dimensions en `ex` : converties en pixels d'après la
 * taille de police effective, faute de quoi la formule serait dimensionnée
 * pour une autre échelle que celle du diagramme.
 */
export async function composerFormule(
  tex: string,
  options: {
    display?: boolean;
    fontSizePx?: number;
    largeurConteneur?: number;
    /** Sortie destinée à un diagramme Mermaid : glyphes en tracés (survit à
     *  l'assainissement) et peinture figée en style en ligne (survit à la
     *  feuille de style que Mermaid injecte dans son SVG). */
    pourDiagramme?: boolean;
  } = {},
): Promise<FormuleComposee | null> {
  const mj = await prepareMathJax();
  if (!mj?.tex2svgPromise) return null;
  // `containerWidth` très grand + `display` : MathJax 4 coupe les formules pour
  // les faire tenir dans leur conteneur (`<mjx-break>`), et un libellé de
  // diagramme fait une centaine de pixels — la formule y arrivait en deux
  // morceaux. Les deux options ensemble suppriment toute rupture ; mesuré en
  // sonde, l'une sans l'autre ne suffit pas.
  //
  // `fontCache: "none"` pendant la composition : les glyphes sont alors écrits
  // en TRACÉS, au lieu d'être référencés par `<use xlink:href="#…">`. Mermaid
  // assainit les libellés (DOMPurify), ce qui retire les attributs XLink —
  // avec le cache par défaut, les barres de fraction survivaient et les
  // lettres disparaissaient. Le réglage est rendu juste après : il ne vaut que
  // pour cette composition, jamais pour les formules du document.
  const sortie = (mj as { startup?: { output?: { options?: Record<string, unknown> } } })
    .startup?.output?.options;
  const cacheInitial = sortie?.fontCache;
  if (sortie && options.pourDiagramme) sortie.fontCache = "none";
  let noeud: HTMLElement;
  try {
    noeud = (await mj.tex2svgPromise(tex, {
      display: options.display ?? false,
      ...(options.largeurConteneur ? { containerWidth: options.largeurConteneur } : {}),
    })) as HTMLElement;
  } finally {
    if (sortie && options.pourDiagramme) sortie.fontCache = cacheInitial;
  }
  const svg = noeud?.querySelector?.("svg");
  if (!svg) return null;
  if (options.pourDiagramme) figerPeinture(svg);

  // 1 ex ≈ la moitié du corps pour les polices usuelles — approximation
  // assumée : elle ne sert qu'à dimensionner un espace réservé, jamais le
  // rendu lui-même.
  const px = (options.fontSizePx ?? 16) / 2;
  const enPx = (v: string | null) => {
    const n = parseFloat(v ?? "");
    if (!Number.isFinite(n)) return 0;
    return (v ?? "").includes("ex") ? n * px : n;
  };
  return {
    svg: svg.outerHTML,
    largeur: enPx(svg.getAttribute("width")),
    hauteur: enPx(svg.getAttribute("height")),
  };
}
