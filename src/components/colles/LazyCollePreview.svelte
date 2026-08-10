<script lang="ts">
  /** Lazy wrapper de CollePreview (chargé à la première ouverture). */
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";

  let {
    value = "",
    filePath = null as string | null,
    tabId = null as string | null,
    viewerFullscreenOn = false,
  }: {
    value?: string;
    filePath?: string | null;
    tabId?: string | null;
    viewerFullscreenOn?: boolean;
  } = $props();

  let t = $derived(getT($language));

  let Cmp = $state<typeof import("./CollePreview.svelte").default | null>(null);
  let loading = $state(true);

  $effect(() => {
    let cancelled = false;
    import("./CollePreview.svelte")
      .then((mod) => {
        if (cancelled) return;
        loading = false;
        Cmp = mod.default;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("azprose: failed to load CollePreview", err);
      });
    return () => { cancelled = true; };
  });
</script>

{#if loading}
  <div class="mdv-editor mdv-editor--loading">{t("lazy.loadingColles")}</div>
{:else if Cmp}
  <Cmp {value} {filePath} {tabId} {viewerFullscreenOn} />
{/if}
