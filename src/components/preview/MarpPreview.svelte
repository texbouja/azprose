<script lang="ts">
import "mathjax/tex-svg.js";
import { onMount } from "svelte";
import { renderMarp } from "@/lib/marp-render";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";

let { value = "" }: { value?: string } = $props();

let container: HTMLElement;
let styleEl: HTMLStyleElement | null = null;

onMount(() => {
  styleEl = document.createElement("style");
  styleEl.dataset.marp = "";
  document.head.appendChild(styleEl);
  return () => styleEl?.remove();
});

async function typesetMath(el: HTMLElement): Promise<void> {
  const mj = window.MathJax as
    | { startup?: { promise?: Promise<void> }; tex2svgPromise?: (tex: string, opts: { display: boolean }) => Promise<unknown>; typesetPromise?: (els: HTMLElement[]) => Promise<void> }
    | undefined;
  if (!mj?.startup?.promise) return;
  await mj.startup.promise;
  const preamble = mathJaxPreamble.current.trim();
  if (preamble) await mj.tex2svgPromise?.(preamble, { display: true });
  await mj.typesetPromise?.([el]);
}

let result = $derived(renderMarp(value));

$effect(() => {
  if (styleEl) styleEl.textContent = result.css;
});

$effect(() => {
  if (!container) return;
  void typesetMath(container);
});
</script>

<div class="mdv-marp-preview">
  <div class="mdv-marp-preview__slides" bind:this={container}>
    {@html result.html}
  </div>
</div>

<style>
  .mdv-marp-preview {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    background: var(--bg);
    padding: 2rem;
  }

  .mdv-marp-preview__slides {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }

  /* Slides Marp : ratio 16/9 par défaut, largeur bornée */
  .mdv-marp-preview__slides :global(section) {
    width: min(860px, 100%);
    aspect-ratio: 16 / 9;
    box-shadow: 0 2px 12px color-mix(in srgb, var(--fg) 12%, transparent);
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
  }
</style>
