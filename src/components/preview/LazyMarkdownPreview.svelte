<script lang="ts">
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import type { MathEngine } from "@/lib/markdown-render";

let {
  value = "",
  filePath = null as string | null,
  onJumpToLine,
  mathEngine = "mathjax" as MathEngine,
}: {
  value?: string;
  filePath?: string | null;
  onJumpToLine?: (line: number) => void;
  mathEngine?: MathEngine;
} = $props();

let t = $derived(getT($language));

let Cmp = $state<typeof import("./MarkdownPreview.svelte").default | null>(null);
let loading = $state(true);

$effect(() => {
  let cancelled = false;
  import("./MarkdownPreview.svelte")
    .then((mod) => {
      if (cancelled) return;
      loading = false;
      Cmp = mod.default;
    })
    .catch((err) => {
      if (cancelled) return;
      console.error("azprose: failed to load MarkdownPreview", err);
    });
  return () => { cancelled = true; };
});
</script>

{#if loading}
  <div class="mdv-editor mdv-editor--loading">{t("lazy.loadingPreview")}</div>
{:else if Cmp}
  <Cmp {value} {filePath} {onJumpToLine} {mathEngine} />
{/if}
