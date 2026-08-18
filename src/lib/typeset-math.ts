/**
 * Typeset MathJax on a DOM element.
 * Shared by MarkdownPreview and ColleCard (async import, startup promise, preamble).
 */
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";

type MathJaxGlobal =
  | {
      startup?: { promise?: Promise<void> };
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
 * Sert au pont Mermaid : un diagramme ne peut pas composer de mathématiques
 * lui-même sans passer par KaTeX, qui ignore le préambule du projet. On compose
 * donc ici, avec MathJax et ses macros, puis on substitue dans le diagramme.
 *
 * MathJax exprime ses dimensions en `ex` : converties en pixels d'après la
 * taille de police effective, faute de quoi la formule serait dimensionnée
 * pour une autre échelle que celle du diagramme.
 */
export async function composerFormule(
  tex: string,
  options: { display?: boolean; fontSizePx?: number; largeurConteneur?: number } = {},
): Promise<FormuleComposee | null> {
  const mj = await prepareMathJax();
  if (!mj?.tex2svgPromise) return null;
  // `containerWidth` très grand + `display` : MathJax 4 coupe les formules pour
  // les faire tenir dans leur conteneur (`<mjx-break>`), et un libellé de
  // diagramme fait une centaine de pixels — la formule y arrivait en deux
  // morceaux. Les deux options ensemble suppriment toute rupture ; mesuré en
  // sonde, l'une sans l'autre ne suffit pas.
  const noeud = (await mj.tex2svgPromise(tex, {
    display: options.display ?? false,
    ...(options.largeurConteneur ? { containerWidth: options.largeurConteneur } : {}),
  })) as HTMLElement;
  const svg = noeud?.querySelector?.("svg");
  if (!svg) return null;

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
