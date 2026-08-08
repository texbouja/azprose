<script lang="ts">
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";

let {
  value = "",
  filePath = null as string | null,
}: {
  value?: string;
  filePath?: string | null;
} = $props();

let t = $derived(getT($language));

let Cmp = $state<typeof import("./DocPreview.svelte").default | null>(null);
let loading = $state(true);

$effect(() => {
  let cancelled = false;
  import("./DocPreview.svelte")
    .then((mod) => {
      if (cancelled) return;
      loading = false;
      Cmp = mod.default;
    })
    .catch((err) => {
      if (cancelled) return;
      console.error("azprose: failed to load DocPreview", err);
    });
  return () => { cancelled = true; };
});
</script>

{#if loading}
  <div class="mdv-editor mdv-editor--loading">{t("lazy.loadingPreview")}</div>
{:else if Cmp}
  <Cmp {value} {filePath} />
{/if}
