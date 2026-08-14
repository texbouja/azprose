/**
 * Typeset MathJax on a DOM element.
 * Shared by MarkdownPreview and ColleCard (async import, startup promise, preamble).
 */
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";

type MathJaxGlobal =
  | {
      startup?: { promise?: Promise<void> };
      tex2svgPromise?: (tex: string, opts: { display: boolean }) => Promise<unknown>;
      typesetPromise?: (els: HTMLElement[]) => Promise<void>;
    }
  | undefined;

export async function typesetMath(el: HTMLElement): Promise<void> {
  await import("mathjax/tex-svg.js");
  const mj = window.MathJax as MathJaxGlobal;
  if (!mj?.startup?.promise) return;
  await mj.startup.promise;
  const preamble = mathJaxPreamble.current.trim();
  if (preamble) await mj.tex2svgPromise?.(preamble, { display: true });
  await mj.typesetPromise?.([el]);
}
