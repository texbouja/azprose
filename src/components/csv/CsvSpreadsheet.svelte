<script lang="ts">
  import { tick } from "svelte";
  import { initSpreadsheet, type SpreadsheetResult } from "@/csv/spreadsheet";
  import { csvSettings, resolveFontFamily } from "@/stores/markdown-settings.svelte";

  let {
    value = "",
    filePath = "",
    onChange,
  }: {
    value?: string;
    filePath?: string;
    onChange?: (csv: string) => void;
  } = $props();

  let el: HTMLDivElement;
  let api: SpreadsheetResult | null = null;
  let ready = $state(false);

  let csvStyle = $derived(csvSettings.current);

  let lastFilePath = "";
  let initGeneration = 0;

  $effect(() => {
    const fp = filePath;
    const v = value;
    if (!el || !fp || !v) return;

    if (fp === lastFilePath && api) return;
    lastFilePath = fp;

    api?.destroy();
    api = null;
    ready = false;

    const gen = ++initGeneration;
    let cancelled = false;
    tick().then(() => {
      initSpreadsheet(el, v, fp, (csv) => {
        onChange?.(csv);
      }).then((result) => {
        if (cancelled || initGeneration !== gen) { result.destroy(); return; }
        api = result;
        ready = true;
      });
    });

    return () => {
      cancelled = true;
      api?.saveCache().catch(() => {});
      api?.destroy();
      api = null;
      ready = false;
      lastFilePath = "";
    };
  });
</script>

<div class="csv-spreadsheet" class:csv-spreadsheet--ready={ready}
  style:--csv-font-family={resolveFontFamily(csvStyle.fontFamily, csvStyle.customFontName)}
  style:--csv-font-size="{csvStyle.fontSize}px"
  style:--csv-line-height={csvStyle.lineHeight}>
  <div bind:this={el} class="csv-spreadsheet__grid"></div>
</div>

<style>
  .csv-spreadsheet {
    height: 100%;
    overflow: hidden;
    font-family: var(--font-ui);
  }

  .csv-spreadsheet__grid {
    height: 100%;
    overflow: auto;
  }

  .csv-spreadsheet :global(.jss_spreadsheet) {
    --jss-border-color: var(--border);
    outline: none;
    background: var(--bg);
    color: var(--fg);
  }

  .csv-spreadsheet :global(.jss_toolbar) {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .csv-spreadsheet :global(.jss_content) {
    background: var(--bg);
    scrollbar-color: var(--muted) transparent;
  }

  /* ── suppress search bar (ActionBar duplicate) ── */
  .csv-spreadsheet :global(.jss_toolbar .jsearch),
  .csv-spreadsheet :global(.jss_search) {
    display: none !important;
  }

  /* ── toolbar container ── */
  .csv-spreadsheet :global(.jss_toolbar) {
    --jss-background-color-highlight: color-mix(in srgb, var(--fg) 10%, transparent);
    --jss-border-color: var(--border);
    background: var(--surface);
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 0;
    margin: 0;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--fg-muted);
  }

  /* ── jsuites toolbar ── */
  .csv-spreadsheet :global(.jtoolbar) {
    --jss-background-color-highlight: color-mix(in srgb, var(--fg) 10%, transparent);
    background: var(--surface);
    padding: 1px 2px;
    gap: 0;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--fg-muted);
  }

  /* ── toolbar items (buttons) ── */
  .csv-spreadsheet :global(.jtoolbar .jtoolbar-item) {
    padding: 1px 3px;
    min-width: 0;
    --jss-background-color-highlight: color-mix(in srgb, var(--fg) 10%, transparent);
  }

  .csv-spreadsheet :global(.jtoolbar .jtoolbar-item:hover) {
    background-color: color-mix(in srgb, var(--fg) 10%, transparent) !important;
  }

  /* ── Material Icons in toolbar ── */
  .csv-spreadsheet :global(.jtoolbar .jtoolbar-item i) {
    color: var(--fg-muted);
    font-size: 16px;
    line-height: 1;
  }

  .csv-spreadsheet :global(.jtoolbar .jtoolbar-item:hover i) {
    color: var(--fg);
  }

  .csv-spreadsheet :global(.jtoolbar .jtoolbar-item.jtoolbar-disabled) {
    opacity: 0.35;
    pointer-events: none;
  }

  /* ── toolbar divisor ── */
  .csv-spreadsheet :global(.jtoolbar .jtoolbar-divisor) {
    background-color: var(--border);
  }

  /* ── toolbar label ── */
  .csv-spreadsheet :global(.jtoolbar .jtoolbar-label) {
    color: var(--fg-muted);
    font-family: var(--font-ui);
    font-size: 11px;
  }

  /* ── toolbar select / dropdown (alignment, etc.) ── */
  .csv-spreadsheet :global(.jss_toolbar .jdropdown) {
    background: var(--surface);
    color: var(--fg-muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-ui);
    font-size: 11px;
    height: 20px;
    padding: 0 4px;
    min-width: 0;
  }

  .csv-spreadsheet :global(.jss_toolbar .jdropdown:hover) {
    color: var(--fg);
    border-color: var(--muted);
  }

  .csv-spreadsheet :global(.jss_toolbar .jdropdown:focus) {
    border-color: var(--accent);
    outline: none;
  }

  /* ── toolbar search input ── */
  .csv-spreadsheet :global(.jss_toolbar .jsearch) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-ui);
    font-size: 11px;
    height: 20px;
    padding: 0 4px;
  }

  .csv-spreadsheet :global(.jss_toolbar .jsearch:focus) {
    border-color: var(--accent);
    outline: none;
  }

  /* ── picker / select popups in toolbar ── */
  .csv-spreadsheet :global(.jpicker-header) {
    background-color: var(--surface);
    color: var(--fg-muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-ui);
    font-size: 11px;
  }

  .csv-spreadsheet :global(.jpicker-header:hover) {
    background-color: color-mix(in srgb, var(--fg) 10%, var(--surface));
  }

  .csv-spreadsheet :global(.jpicker-content) {
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--fg) 15%, transparent);
  }

  /* ── color picker ── */
  .csv-spreadsheet :global(.jcolor-input) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-ui);
    font-size: 11px;
  }

  .csv-spreadsheet :global(.jcolor-content) {
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--fg) 20%, transparent);
  }

  .csv-spreadsheet :global(.jcolor-controls) {
    border-bottom-color: var(--border);
  }

  /* ── table ── */
  .csv-spreadsheet :global(.jss_worksheet) {
    background-color: var(--bg);
    border-color: var(--border);
    color: var(--fg);
    font-family: var(--csv-font-family);
    font-size: var(--csv-font-size);
    line-height: var(--csv-line-height);
  }

  /* header row */
  .csv-spreadsheet :global(.jss_worksheet > thead > tr > td) {
    background-color: var(--surface);
    color: var(--fg-muted);
    border-color: var(--border);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
  }

  .csv-spreadsheet :global(.jss_worksheet > thead > tr > td.selected) {
    background-color: color-mix(in srgb, var(--accent) 12%, var(--surface));
    color: var(--accent);
  }

  /* body cells */
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr > td) {
    background-color: var(--bg);
    color: var(--fg);
    border-color: var(--border);
    font-family: var(--csv-font-family);
    font-size: var(--csv-font-size);
    line-height: var(--csv-line-height);
  }

  /* row hover */
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr:hover > td) {
    background-color: color-mix(in srgb, var(--accent) 5%, var(--bg));
  }

  /* selected cell */
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr > td.selected),
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr > td.highlight) {
    background-color: color-mix(in srgb, var(--accent) 10%, var(--bg)) !important;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  /* row index column (first-child) */
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr > td:first-child) {
    background-color: var(--surface);
    color: var(--muted);
    border-color: var(--border);
    font-family: var(--font-ui);
    font-size: 11px;
    text-align: right;
    padding-right: 8px;
    min-width: 36px;
  }

  /* selected row index */
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr.selected > td:first-child) {
    background-color: color-mix(in srgb, var(--accent) 12%, var(--surface));
    color: var(--accent);
  }

  /* dragging state */
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr.dragging > td) {
    opacity: 0.4;
  }

  /* fill handle drag preview — highlight interior cells in the drag range */
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr > td.fill-preview) {
    background-color: color-mix(in srgb, var(--accent) 12%, var(--bg)) !important;
  }

  /* readonly cells */
  .csv-spreadsheet :global(.jss_worksheet > tbody > tr > td.readonly) {
    color: var(--muted);
  }

  /* ── editor overlay ── */
  .csv-spreadsheet :global(.editor) {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--csv-font-family);
    font-size: var(--csv-font-size);
    line-height: var(--csv-line-height);
    border: 2px solid var(--accent);
    outline: none;
  }

  /* ── dropdown / filter popups ── */
  .csv-spreadsheet :global(.jdropdown) {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 12px;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--fg) 12%, transparent);
  }

  .csv-spreadsheet :global(.jdropdown .jdropdown-item:hover) {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    color: var(--fg);
  }

  .csv-spreadsheet :global(.jdropdown .jdropdown-item.selected) {
    background: color-mix(in srgb, var(--accent) 15%, var(--surface));
    color: var(--accent);
  }

  /* ── column filter inputs ── */
  .csv-spreadsheet :global(.jss_filter) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 2px;
  }

  .csv-spreadsheet :global(.jss_filter:focus) {
    border-color: var(--accent);
    outline: none;
  }

  /* ── scrollbars ── */
  .csv-spreadsheet :global(.jss_content::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }

  .csv-spreadsheet :global(.jss_content::-webkit-scrollbar-track) {
    background: transparent;
  }

  .csv-spreadsheet :global(.jss_content::-webkit-scrollbar-thumb) {
    background: var(--muted);
    border-radius: 4px;
  }

  .csv-spreadsheet :global(.jss_content::-webkit-scrollbar-thumb:hover) {
    background: var(--fg-muted);
  }

  /* ── context menu ── */
  .csv-spreadsheet :global(.jcontextmenu) {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 12px;
    box-shadow: 0 6px 18px color-mix(in srgb, var(--fg) 18%, transparent);
  }

  .csv-spreadsheet :global(.jcontextmenu .jcontextmenu-item:hover) {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    color: var(--fg);
  }

  /* ── loading / empty ── */
  .csv-spreadsheet :global(.jss_page) {
    background: var(--bg);
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: 13px;
  }
</style>
