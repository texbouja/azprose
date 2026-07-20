<script lang="ts">
import { onDestroy } from "svelte";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  renderMarkdown,
  resolveLocalImages,
  decorateCodeBlocks,
  ensurePreviewReady,
  markTranscludedBlocks,
  makeCalloutsCollapsible,
  updateCalloutIcons,
} from "@/markdown";
import { calloutSettings, generateCalloutCss } from "@/stores/callout-settings.svelte";
import { subscribeMode, type Theme } from "@/lib/theme";
import { mathJaxPreamble } from "@/stores/mathjax-preamble.svelte";
import { collectRenderDiagnostics, clearRenderDiagnostics } from "@/lib/render-diagnostics";
import { previewSettings, resolveFontFamily, resolveMonoFont, resolveHeadingFont, type PreviewStyle } from "@/stores/markdown-settings.svelte";
import { resolveWikilinkPaths } from "@/markdown";
import { getRootPath } from "@/stores/root-path.svelte";
import { consumeScrollTarget } from "@/stores/scroll-target.svelte";
import { consumeSyncLine } from "@/stores/sync-line.svelte";

let {
  value = "",
  filePath = null as string | null,
  onJumpToLine,
}: {
  value?: string;
  filePath?: string | null;
  onJumpToLine?: (line: number) => void;
} = $props();

let articleEl: HTMLElement | undefined = $state();
let ready = $state(false);

function buildPreviewProseCss(s: PreviewStyle): string {
  const head = (n: 1 | 2 | 3) => {
    const size = s[`h${n}Size`] as number;
    const align = s[`h${n}Align`] as string;
    const font = resolveHeadingFont(s[`h${n}FontFamily`] as PreviewStyle["h1FontFamily"], s[`h${n}CustomFontName`] as string);
    const mt = s[`h${n}MarginTop`] as number;
    const mb = s[`h${n}MarginBottom`] as number;
    return `.mdv-prose h${n}{font-size:${size}em;text-align:${align};font-family:${font};margin:${mt}em 0 ${mb}em;}`;
  };
  const fontFamily = resolveFontFamily(s.fontFamily, s.customFontName);
  const monoFont  = resolveMonoFont(s.monoFont);
  const base = [
    `.mdv-prose{font-family:${fontFamily};font-size:${s.fontSize}px;line-height:${s.lineHeight};max-width:${s.maxWidth}px;}`,
    `.mdv-prose code,.mdv-prose pre{font-family:${monoFont};}`,
    head(1), head(2), head(3),
    `.mdv-prose ol{list-style-type:${s.olLevel1};}`,
    `.mdv-prose ol ol{list-style-type:${s.olLevel2};}`,
    `.mdv-prose ol ol ol{list-style-type:${s.olLevel3};}`,
  ].join("\n");
  const custom = s.customCss;
  return custom ? base + "\n" + custom : base;
}

$effect(() => {
  const css = buildPreviewProseCss(previewSettings.current);
  const el = document.createElement("style");
  el.id = "mdv-preview-prose-css";
  el.textContent = css;
  document.head.appendChild(el);
  return () => el.remove();
});

$effect(() => {
  const css = generateCalloutCss(calloutSettings.current);
  const el = document.createElement("style");
  el.id = "mdv-preview-callout-css";
  el.textContent = css;
  document.head.appendChild(el);
  return () => el.remove();
});

let currentTheme = $state<Theme>(
  (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte",
);

$effect(() => {
  return subscribeMode(() => {
    currentTheme = (document.documentElement.getAttribute("data-theme") as Theme) ?? "latte";
  });
});

$effect(() => {
  let cancelled = false;
  void ensurePreviewReady().then(() => {
    if (!cancelled) ready = true;
  });
  return () => { cancelled = true; };
});

async function typesetMath(el: HTMLElement): Promise<void> {
  await import("mathjax/tex-svg.js");
  const mj = window.MathJax as
    | { startup?: { promise?: Promise<void> }; tex2svgPromise?: (tex: string, opts: { display: boolean }) => Promise<unknown>; typesetPromise?: (els: HTMLElement[]) => Promise<void> }
    | undefined;
  if (!mj?.startup?.promise) return;
  await mj.startup.promise;
  const preamble = mathJaxPreamble.current.trim();
  if (preamble) await mj.tex2svgPromise?.(preamble, { display: true });
  await mj.typesetPromise?.([el]);
}

$effect(() => {
  if (!ready) return;
  const src = value;
  const theme = currentTheme;
  let cancelled = false;
  let cleanupCode = () => {};

  // Update callout icons from current settings before rendering
  updateCalloutIcons(calloutSettings.current);

  void renderMarkdown(src, theme, filePath ?? undefined, getRootPath() ?? undefined).then(async (result) => {
    if (cancelled || !articleEl) return;

    // Process callouts immediately before first paint
    const tmp = document.createElement("div");
    tmp.innerHTML = result.html;
    for (const el of tmp.querySelectorAll<HTMLElement>(".callout")) {
      const inner = el.querySelector<HTMLElement>(".callout-title-inner");
      if (!inner) continue;
      const type = el.dataset.callout ?? "";
      const auto = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      if (inner.textContent?.trim() === auto) inner.textContent = "";
    }
    makeCalloutsCollapsible(tmp);
    articleEl.innerHTML = tmp.innerHTML;

    cleanupCode();
    cleanupCode = decorateCodeBlocks(articleEl);
    const broken = filePath ? await resolveLocalImages(articleEl, filePath) : [];
    await typesetMath(articleEl);
    const rp = getRootPath();
    if (rp) await resolveWikilinkPaths(articleEl, rp);
    if (!cancelled) collectRenderDiagnostics(articleEl, broken);

    // Mark transcluded blocks so double-click opens the original source file
    markTranscludedBlocks(articleEl, result.ranges);

    // Scroll to heading if navigated via wikilink
    const scrollHeading = consumeScrollTarget();
    if (scrollHeading && articleEl) {
      const id = scrollHeading.toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/ /g, "-")
        .replace(/^-|-$/g, "");
      const target = articleEl.querySelector(`#${CSS.escape(id)}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Scroll to editor cursor position after save
    const syncLine = consumeSyncLine();
    if (syncLine != null && articleEl) {
      const target = articleEl.querySelector<HTMLElement>(`[data-sline="${syncLine}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  return () => {
    cancelled = true;
    cleanupCode();
  };
});

onDestroy(() => clearRenderDiagnostics());

$effect(() => {
  if (!articleEl) return;
  const el = articleEl;
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;

    // Wikilink with resolved full path: open directly
    if (a.classList.contains("wikilink")) {
      const fullpath = a.getAttribute("data-wikilink-fullpath");
      const heading = a.getAttribute("data-wikilink-heading");
      if (fullpath) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("azprose:wikilink-navigate", { detail: { path: fullpath, heading } }));
        return;
      }
      // Fallback: dispatch with target name for app.svelte resolution
      const target = a.getAttribute("data-wikilink-target");
      if (target) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("azprose:wikilink-navigate", { detail: { target, heading } }));
      }
      return;
    }

    if (href.startsWith("#")) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const target =
        el.querySelector(`[id="${CSS.escape(id)}"]`) ??
        el.querySelector(`[id="${id}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (/^https?:\/\//.test(href)) {
      e.preventDefault();
      void openUrl(href);
    }
  };
  el.addEventListener("click", onClick);
  return () => el.removeEventListener("click", onClick);
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
      // Transcluded block: open the original source file at the source line
      const transcluded = (e.target as HTMLElement).closest<HTMLElement>("[data-transcluded-from]");
      if (transcluded) {
        const path = transcluded.dataset.transcludedFrom;
        const line = Number(transcluded.dataset.transcludedLine);
        if (path) {
          window.dispatchEvent(new CustomEvent("azprose:jump-to-file", {
            detail: { path, line: Number.isFinite(line) ? line : undefined },
          }));
        }
        return;
      }
      // Normal inverse search: jump to line in current file
      const block = (e.target as HTMLElement).closest<HTMLElement>("[data-sline]");
      if (!block) return;
      const line = Number(block.dataset.sline);
      if (Number.isFinite(line)) {
        onJumpToLine?.(line);
        window.dispatchEvent(new CustomEvent("azprose:jump-to-line", { detail: line }));
      }
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
