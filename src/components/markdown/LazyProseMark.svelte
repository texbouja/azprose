<script lang="ts">
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";

let {
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
} = $props();

let t = $derived(getT($language));

let Cmp = $state<typeof import("./ProseMarkEditor.svelte").default | null>(null);
let loading = $state(true);

$effect(() => {
  let cancelled = false;
  import("./ProseMarkEditor.svelte")
    .then((mod) => {
      if (cancelled) return;
      loading = false;
      Cmp = mod.default;
    })
    .catch((err) => {
      if (cancelled) return;
      console.error("azprose: failed to load ProseMark editor", err);
    });
  return () => { cancelled = true; };
});
</script>

{#if loading}
  <div class="mdv-editor mdv-editor--loading">{t("lazy.loadingProse")}</div>
{:else if Cmp}
  <Cmp {value} {onChange} {readOnly} />
{/if}
