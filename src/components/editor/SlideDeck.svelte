<script lang="ts">
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import LazyProseMark from "./LazyProseMark.svelte";

let {
  value = "",
  fullscreen = false,
  onExitFullscreen,
}: {
  value?: string;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
} = $props();

// Strip YAML frontmatter (--- ... ---) before splitting slides.
function stripFrontmatter(source: string): string {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) return source;
  const end = source.indexOf("\n---", 4);
  if (end === -1) return source;
  // skip past the closing --- line
  const afterClose = source.indexOf("\n", end + 4);
  return afterClose === -1 ? "" : source.slice(afterClose + 1);
}

function splitSlides(source: string): string[] {
  const body = stripFrontmatter(source);
  return body
    .split(/\n---(?:\n|$)/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

let slides = $derived(splitSlides(value));
let current = $state(0);

$effect(() => {
  if (current >= slides.length && slides.length > 0) {
    current = slides.length - 1;
  }
});

function prev() { if (current > 0) current--; }
function next() { if (current < slides.length - 1) current++; }

function onKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "Escape" && fullscreen) {
    e.preventDefault();
    onExitFullscreen?.();
  } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
    e.preventDefault();
    next();
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    prev();
  }
}
</script>

<svelte:window onkeydown={onKeyDown} />

<!-- position: absolute fills .mdv-shell__editor-solo (position: relative) regardless
     of its overflow: auto, which would break height: 100% on a normal child. -->
<div class="mdv-slidedeck" class:is-fullscreen={fullscreen}>
  <div class="mdv-slidedeck__content">
    {#if slides.length > 0}
      <LazyProseMark value={slides[current]} readOnly />
    {:else}
      <div class="mdv-slidedeck__empty">Aucune diapositive — séparez les sections avec <code>---</code>.</div>
    {/if}
  </div>

  <div class="mdv-slidedeck__nav">
    <button
      type="button"
      class="mdv-slidedeck__nav-btn"
      disabled={current === 0}
      onclick={prev}
      aria-label="Diapositive précédente"
    >
      <Icon icon={ChevronLeft} size={16} strokeWidth={1.8} />
    </button>
    <span class="mdv-slidedeck__counter">{slides.length > 0 ? current + 1 : 0} / {slides.length}</span>
    <button
      type="button"
      class="mdv-slidedeck__nav-btn"
      disabled={current === slides.length - 1}
      onclick={next}
      aria-label="Diapositive suivante"
    >
      <Icon icon={ChevronRight} size={16} strokeWidth={1.8} />
    </button>
  </div>
</div>

<style>
  .mdv-slidedeck {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    transition: none;
  }

  .mdv-slidedeck.is-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 9999;
  }

  .mdv-slidedeck__content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* Prevent ProseMark from revealing syntax markup on click/hover in read-only mode. */
  .mdv-slidedeck__content :global(.cm-editor) {
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .mdv-slidedeck__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .mdv-slidedeck__nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 36px;
    border-top: 1px solid var(--border);
    background: var(--bg);
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
    color: var(--muted);
    cursor: pointer;
    transition: color 120ms, background 120ms;
  }

  .mdv-slidedeck__nav-btn:hover:not(:disabled) {
    color: var(--fg);
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .mdv-slidedeck__nav-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .mdv-slidedeck__counter {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--muted);
    min-width: 50px;
    text-align: center;
  }
</style>
