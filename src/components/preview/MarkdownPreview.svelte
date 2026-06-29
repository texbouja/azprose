<script lang="ts">
import "mathjax/tex-svg.js";
import { onDestroy } from "svelte";
import { openUrl } from "@tauri-apps/plugin-opener";
import { syncLine } from "@/stores/sync-line";
import {
  renderMarkdown,
  resolveLocalImages,
  decorateCodeBlocks,
  ensurePreviewReady,
} from "@/lib/markdown-render";
import { subscribeMode, type Theme } from "@/lib/theme";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { proseSettings, resolveFontFamily, resolveMonoFont, resolveHeadingFont, type ProseStyle } from "@/stores/prose-settings.svelte";

let {
  value = "",
  filePath = null as string | null,
  onJumpToLine,
}: {
  value?: string;
  filePath?: string | null;
  onJumpToLine?: (line: number) => void;
} = $props();

let articleEl: HTMLElement;
let ready = $state(false);

// Map the shared prose settings (headings + ordered-list levels) onto the
// markdown-it Preview article. preview.css only ships static defaults, so without
// this the Settings Prose config has no effect on H1-H3 or ordered-list numbering.
function buildPreviewProseCss(s: ProseStyle): string {
  const head = (n: 1 | 2 | 3) => {
    const size = s[`h${n}Size`] as number;
    const align = s[`h${n}Align`] as string;
    const font = resolveHeadingFont(s[`h${n}FontFamily`] as ProseStyle["h1FontFamily"], s[`h${n}CustomFontName`] as string);
    const mt = s[`h${n}MarginTop`] as number;
    const mb = s[`h${n}MarginBottom`] as number;
    return `.mdv-prose h${n}{font-size:${size}em;text-align:${align};font-family:${font};margin:${mt}em 0 ${mb}em;}`;
  };
  const fontFamily = resolveFontFamily(s.fontFamily, s.customFontName);
  const monoFont  = resolveMonoFont(s.monoFont);
  return [
    `.mdv-prose{font-family:${fontFamily};font-size:${s.fontSize}px;line-height:${s.lineHeight};max-width:${s.maxWidth}px;}`,
    `.mdv-prose code,.mdv-prose pre{font-family:${monoFont};}`,
    head(1), head(2), head(3),
    `.mdv-prose ol{list-style-type:${s.olLevel1};}`,
    `.mdv-prose ol ol{list-style-type:${s.olLevel2};}`,
    `.mdv-prose ol ol ol{list-style-type:${s.olLevel3};}`,
  ].join("\n");
}

// Inject a style element derived from prose settings; re-runs on any change.
$effect(() => {
  const css = buildPreviewProseCss(proseSettings.current);
  const el = document.createElement("style");
  el.id = "mdv-preview-prose-css";
  el.textContent = css;
  document.head.appendChild(el);
  return () => el.remove();
});

// Track the resolved theme from <html data-theme="...">
let currentTheme = $state<Theme>(
  (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte",
);

$effect(() => {
  return subscribeMode(() => {
    currentTheme = (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte";
  });
});

// Warm up shiki on mount (lazy-loads the highlighter once).
$effect(() => {
  let cancelled = false;
  void ensurePreviewReady().then(() => {
    if (!cancelled) ready = true;
  });
  return () => { cancelled = true; };
});

// Returns the last [data-sline] block that starts at or before targetLine.
// This is the block containing that source line (blocks can span many lines).
function findSlineBlock(root: HTMLElement, targetLine: number): HTMLElement | null {
  let result: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>("[data-sline]")) {
    if (Number(el.dataset.sline) <= targetLine) result = el;
    else break;
  }
  return result ?? root.querySelector<HTMLElement>("[data-sline]");
}

// Capture the first visible block when switching away from preview.
onDestroy(() => {
  if (!articleEl) return;
  const container = articleEl.parentElement;
  if (!container) return;
  const top = container.getBoundingClientRect().top;
  for (const el of articleEl.querySelectorAll<HTMLElement>("[data-sline]")) {
    if (el.getBoundingClientRect().bottom > top + 4) {
      syncLine.current = Number(el.dataset.sline);
      return;
    }
  }
});

// Apply MathJax preamble + typeset the rendered article.
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

// Re-render whenever source, theme, or ready state changes.
$effect(() => {
  if (!ready) return;
  const src = value;
  const theme = currentTheme;
  let cancelled = false;
  let cleanupCode = () => {};

  void renderMarkdown(src, theme).then(async (html) => {
    if (cancelled || !articleEl) return;
    articleEl.innerHTML = html;

    // Restore scroll position from editor mode (editor → preview switch).
    if (syncLine.current != null) {
      const target = findSlineBlock(articleEl, syncLine.current);
      syncLine.current = null;
      target?.scrollIntoView({ block: "start", behavior: "instant" });
    }

    cleanupCode();
    cleanupCode = decorateCodeBlocks(articleEl);
    if (filePath) await resolveLocalImages(articleEl, filePath);
    await typesetMath(articleEl);
  });

  return () => {
    cancelled = true;
    cleanupCode();
  };
});

// Handle link clicks: anchor scroll or external browser.
$effect(() => {
  if (!articleEl) return;
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;
    if (href.startsWith("#")) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const target =
        articleEl.querySelector(`[id="${CSS.escape(id)}"]`) ??
        articleEl.querySelector(`[id="${id}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (/^https?:\/\//.test(href)) {
      e.preventDefault();
      void openUrl(href);
    }
  };
  articleEl.addEventListener("click", onClick);
  return () => articleEl.removeEventListener("click", onClick);
});
</script>

<div class="mdv-preview">
  {#if !ready}
    <div class="mdv-preview__loading">chargement…</div>
  {:else if value.trim().length === 0}
    <div class="mdv-preview__empty">document vide</div>
  {:else}
    <article
    bind:this={articleEl}
    class="mdv-prose"
    ondblclick={(e) => {
      const block = (e.target as HTMLElement).closest<HTMLElement>("[data-sline]");
      if (!block || !onJumpToLine) return;
      const line = Number(block.dataset.sline);
      if (Number.isFinite(line)) onJumpToLine(line);
    }}
  ></article>
  {/if}
</div>

<style>
  .mdv-preview {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    padding: 32px 48px 80px;
    box-sizing: border-box;
  }

  .mdv-preview__loading,
  .mdv-preview__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
