<script lang="ts">
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";

// Dynamic-import wrapper: keeps SlideDeck's `import "mathjax/tex-svg.js"` (and
// the markdown-it/shiki pipeline) out of the eager app.svelte graph, so it loads
// only when Presentation mode is entered — AFTER main.ts sets window.MathJax.
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

let t = $derived(getT($language));

let Cmp = $state<typeof import("./SlideDeck.svelte").default | null>(null);

$effect(() => {
  let cancelled = false;
  import("./SlideDeck.svelte")
    .then((mod) => { if (!cancelled) Cmp = mod.default; })
    .catch((err) => console.error("azprose: failed to load SlideDeck", err));
  return () => { cancelled = true; };
});
</script>

{#if Cmp}
  <Cmp {value} {filePath} {fullscreen} {onExitFullscreen} />
{:else}
  <div class="mdv-editor mdv-editor--loading">{t("lazy.loadingPresentation")}</div>
{/if}
