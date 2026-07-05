<script lang="ts">
  import { tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { Diagnostic } from "@/lib/diagnostics";
  import { diagnosticsStore } from "@/stores/diagnostics.svelte";
  import { ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight } from "@/lib/icons";
  import { Icon } from "@/components/primitives";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";

  let t = $derived(getT($language));

  interface TypstPreviewResult {
    pages_svg: string[];
    diagnostics: Diagnostic[];
    pages: number;
  }

  interface ForwardTarget {
    page: number;
    x: number;
    y: number;
  }

  let {
    value = "",
    filePath = "",
    initialSvg = null as string | null,
    initialCompiledSource = null as string | null,
    onCompileResult,
    initialDiags = [] as Diagnostic[],
    onToggleFullscreen,
    onInverseSync,
    forwardTo = null as ForwardTarget | null,
  }: {
    value?: string;
    filePath?: string;
    initialSvg?: string | null;
    initialCompiledSource?: string | null;
    onCompileResult?: (svg: string | null, diags: Diagnostic[], compiledSource: string) => void;
    initialDiags?: Diagnostic[];
    onToggleFullscreen?: () => void;
    onInverseSync?: (file: string, line: number) => void;
    forwardTo?: ForwardTarget | null;
  } = $props();

  let pagesSvg = $state<string[]>(initialSvg !== null ? [initialSvg] : []);
  let pendingPages: string[] = [];
  let progressiveRAF: number | null = null;
  let currentPages = $state(0);
  let compiling = $state(false);
  let hasError = $state(false);
  let errorCount = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let hasValidSvg = initialSvg !== null;
  let lastDiags: Diagnostic[] = initialDiags;
  let scrollEl = $state<HTMLElement | null>(null);
  let savedScrollTop = 0;
  let shellEl = $state<HTMLElement | null>(null);
  let toolbarEl = $state<HTMLElement | null>(null);
  let toolbarVisible = $state(false);

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.25;
  let fitWidth = $state(true);
  let zoom = $state(1.0);
  let currentPage = $state(0);

  function goPrev() {
    if (currentPage > 0) {
      currentPage--;
      scrollToPage(currentPage);
    }
  }

  function goNext() {
    if (currentPage < pagesSvg.length - 1) {
      currentPage++;
      scrollToPage(currentPage);
    }
  }

  function scrollToPage(idx: number) {
    if (!scrollEl) return;
    const el = scrollEl.querySelector(`[data-page="${idx}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "PageUp") { e.preventDefault(); goPrev(); }
    if (e.key === "PageDown") { e.preventDefault(); goNext(); }
  }

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

  function showToolbar() { toolbarVisible = true; }
  function hideToolbar() { toolbarVisible = false; }

  $effect(() => {
    if (!shellEl || !toolbarEl) return;
    const zone = document.createElement("div");
    zone.className = "typst-preview__hover-zone";
    zone.style.cssText = "position:absolute;top:0;left:0;right:0;height:40px;z-index:19;pointer-events:auto";
    shellEl.appendChild(zone);
    zone.onmouseenter = showToolbar;
    const onLeave = () => {
      setTimeout(() => { if (!toolbarEl?.matches(":hover")) hideToolbar(); }, 200);
    };
    zone.onmouseleave = onLeave;
    toolbarEl.addEventListener("mouseleave", onLeave);
    return () => { zone.remove(); };
  });

  // Compile on source change
  $effect(() => {
    const text = value;
    const path = filePath;
    if (!path || !text) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    const isInitial = !hasValidSvg;
    const delay = isInitial ? 1000 : 300;

    if (isInitial && document.hidden) {
      const onVisible = () => {
        document.removeEventListener("visibilitychange", onVisible);
        debounceTimer = setTimeout(doCompile, delay);
      };
      document.addEventListener("visibilitychange", onVisible, { once: true });
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        if (debounceTimer) clearTimeout(debounceTimer);
        if (progressiveRAF !== null) { cancelAnimationFrame(progressiveRAF); progressiveRAF = null; }
      };
    }

    debounceTimer = setTimeout(doCompile, delay);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (progressiveRAF !== null) { cancelAnimationFrame(progressiveRAF); progressiveRAF = null; }
    };
  });

  async function doCompile() {
    const text = value;
    const path = filePath;
    if (!path || !text) return;
    const hadValidSvg = hasValidSvg;
    if (hadValidSvg && scrollEl) savedScrollTop = scrollEl.scrollTop;
    if (progressiveRAF !== null) { cancelAnimationFrame(progressiveRAF); progressiveRAF = null; }
    compiling = true;
    try {
      const result = await invoke<TypstPreviewResult>("typst_preview", {
        filePath: path,
        source: text,
      });
      if (result.pages_svg.length > 0) {
        currentPages = result.pages;
        if (currentPage >= result.pages) currentPage = 0;
        hasValidSvg = true;
        hasError = false;
        errorCount = 0;
        pendingPages = result.pages_svg;
        startProgressiveRender(hadValidSvg);
      } else {
        hasError = true;
        errorCount = (result.diagnostics ?? []).filter((d) => d.severity === "error").length || 1;
      }
      lastDiags = result.diagnostics ?? [];
      diagnosticsStore.set("typst", lastDiags);
      const mergedSvg = result.pages_svg.length > 0 ? result.pages_svg[0] : null;
      onCompileResult?.(mergedSvg, lastDiags, text);
    } catch (err) {
      hasError = true;
      errorCount = 1;
      const diags = [{ severity: "error" as const, message: `${err}` }];
      diagnosticsStore.set("typst", diags);
      onCompileResult?.(null, diags, text);
    } finally {
      compiling = false;
    }
  }

  function startProgressiveRender(restoreScroll: boolean) {
    const total = pendingPages.length;
    let idx = 0;
    const renderNext = () => {
      if (idx >= total) return;
      pagesSvg = pendingPages.slice(0, idx + 1);
      if (restoreScroll && idx === 0) {
        tick().then(() => {
          if (scrollEl) scrollEl.scrollTop = savedScrollTop;
        });
      }
      idx++;
      if (idx < total) {
        progressiveRAF = requestAnimationFrame(renderNext);
      } else {
        progressiveRAF = null;
      }
    };
    progressiveRAF = requestAnimationFrame(renderNext);
  }

  // ── Inverse sync: handle click on SVG page ──

  async function onSvgClick(e: MouseEvent, pageIdx: number) {
    if (!onInverseSync) return;
    const svg = (e.currentTarget as HTMLElement).querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgW = parseFloat(svg.getAttribute("width") || "0");
    const svgH = parseFloat(svg.getAttribute("height") || "0");
    if (!svgW || !svgH) return;
    const scaleX = svgW / rect.width;
    const scaleY = svgH / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    try {
      const pos = await invoke<{ line: number; col: number } | null>("typst_resolve_span", {
        filePath,
        source: value,
        page: pageIdx,
        x,
        y,
      });
      if (pos) {
        onInverseSync(filePath, pos.line);
      }
    } catch (err) {
      console.error("azprose: typst_resolve_span failed", err);
    }
  }

  // ── Forward sync: scroll to target ──

  $effect(() => {
    if (forwardTo) {
      scrollToPage(forwardTo.page);
    }
  });

  $effect(() => {
    const el = shellEl;
    if (!el) return;
    el.addEventListener("keydown", onKeydown);
    return () => el.removeEventListener("keydown", onKeydown);
  });


</script>

<div class="typst-preview" bind:this={shellEl} tabindex="-1">

  <!-- ── Top hover toolbar ── -->
  <header class="typst-preview__topbar" bind:this={toolbarEl} class:is-hidden={!toolbarVisible}>
    <div class="typst-preview__topbar-section">
      {#if compiling}
        <span class="typst-preview__spinner" aria-label={t("pdf.loading")} />
      {:else}
        <span class="typst-preview__status-ok" title={t("pdf.loading")}>✓</span>
      {/if}
      {#if currentPages > 1}
        <span class="typst-preview__vsep"></span>
        <button class="typst-preview__btn" title="Previous page" onclick={goPrev} disabled={currentPage <= 0}>
          <Icon icon={ChevronLeft} size={14} strokeWidth={1.6} />
        </button>
        <span class="typst-preview__pager">{currentPage + 1}/{currentPages}</span>
        <button class="typst-preview__btn" title="Next page" onclick={goNext} disabled={currentPage >= pagesSvg.length - 1}>
          <Icon icon={ChevronRight} size={14} strokeWidth={1.6} />
        </button>
        <span class="typst-preview__vsep"></span>
      {/if}
    </div>
    <div class="typst-preview__topbar-section typst-preview__topbar-right">
      <button class="typst-preview__btn" title={t("pdf.zoomOut")} onclick={zoomOut}>
        <Icon icon={ZoomOut} size={14} strokeWidth={1.6} />
      </button>
      <span
        class="typst-preview__scale-chip"
        role="button"
        tabindex="0"
        onclick={toggleFitWidth}
        onkeydown={(e) => { if (e.key === "Enter") toggleFitWidth(); }}
      >
        {fitWidth ? "\u00A0 fit \u00A0" : `${Math.round(zoom * 100)}%`}
      </span>
      <button class="typst-preview__btn" title={t("pdf.zoomIn")} onclick={zoomIn}>
        <Icon icon={ZoomIn} size={14} strokeWidth={1.6} />
      </button>
      <div class="typst-preview__vsep"></div>
      <button class="typst-preview__btn" title={t("pdf.fitWidth")} onclick={toggleFitWidth}>
        <Icon icon={Maximize2} size={13} strokeWidth={1.6} />
      </button>
      <div class="typst-preview__vsep"></div>
      <button class="typst-preview__btn" title="Fullscreen" onclick={() => onToggleFullscreen?.()}>
        <Icon icon={Maximize2} size={14} strokeWidth={1.6} />
      </button>
    </div>
  </header>

  <!-- ── Loading overlay (first compile) ── -->
  {#if pagesSvg.length === 0 && compiling}
    <div class="typst-preview__overlay">
      <span class="typst-preview__loading-text">Compiling…</span>
    </div>
  {:else if pagesSvg.length === 0 && hasError}
    <div class="typst-preview__overlay typst-preview__error-overlay">
      <p>{errorCount} error{errorCount > 1 ? "s" : ""}</p>
    </div>
  {:else}

    <!-- ── Stale-error bar ── -->
    {#if hasError}
      <div class="typst-preview__error-bar" class:is-stale={pagesSvg.length > 0}>
        <span class="typst-preview__error-glyph" aria-hidden="true">⚠</span>
        {#if pagesSvg.length > 0}
          {errorCount} error{errorCount > 1 ? "s" : ""} · stale preview shown
        {:else}
          compilation error
        {/if}
      </div>
    {/if}

    <!-- ── Page SVGs ── -->
    <div class="typst-preview__scroll" bind:this={scrollEl}>
      {#each pagesSvg as svg, pageIdx (pageIdx)}
        <div
          class="typst-preview__page"
          class:is-fit={fitWidth}
          data-page={pageIdx}
          style={fitWidth ? undefined : `zoom: ${zoom}`}
          aria-label={`Page ${pageIdx + 1}`}
          role="button"
          tabindex="0"
          onclick={(e) => onSvgClick(e, pageIdx)}
          onkeydown={(e) => { if (e.key === "Enter") onSvgClick(e as unknown as MouseEvent, pageIdx); }}
        >
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html svg}
        </div>
      {/each}
    </div>

  {/if}
</div>

<style>
  .typst-preview {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg, #fff);
    position: relative;
  }

  .typst-preview__topbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 8px;
    gap: 4px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-ui);
    pointer-events: auto;
  }

  .typst-preview__topbar.is-hidden {
    display: none;
  }

  .typst-preview__topbar-section {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .typst-preview__topbar-right {
    margin-left: auto;
  }

  .typst-preview__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
  }

  .typst-preview__btn:hover {
    background: color-mix(in srgb, var(--fg) 12%, transparent);
    color: var(--fg);
  }

  .typst-preview__btn:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .typst-preview__btn:disabled {
    opacity: 0.3;
    cursor: default;
    pointer-events: none;
  }

  .typst-preview__scale-chip {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--muted, #6b7280);
    cursor: pointer;
    padding: 0 4px;
    min-width: 36px;
    text-align: center;
    line-height: 22px;
    border-radius: 4px;
    transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
    user-select: none;
  }

  .typst-preview__scale-chip:hover {
    background: color-mix(in srgb, var(--fg) 12%, transparent);
    color: var(--fg);
  }

  .typst-preview__vsep {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 6px;
    flex-shrink: 0;
  }

  .typst-preview__pager {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    padding: 0 2px;
    min-width: 32px;
    text-align: center;
    line-height: 22px;
    letter-spacing: 0.02em;
    user-select: none;
  }

  .typst-preview__spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid transparent;
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: typst-spin 0.7s linear infinite;
    display: inline-block;
  }

  @keyframes typst-spin {
    to { transform: rotate(360deg); }
  }

  .typst-preview__status-ok {
    font-size: 12px;
    line-height: 1;
    color: var(--accent);
    opacity: 0.6;
  }

  .typst-preview__overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .typst-preview__loading-text {
    color: var(--color-text-muted, #888);
    font-size: 0.875rem;
  }

  .typst-preview__error-overlay {
    color: var(--color-error);
  }

  .typst-preview__error-overlay p {
    font-size: 0.875rem;
    font-weight: 600;
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

  .typst-preview__page {
    width: 100%;
    content-visibility: auto;
    contain-intrinsic-size: 800px 1100px;
    cursor: pointer;
  }

  .typst-preview__page.is-fit :global(svg) {
    width: 100%;
    height: auto;
    display: block;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  .typst-preview__page:not(.is-fit) {
    transform-origin: top center;
  }

  .typst-preview__page:not(.is-fit) :global(svg) {
    display: block;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  .typst-preview__error-bar.is-stale ~ .typst-preview__scroll {
    opacity: 0.55;
    transition: opacity 0.15s;
  }
</style>
