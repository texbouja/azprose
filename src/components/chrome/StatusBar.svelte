<script lang="ts">
  import { CircleHelp } from "@/lib/icons";
  import { Button, Icon } from "@/components/primitives";
  import { shortcutLabel } from "@/lib";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";

  let t = $derived(getT($language));

  let {
    fileName,
    words,
    minutes,
    onShowHelp,
    vimMode,
  }: {
    fileName?: string;
    words: number;
    minutes: number;
    onShowHelp: () => void;
    vimMode?: "normal" | "insert" | "visual" | "replace" | null;
  } = $props();

  function vimModeLabel(mode: "normal" | "insert" | "visual" | "replace"): string {
    switch (mode) {
      case "normal": return "NORMAL";
      case "insert": return "INSERT";
      case "visual": return "VISUAL";
      case "replace": return "REPLACE";
    }
  }
</script>

<footer class="mdv-statusbar" data-tauri-drag-region>
  <div class="mdv-statusbar__group" data-tauri-drag-region>
    {#if vimMode}
      <span class="mdv-vim-pill mdv-vim-pill--{vimMode}">{vimModeLabel(vimMode)}</span>
    {/if}
    <span data-tauri-drag-region>{fileName ?? t("statusbar.untitled")}</span>
  </div>
  <div class="mdv-statusbar__group" data-tauri-drag-region>
    <span>{t("statusbar.words", { count: words })}</span>
    <span>·</span>
    <span>{t("statusbar.minRead", { minutes })}</span>
    <Button
      class="mdv-statusbar__help"
      data-tooltip={shortcutLabel(t("statusbar.howToUse") + " (⌘/)")}
      aria-label={t("statusbar.howToUse")}
      onclick={onShowHelp}
    >
      {#snippet icon()}
        <Icon icon={CircleHelp} size={12} strokeWidth={1.5} />
      {/snippet}
    </Button>
  </div>
</footer>
