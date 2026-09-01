<script lang="ts">
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";

  let t = $derived(getT($language));

  let {
    fileName,
    words,
    minutes,
    vimMode,
    buildLabel,
    onHelp = null as (() => void) | null,
    onAbout = null as (() => void) | null,
  }: {
    fileName?: string;
    words: number;
    minutes: number;
    vimMode?: "normal" | "insert" | "visual" | "replace" | null;
    buildLabel?: string | null;
    onHelp?: (() => void) | null;
    /** Ouvre la modale des notes de version — bouton à DROITE de l'aide. */
    onAbout?: (() => void) | null;
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
    {#if buildLabel}
      <span class="mdv-statusbar__build">
        <svg class="mdv-statusbar__spinner" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M14 8a6 6 0 0 1-9.33 5" />
          <path d="M2 8a6 6 0 0 1 9.33-5" />
          <path d="M12.33 3.3 14 2" />
          <path d="M1.67 12.7 2 14" />
        </svg>
        <span>{buildLabel}</span>
      </span>
    {/if}
    <span>{t("statusbar.words", { count: words })}</span>
    <span>·</span>
    <span>{t("statusbar.minRead", { minutes })}</span>
    {#if onHelp}
      <button
        type="button"
        class="mdv-statusbar__help"
        title={t("statusbar.help")}
        aria-label={t("statusbar.help")}
        onclick={onHelp}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      </button>
    {/if}
    {#if onAbout}
      <button
        type="button"
        class="mdv-statusbar__help"
        title={t("statusbar.about")}
        aria-label={t("statusbar.about")}
        onclick={onAbout}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
    {/if}
  </div>
</footer>
