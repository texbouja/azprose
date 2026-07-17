<script lang="ts">
import { onDestroy } from "svelte";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import { renderMarkdown, resolveLocalImages, ensurePreviewReady, makeCalloutsCollapsible, updateCalloutIcons } from "@/lib/markdown-render";
import { collectRenderDiagnostics, clearRenderDiagnostics } from "@/lib/render-diagnostics";
import { subscribeMode, type Theme } from "@/lib/theme";

let t = $derived(getT($language));
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { slideSession } from "@/stores/slide-session.svelte";
import { presentationSettings, resolveFontFamily, resolveMonoFont, resolveHeadingFont, type PresentationStyle } from "@/stores/markdown-settings.svelte";
import { calloutSettings, generateCalloutCss } from "@/stores/callout-settings.svelte";

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

  // Update callout icons from current settings before rendering
  updateCalloutIcons(calloutSettings.current);

  void Promise.all(currentPages.map((t) => renderMarkdown(t, theme))).then(async (results) => {
    if (cancelled) return;
    slidesHtml = results.map(r => {
      const tmp = document.createElement("div");
      tmp.innerHTML = r.html;
      for (const el of tmp.querySelectorAll<HTMLElement>(".callout")) {
        const inner = el.querySelector<HTMLElement>(".callout-title-inner");
        if (!inner) continue;
        const type = el.dataset.callout ?? "";
        const auto = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
        if (inner.textContent?.trim() === auto) inner.textContent = "";
      }
      makeCalloutsCollapsible(tmp);
      return tmp.innerHTML;
    });
    await Promise.resolve();
    if (!cancelled && stageEl) {
      await hydrate(stageEl);
    }
  });

  return () => { cancelled = true; };
});

async function hydrate(stage: HTMLElement): Promise<void> {
  const sections = Array.from(stage.querySelectorAll<HTMLElement>(".azp-slide__content"));
  let broken: string[] = [];
  if (filePath) {
    broken = (await Promise.all(sections.map((s) => resolveLocalImages(s, filePath)))).flat();
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
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="mdv-slidedeck" class:is-fullscreen={fullscreen}>
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
