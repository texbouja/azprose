<script lang="ts">
import "mathjax/tex-svg.js";
import { onMount } from "svelte";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import { renderMarp } from "@/lib/marp-render";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";

let {
  value = "",
  fullscreen = false,
  onExitFullscreen,
}: {
  value?: string;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
} = $props();

let container: HTMLElement;
let styleEl: HTMLStyleElement | null = null;
let current = $state(0);

let result = $derived(renderMarp(value));

onMount(() => {
  styleEl = document.createElement("style");
  styleEl.dataset.marpDeck = "";
  document.head.appendChild(styleEl);
  return () => styleEl?.remove();
});

$effect(() => {
  if (styleEl) styleEl.textContent = result.css;
});

// Show only the current slide, hide others.
$effect(() => {
  if (!container) return;
  const sections = Array.from(container.querySelectorAll<HTMLElement>("section"));
  sections.forEach((s, i) => { s.style.display = i === current ? "" : "none"; });
  void typesetMath(container);
});

// Clamp current index when slide count changes.
$effect(() => {
  if (current >= result.slideCount && result.slideCount > 0) {
    current = result.slideCount - 1;
  }
});

function prev() { if (current > 0) current--; }
function next() { if (current < result.slideCount - 1) current++; }

function onKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "Escape" && fullscreen) {
    e.preventDefault();
    onExitFullscreen?.();
  } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
    e.preventDefault(); next();
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault(); prev();
  }
}

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
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="mdv-marpdeck" class:is-fullscreen={fullscreen}>
  <div class="mdv-marpdeck__slide" bind:this={container}>
    {@html result.html}
  </div>

  <div class="mdv-marpdeck__nav">
    <button
      type="button"
      class="mdv-slidedeck__nav-btn"
      disabled={current === 0}
      onclick={prev}
      aria-label="Diapositive précédente"
    >
      <Icon icon={ChevronLeft} size={16} strokeWidth={1.8} />
    </button>
    <span class="mdv-slidedeck__counter">
      {result.slideCount > 0 ? current + 1 : 0} / {result.slideCount}
    </span>
    <button
      type="button"
      class="mdv-slidedeck__nav-btn"
      disabled={current === result.slideCount - 1}
      onclick={next}
      aria-label="Diapositive suivante"
    >
      <Icon icon={ChevronRight} size={16} strokeWidth={1.8} />
    </button>
  </div>
</div>

<style>
  .mdv-marpdeck {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #000;
  }

  .mdv-marpdeck.is-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 9999;
  }

  .mdv-marpdeck__slide {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Marp section fills the slide area */
  .mdv-marpdeck__slide :global(section) {
    width: 100%;
    height: 100%;
    max-width: calc(100vh * 16 / 9);
    max-height: calc(100vw * 9 / 16);
  }

  .mdv-marpdeck__nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 36px;
    background: #111;
    flex-shrink: 0;
  }

  .mdv-slidedeck__nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #888;
    cursor: pointer;
    transition: color 120ms, background 120ms;
  }

  .mdv-slidedeck__nav-btn:hover:not(:disabled) {
    color: #fff;
    background: rgba(255,255,255,0.1);
  }

  .mdv-slidedeck__nav-btn:disabled { opacity: 0.25; cursor: default; }

  .mdv-slidedeck__counter {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: #888;
    min-width: 50px;
    text-align: center;
  }
</style>
