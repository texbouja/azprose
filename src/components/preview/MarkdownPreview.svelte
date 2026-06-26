<script lang="ts">
import "mathjax/tex-svg.js";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  renderMarkdown,
  resolveLocalImages,
  decorateCodeBlocks,
  ensurePreviewReady,
} from "@/lib/markdown-render";
import { subscribeMode, type Theme } from "@/lib/theme";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";

let {
  value = "",
  filePath = null as string | null,
}: {
  value?: string;
  filePath?: string | null;
} = $props();

let articleEl: HTMLElement;
let ready = $state(false);

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
    <article bind:this={articleEl} class="mdv-prose"></article>
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
