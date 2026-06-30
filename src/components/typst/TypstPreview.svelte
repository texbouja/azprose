<script lang="ts">
  import { tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { Diagnostic } from "@/lib/diagnostics";

  let {
    value = "",
    filePath = "",
    initialSvg = null as string | null,
    initialCompiledSource = null as string | null,
    onCompileResult,
    initialDiags = [] as Diagnostic[],
  }: {
    value?: string;
    filePath?: string;
    initialSvg?: string | null;
    initialCompiledSource?: string | null;
    onCompileResult?: (svg: string | null, diags: Diagnostic[], compiledSource: string) => void;
    initialDiags?: Diagnostic[];
  } = $props();

  interface TypstPreviewResult {
    svg: string | null;
    diagnostics: Diagnostic[];
    pages: number;
  }

  let lastSvg = $state<string | null>(initialSvg);
  let compiling = $state(false);
  let hasError = $state(false);
  let errorCount = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastCompiledSource: string | null = initialCompiledSource;
  let hasValidSvg = initialSvg !== null;
  let lastDiags: Diagnostic[] = initialDiags;
  let reportedCacheHit = false;
  let scrollEl = $state<HTMLElement | null>(null);
  let savedScrollTop = 0;

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.25;
  let fitWidth = $state(true);
  let zoom = $state(1.0);

  function zoomIn() {
    if (fitWidth) { fitWidth = false; zoom = 1.0; }
    zoom = Math.min(ZOOM_MAX, parseFloat((zoom + ZOOM_STEP).toFixed(2)));
  }
  function zoomOut() {
    fitWidth = false;
    zoom = Math.max(ZOOM_MIN, parseFloat((zoom - ZOOM_STEP).toFixed(2)));
  }
  function toggleFitWidth() {
    fitWidth = !fitWidth;
  }

  $effect(() => {
    const text = value;
    const path = filePath;
    if (!path) return;

    if (hasValidSvg && text === lastCompiledSource) {
      if (!reportedCacheHit) {
        reportedCacheHit = true;
        onCompileResult?.(lastSvg, lastDiags, text);
      }
      return;
    }
    reportedCacheHit = false;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const hadValidSvg = hasValidSvg;
      if (hadValidSvg && scrollEl) savedScrollTop = scrollEl.scrollTop;
      compiling = true;
      try {
        const result = await invoke<TypstPreviewResult>("typst_preview", {
          filePath: path,
          source: text,
        });
        if (result.svg !== null) {
          lastSvg = result.svg;
          hasValidSvg = true;
          hasError = false;
          errorCount = 0;
          await tick();
          if (hadValidSvg && scrollEl) scrollEl.scrollTop = savedScrollTop;
        } else {
          hasError = true;
          errorCount = (result.diagnostics ?? []).filter((d) => d.severity === "error").length || 1;
        }
        lastCompiledSource = text;
        lastDiags = result.diagnostics ?? [];
        reportedCacheHit = false;
        onCompileResult?.(result.svg, lastDiags, text);
      } catch (err) {
        hasError = true;
        errorCount = 1;
        onCompileResult?.(null, [{ severity: "error", message: `${err}` }], text);
      } finally {
        compiling = false;
      }
    }, 300);

    return () => { if (debounceTimer) clearTimeout(debounceTimer); };
  });
</script>

<div class="typst-preview">
  {#if !lastSvg && compiling}
    <div class="typst-preview__loading">Compilation…</div>
  {:else}
    <div class="typst-preview__toolbar" aria-label="Zoom controls">
      <button type="button" class="typst-preview__zoom-btn" onclick={zoomOut} aria-label="Zoom out" disabled={fitWidth && zoom <= ZOOM_MIN}>−</button>
      <button type="button" class="typst-preview__zoom-level" onclick={toggleFitWidth} title={fitWidth ? "Switch to fixed zoom" : "Fit width"}>
        {fitWidth ? "fit" : `${Math.round(zoom * 100)}%`}
      </button>
      <button type="button" class="typst-preview__zoom-btn" onclick={zoomIn} aria-label="Zoom in" disabled={!fitWidth && zoom >= ZOOM_MAX}>+</button>
      {#if compiling}
        <span class="typst-preview__spinner" aria-label="Updating…"></span>
      {/if}
    </div>
    {#if hasError}
      <div
        class="typst-preview__error-bar"
        class:is-stale={lastSvg !== null}
        title="Voir la console Diagnostics pour le détail"
      >
        <span class="typst-preview__error-glyph" aria-hidden="true">⚠</span>
        {#if lastSvg !== null}
          {errorCount} erreur{errorCount > 1 ? "s" : ""} · dernier rendu valide affiché
        {:else}
          erreur de compilation
        {/if}
      </div>
    {/if}
    {#if lastSvg}
      <div class="typst-preview__scroll" bind:this={scrollEl}>
        <div
          class="typst-preview__canvas"
          class:is-fit={fitWidth}
          style={fitWidth ? undefined : `zoom: ${zoom}`}
        >
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html lastSvg}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .typst-preview {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg, #fff);
  }

  .typst-preview__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted, #888);
    font-size: 0.875rem;
  }

  .typst-preview__toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border, #e5e7eb);
    background: var(--surface, #f9fafb);
    flex-shrink: 0;
  }

  .typst-preview__zoom-btn {
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--fg, #374151);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s;
  }

  .typst-preview__zoom-btn:hover:not(:disabled) {
    background: var(--surface-hover, #e5e7eb);
  }

  .typst-preview__zoom-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .typst-preview__zoom-level {
    min-width: 40px;
    height: 22px;
    padding: 0 4px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted, #6b7280);
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-align: center;
    transition: background 0.1s, color 0.1s;
  }

  .typst-preview__zoom-level:hover {
    background: var(--surface-hover, #e5e7eb);
    color: var(--fg, #374151);
  }

  .typst-preview__spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid transparent;
    border-top-color: var(--accent, #6366f1);
    border-radius: 50%;
    animation: typst-spin 0.7s linear infinite;
    flex-shrink: 0;
    margin-left: 4px;
  }

  @keyframes typst-spin {
    to { transform: rotate(360deg); }
  }

  .typst-preview__error-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: var(--color-error, #b91c1c);
    background: var(--color-error-bg, #fee2e2);
    border-bottom: 1px solid var(--color-error-border, #fca5a5);
  }

  /* When a previous valid render is still shown, soften to an amber "stale" hint
     rather than a hard error — the preview below is just out of date. */
  .typst-preview__error-bar.is-stale {
    color: var(--color-warning, #92400e);
    background: var(--color-warning-bg, #fef3c7);
    border-bottom-color: var(--color-warning-border, #fde68a);
  }

  .typst-preview__error-glyph {
    font-size: 12px;
    line-height: 1;
  }

  .typst-preview__scroll {
    flex: 1;
    overflow: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* Dim the stale render slightly so it's clear it's not the current source. */
  .typst-preview__error-bar.is-stale ~ .typst-preview__scroll {
    opacity: 0.55;
    transition: opacity 0.15s;
  }

  .typst-preview__canvas.is-fit {
    width: 100%;
  }

  .typst-preview__canvas.is-fit :global(svg) {
    width: 100%;
    height: auto;
    display: block;
    margin-bottom: 1rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  .typst-preview__canvas:not(.is-fit) {
    transform-origin: top center;
  }

  .typst-preview__canvas:not(.is-fit) :global(svg) {
    display: block;
    margin-bottom: 1rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }
</style>
