<script lang="ts">
  import { CircleHelp } from "lucide-svelte";
  import { Button, Icon } from "@/components/primitives";
  import { shortcutLabel } from "@/lib";

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
    <span data-tauri-drag-region>{fileName ?? "untitled"}</span>
  </div>
  <div class="mdv-statusbar__group" data-tauri-drag-region>
    <span>{words} {words === 1 ? "word" : "words"}</span>
    <span>·</span>
    <span>{minutes} min read</span>
    <Button
      class="mdv-statusbar__help"
      data-tooltip={shortcutLabel("how to use (⌘/)")}
      aria-label="how to use"
      onclick={onShowHelp}
    >
      {#snippet icon()}
        <Icon icon={CircleHelp} size={12} strokeWidth={1.5} />
      {/snippet}
    </Button>
  </div>
</footer>
