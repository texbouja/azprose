<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { getT, language } from "@/lib/i18n";

  let {
    open,
  }: {
    open: boolean;
  } = $props();

  let t = $derived(getT($language));

  let error = $state<string | null>(null);

  async function openSidebar() {
    error = null;
    try {
      await invoke("check_opencode_available");
    } catch {
      error = t("opencode.notInstalled");
      return;
    }
    try {
      await invoke("open_opencode_sidebar");
    } catch (e) {
      error = String(e);
    }
  }

  async function closeSidebar() {
    try {
      await invoke("close_opencode_sidebar");
    } catch (e) {
      error = String(e);
    }
  }

  $effect(() => {
    if (open) {
      openSidebar();
    } else {
      closeSidebar();
    }
    return () => {
      closeSidebar();
    };
  });
</script>

{#if error}
  <div class="mdv-oc-error-toast">
    <p>{error}</p>
    <button type="button" onclick={() => { error = null; openSidebar(); }}>
      {t("opencode.retry")}
    </button>
  </div>
{/if}
