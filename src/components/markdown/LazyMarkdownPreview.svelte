<script lang="ts">
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
// Capacités du pipeline preview (vague 3, phase 3.2) : câblées ICI, pas dans
// MarkdownPreview.svelte lui-même — ce composant n'est mounté QUE par PROJET
// (ContentRenderer.svelte ; NAV importe MarkdownPreview.svelte directement,
// sans capacité). markTranscludedBlocks() ne rejoint donc le bundle NAV que
// si NAV en avait besoin — ce n'est pas le cas.
import { markTranscludedBlocks } from "@/markdown";

let {
  value = "",
  filePath = null as string | null,
  rev = 0,
}: {
  value?: string;
  filePath?: string | null;
  rev?: number;
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
  <Cmp {value} {filePath} {rev} onTransclusion={markTranscludedBlocks} />
{/if}
