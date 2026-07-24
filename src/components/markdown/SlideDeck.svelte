<script lang="ts">
import { onDestroy } from "svelte";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import { renderMarkdown, ensurePreviewReady, makeCalloutsCollapsible, updateCalloutIcons, stripAutoCalloutTitles, postRenderDom } from "@/markdown";
import { collectRenderDiagnostics, clearRenderDiagnostics } from "@/lib/render-diagnostics";
import { subscribeMode, type Theme } from "@/lib/theme";

let t = $derived(getT($language));
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { slideSession } from "@/stores/slide-session.svelte";
import { presentationSettings, resolveFontFamily, resolveMonoFont, resolveHeadingFont, type PresentationStyle } from "@/stores/markdown-settings.svelte";
import { calloutSettings, generateCalloutCss } from "@/stores/callout-settings.svelte";
import { getRootPath } from "@/stores/root-path.svelte";

let {
  value = "",
  filePath = null as string | null,
  fullscreen = false,
  onExitFullscreen,
}: {
  value?: string;
  filePath?: string | null;
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
} = $props();

let stageEl: HTMLElement;
let current = $state(0);
let ready = $state(false);
let slidesHtml = $state<string[]>([]);
let pages = $state<string[]>([]);
let zoom = $state(100);

// ── Math cache: preserve MathJax SVGs across re-renders ──────────────────
const mathCache = new Map<string, string>();
let lastPreamble = "";

function extractMathFromDom(el: HTMLElement): void {
  for (const node of el.querySelectorAll<HTMLElement>("[data-math-source]")) {
    const source = node.getAttribute("data-math-source");
    if (source && node.innerHTML.includes("mjx-container")) {
      mathCache.set(source, node.outerHTML);
    }
  }
}

function injectCachedMath(dom: HTMLElement): void {
  for (const node of dom.querySelectorAll<HTMLElement>("[data-math-source]")) {
    const source = node.getAttribute("data-math-source");
    if (!source) continue;
    const cached = mathCache.get(source);
    if (cached) node.outerHTML = cached;
  }
}

// ── Callout state cache ───────────────────────────────────────────────────
const calloutStateCache = new Map<string, boolean>();

function extractCalloutState(el: HTMLElement): void {
  calloutStateCache.clear();
  const counters = new Map<string, number>();
  for (const d of el.querySelectorAll<HTMLDetailsElement>("details.callout")) {
    const type = d.dataset.callout ?? "";
    const idx = counters.get(type) ?? 0;
    counters.set(type, idx + 1);
    calloutStateCache.set(`${type}#${idx}`, d.open);
  }
}

function restoreCalloutState(el: HTMLElement): void {
  const counters = new Map<string, number>();
  for (const d of el.querySelectorAll<HTMLDetailsElement>("details.callout")) {
    const type = d.dataset.callout ?? "";
    const idx = counters.get(type) ?? 0;
    counters.set(type, idx + 1);
    const key = `${type}#${idx}`;
    if (calloutStateCache.has(key)) {
      d.open = calloutStateCache.get(key)!;
    }
  }
}

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

function zoomIn() {
  const i = ZOOM_STEPS.indexOf(zoom);
  zoom = i < 0 ? 100 : ZOOM_STEPS[Math.min(i + 1, ZOOM_STEPS.length - 1)];
}

function zoomOut() {
  const i = ZOOM_STEPS.indexOf(zoom);
  zoom = i < 0 ? 100 : ZOOM_STEPS[Math.max(i - 1, 0)];
}

let appTheme = $state<Theme>(
  (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte",
);
$effect(() =>
  subscribeMode(() => {
    appTheme = (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte";
  }),
);

$effect(() => {
  let cancelled = false;
  void ensurePreviewReady().then(() => { if (!cancelled) ready = true; });
  return () => { cancelled = true; };
});

function stripFrontmatter(source: string): string {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) return source;
  const end = source.indexOf("\n---", 4);
  if (end === -1) return source;
  const afterClose = source.indexOf("\n", end + 4);
  return afterClose === -1 ? "" : source.slice(afterClose + 1);
}
function splitSlides(source: string): string[] {
  return stripFrontmatter(source)
    .split(/\n---(?:\n|$)/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

let slideTexts = $derived(splitSlides(value));

$effect(() => {
  if (current >= pages.length && pages.length > 0) {
    current = pages.length - 1;
  }
});

$effect(() => {
  pages = [...slideTexts];
});

$effect(() => {
  if (!ready) return;
  const currentPages = pages;
  const theme = appTheme;
  let cancelled = false;

  // Cache old math SVGs and callout state before re-rendering
  if (stageEl) {
    extractMathFromDom(stageEl);
    extractCalloutState(stageEl);
  }

  // Track preamble changes
  const p = mathJaxPreamble.current.trim();
  if (p !== lastPreamble) {
    lastPreamble = p;
    mathCache.clear();
  }

  // Update callout icons from current settings before rendering
  updateCalloutIcons(calloutSettings.current);

  const fp = filePath ?? undefined;
  const rp = getRootPath() ?? undefined;
  void Promise.all(currentPages.map((t) => renderMarkdown(t, theme, fp, rp))).then(async (results) => {
    if (cancelled) return;
    slidesHtml = results.map(r => {
      const tmp = document.createElement("div");
      tmp.innerHTML = r.html;
      stripAutoCalloutTitles(tmp);
      makeCalloutsCollapsible(tmp);
      injectCachedMath(tmp);
      return tmp.innerHTML;
    });
    await Promise.resolve();
    if (!cancelled && stageEl) {
      restoreCalloutState(stageEl);
      await hydrate(stageEl);
    }
  });

  return () => { cancelled = true; };
});

async function hydrate(stage: HTMLElement): Promise<void> {
  const sections = Array.from(stage.querySelectorAll<HTMLElement>(".azp-slide__content"));
  let broken: string[] = [];
  if (filePath) {
    const results = await Promise.all(sections.map((s) => postRenderDom(s, { filePath, rootPath: getRootPath() ?? undefined })));
    broken = results.flatMap(r => r.brokenImages);
  }
  await import("mathjax/tex-svg.js");
  const mj = window.MathJax as
    | { startup?: { promise?: Promise<void> }; tex2svgPromise?: (tex: string, opts: { display: boolean }) => Promise<unknown>; typesetPromise?: (els: HTMLElement[]) => Promise<void> }
    | undefined;
  if (mj?.startup?.promise) {
    await mj.startup.promise;
    const preamble = mathJaxPreamble.current.trim();
    if (preamble) await mj.tex2svgPromise?.(preamble, { display: true });
    await mj.typesetPromise?.(sections);
  }
  collectRenderDiagnostics(stage, broken);
}

onDestroy(() => clearRenderDiagnostics());

$effect(() => {
  const s = presentationSettings.current;
  const head = (n: 1 | 2 | 3) => {
    const size = s[`h${n}Size`] as number;
    const align = s[`h${n}Align`] as string;
    const font = resolveHeadingFont(s[`h${n}FontFamily`] as PresentationStyle["h1FontFamily"], s[`h${n}CustomFontName`] as string);
    const mt = s[`h${n}MarginTop`] as number;
    const mb = s[`h${n}MarginBottom`] as number;
    return `.azp-slide .azp-slide__content h${n}{font-size:${size}em !important;text-align:${align} !important;font-family:${font} !important;margin:${mt}em 0 ${mb}em !important;}`;
  };
  const fontFamily = resolveFontFamily(s.fontFamily, s.customFontName);
  const monoFont  = resolveMonoFont(s.monoFont);
  const css = [
    `.azp-slide .azp-slide__content{font-family:${fontFamily};font-size:${s.fontSize}px;line-height:${s.lineHeight};}`,
    `.azp-slide .azp-slide__content code,.azp-slide .azp-slide__content pre{font-family:${monoFont};}`,
    head(1), head(2), head(3),
    s.customCss,
  ].join("\n");
  let el = document.getElementById("azp-slide-style") as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = "azp-slide-style"; document.head.appendChild(el); }
  el.textContent = css;
  return () => { document.getElementById("azp-slide-style")?.remove(); };
});

$effect(() => {
  const css = generateCalloutCss(calloutSettings.current);
  const el = document.createElement("style");
  el.id = "azp-slide-callout-css";
  el.textContent = css;
  document.head.appendChild(el);
  return () => el.remove();
});

function prev() { if (current > 0) current--; }
function next() { if (current < pages.length - 1) current++; }

function goToPage(e: Event): void {
  const input = e.target as HTMLInputElement;
  const page = parseInt(input.value, 10);
  if (page >= 1 && page <= pages.length) {
    current = page - 1;
  }
}

function onKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    if (e.key === "Enter" && tag === "INPUT") {
      const input = e.target as HTMLInputElement;
      if (input.classList.contains("mdv-slidedeck__goto")) {
        goToPage(e);
      }
    }
    return;
  }
  if (e.key === "Escape" && fullscreen) {
    e.preventDefault();
    onExitFullscreen?.();
  } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
    e.preventDefault(); next();
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault(); prev();
  }
}

// ── Zoom commands from TabActions ───────────────────────────────

$effect(() => {
  const handler = (e: Event) => {
    const { cmd } = (e as CustomEvent).detail;
    if (cmd === "zoom-in") zoomIn();
    else if (cmd === "zoom-out") zoomOut();
    else if (cmd === "zoom-reset") zoom = 100;
  };
  window.addEventListener("azprose:viewer-command", handler);
  return () => window.removeEventListener("azprose:viewer-command", handler);
});
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="mdv-slidedeck" class:is-fullscreen={fullscreen} style={zoom !== 100 ? `zoom: ${zoom / 100}` : ""}>
  <div class="mdv-slidedeck__stage" bind:this={stageEl}
    style="--slide-aspect: {slideSession.mode === '16:9' ? '16/9' : '4/3'}"
  >
    {#if pages.length === 0}
      <div class="mdv-slidedeck__empty">
        {@html t("slideDeck.empty")}
      </div>
    {:else}
      {#each slidesHtml as html, i (i)}
        <section
          class="azp-slide"
          hidden={i !== current}
        >
          <div class="azp-slide__content">
            {@html html}
          </div>
        </section>
      {/each}
    {/if}
  </div>

  <div class="mdv-slidedeck__nav">
    <button
      type="button"
      class="mdv-slidedeck__nav-btn"
      disabled={current === 0}
      onclick={prev}
      aria-label={t("slideDeck.prev")}
    >
      <Icon icon={ChevronLeft} size={16} strokeWidth={1.8} />
    </button>
    <span class="mdv-slidedeck__counter">
      <input
        class="mdv-slidedeck__goto"
        type="number"
        min={1}
        max={pages.length}
        value={current + 1}
        onchange={goToPage}
        aria-label={t("slideDeck.goToPage")}
      />
      / {pages.length}
    </span>
    <button
      type="button"
      class="mdv-slidedeck__nav-btn"
      disabled={current >= pages.length - 1}
      onclick={next}
      aria-label={t("slideDeck.next")}
    >
      <Icon icon={ChevronRight} size={16} strokeWidth={1.8} />
    </button>
  </div>
</div>

<!-- styles in src/styles/markdown/slides.css (global) -->
