<script lang="ts">
// MathJax: same load path as MarkdownPreview/ProseMarkEditor — a side-effect
// import inside this LAZY-loaded chunk, so it runs AFTER main.ts sets the
// window.MathJax config (never eagerly from app.svelte's static graph).
import "mathjax/tex-svg.js";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import { renderMarkdown, resolveLocalImages, ensurePreviewReady } from "@/lib/markdown-render";
import { subscribeMode, type Theme } from "@/lib/theme";

let t = $derived(getT($language));
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { slideSession } from "@/stores/slide-session.svelte";
import { proseSettings, resolveFontFamily, resolveMonoFont, resolveHeadingFont, type ProseStyle } from "@/stores/prose-settings.svelte";

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

// App (shiki) theme for code-block highlighting inside slides.
let appTheme = $state<Theme>(
  (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte",
);
$effect(() =>
  subscribeMode(() => {
    appTheme = (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte";
  }),
);

// Warm up shiki once.
$effect(() => {
  let cancelled = false;
  void ensurePreviewReady().then(() => { if (!cancelled) ready = true; });
  return () => { cancelled = true; };
});

// ── Split source into slide texts (strip front matter, split on ---) ───────
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
  if (current >= slideTexts.length && slideTexts.length > 0) {
    current = slideTexts.length - 1;
  }
});

// ── Render every slide to HTML, then typeset MathJax (mirror MarkdownPreview) ──
$effect(() => {
  if (!ready) return;
  const texts = slideTexts;
  const theme = appTheme;
  let cancelled = false;

  void Promise.all(texts.map((t) => renderMarkdown(t, theme))).then(async (html) => {
    if (cancelled) return;
    slidesHtml = html;
    // Wait for DOM update before resolving images + typesetting.
    await Promise.resolve();
    if (!cancelled && stageEl) await hydrate(stageEl);
  });

  return () => { cancelled = true; };
});

async function hydrate(stage: HTMLElement): Promise<void> {
  const sections = Array.from(stage.querySelectorAll<HTMLElement>(".azp-slide__content"));
  if (filePath) {
    await Promise.all(sections.map((s) => resolveLocalImages(s, filePath)));
  }
  const mj = window.MathJax as
    | { startup?: { promise?: Promise<void> }; tex2svgPromise?: (tex: string, opts: { display: boolean }) => Promise<unknown>; typesetPromise?: (els: HTMLElement[]) => Promise<void> }
    | undefined;
  if (!mj?.startup?.promise) return;
  await mj.startup.promise;
  const preamble = mathJaxPreamble.current.trim();
  if (preamble) await mj.tex2svgPromise?.(preamble, { display: true });
  await mj.typesetPromise?.(sections);
}

// Inject pres* settings as CSS overrides on top of the active slide theme.
// .azp-slide .azp-slide__content (specificity 0,2,0) beats .azp-slide__content (0,1,0)
// and .azp-slide--{theme} h1 (0,1,1), so user settings always win.
$effect(() => {
  const s = proseSettings.current;
  const head = (n: 1 | 2 | 3) => {
    const size = s[`presH${n}Size`] as number;
    const align = s[`presH${n}Align`] as string;
    const font = resolveHeadingFont(s[`presH${n}FontFamily`] as ProseStyle["h1FontFamily"], s[`presH${n}CustomFontName`] as string);
    const mt = s[`presH${n}MarginTop`] as number;
    const mb = s[`presH${n}MarginBottom`] as number;
    return `.azp-slide .azp-slide__content h${n}{font-size:${size}em;text-align:${align};font-family:${font};margin:${mt}em 0 ${mb}em;}`;
  };
  const fontFamily = resolveFontFamily(s.presFontFamily, s.presCustomFontName);
  const monoFont  = resolveMonoFont(s.presMonoFont);
  const css = [
    `.azp-slide .azp-slide__content{font-family:${fontFamily};font-size:${s.presFontSize}px;line-height:${s.presLineHeight};}`,
    `.azp-slide .azp-slide__content code,.azp-slide .azp-slide__content pre{font-family:${monoFont};}`,
    head(1), head(2), head(3),
    s.presCss,
  ].join("\n");
  let el = document.getElementById("azp-slide-style") as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = "azp-slide-style"; document.head.appendChild(el); }
  el.textContent = css;
  return () => { document.getElementById("azp-slide-style")?.remove(); };
});

function prev() { if (current > 0) current--; }
function next() { if (current < slideTexts.length - 1) current++; }

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
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="mdv-slidedeck" class:is-fullscreen={fullscreen}>
  <div class="mdv-slidedeck__stage" bind:this={stageEl}
    style="--slide-aspect: {slideSession.mode === '16:9' ? '16/9' : '4/3'}"
  >
    {#if slideTexts.length === 0}
      <div class="mdv-slidedeck__empty">
        {@html t("slideDeck.empty")}
      </div>
    {:else}
      {#each slidesHtml as html, i (i)}
        <section
          class="azp-slide azp-slide--{slideSession.theme}"
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
      {slideTexts.length > 0 ? current + 1 : 0} / {slideTexts.length}
    </span>
    <button
      type="button"
      class="mdv-slidedeck__nav-btn"
      disabled={current >= slideTexts.length - 1}
      onclick={next}
      aria-label={t("slideDeck.next")}
    >
      <Icon icon={ChevronRight} size={16} strokeWidth={1.8} />
    </button>
  </div>
</div>

<!-- styles in src/styles/editor/slides.css (global) -->
