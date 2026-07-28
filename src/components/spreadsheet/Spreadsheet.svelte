<script lang="ts">
  import { tick, onDestroy } from "svelte";
  import jspreadsheet from "jspreadsheet-ce";
  import "jsuites/dist/jsuites.css";
  import "jspreadsheet-ce/dist/jspreadsheet.css";

  export type JspreadsheetInstance = ReturnType<typeof jspreadsheet>[number];

  let {
    data = [],
    columns = [],
    worksheetOptions = {},
    onchange,
    onSave,
    contextMenu,
    toolbar,
    class: className = "",
  }: {
    data: (string | number | boolean)[][];
    columns: Record<string, any>[];
    worksheetOptions?: Record<string, any>;
    onchange?: (colIndex: number, rowIndex: number, value: any, oldValue: any) => void;
    onSave?: () => void;
    contextMenu?: (sheet: any, col: string | number | null, row: string | number | null, evt: any, items: any[], role: string) => any[];
    toolbar?: (defaultToolbar: any, instance: JspreadsheetInstance[]) => any;
    class?: string;
  } = $props();

  let el: HTMLDivElement;
  let api: JspreadsheetInstance[] | null = null;
  let ready = $state(false);

  export function getApi(): JspreadsheetInstance[] | null {
    return api;
  }

  async function init() {
    if (!el) return;
    try { jspreadsheet.destroy(el as any, true); } catch {}
    api = null;
    ready = false;

    await tick();

    api = jspreadsheet(el, {
      worksheets: [
        {
          data,
          columns,
          csvHeaders: false,
          filters: true,
          ...worksheetOptions,
        },
      ],
      contextMenu: contextMenu
        ? (sheet: any, col: string | number | null, row: string | number | null, evt: any, items: any[], role: string) => {
            return contextMenu(sheet, col, row, evt, items, role);
          }
        : defaultContextMenu,
      toolbar: toolbar
        ? (defaultToolbar: any) => toolbar(defaultToolbar, api!)
        : (defaultToolbar: any) => defaultToolbarConfig(defaultToolbar, api!),
      onchange: (_sheet: any, _cell: any, colIndex: string | number, rowIndex: string | number, value: any, oldValue: any) => {
        onchange?.(Number(colIndex), Number(rowIndex), value, oldValue);
      },
    });

    ready = true;

    setupFillHighlight();
    setupAutoFit();
  }

  function defaultContextMenu(sheet: any, col: string | number | null, row: string | number | null, _evt: any, items: any[], role: string) {
    const colIdx = col != null ? parseInt(String(col)) : null;
    const rowIdx = row != null ? parseInt(String(row)) : null;
    if (items.length > 0) items.push({ type: "line" });

    if (role === "header" && colIdx != null) {
      const selected = sheet.getSelectedColumns() as number[];
      const indices = selected.length > 1 && selected.includes(colIdx) ? selected : [colIdx];
      items.push({
        title: indices.length > 1 ? "Hide columns" : "Hide column",
        onclick: () => { sheet.hideColumn(indices); },
      });
    } else if (rowIdx != null) {
      const selected = sheet.getSelectedRows() as number[];
      const indices = selected.length > 1 && selected.includes(rowIdx) ? selected : [rowIdx];
      items.push({
        title: indices.length > 1 ? "Hide rows" : "Hide row",
        onclick: () => { sheet.hideRow(indices); },
      });
    }
    return items;
  }

  function defaultToolbarConfig(defaultToolbar: any, instance: JspreadsheetInstance[]) {
    const items = defaultToolbar.items.map((item: any) => {
      if (item.content === "save" && onSave) {
        return { ...item, title: "Save", onclick: () => { onSave(); } };
      }
      return item;
    });

    return {
      ...defaultToolbar,
      title: false,
      items: [
        ...items,
        { type: "divisor" },
        {
          content: "visibility",
          title: "Show all",
          onclick: () => {
            const sheet = instance[0];
            if (!sheet) return;
            sheet.showColumn(Array.from({ length: sheet.headers.length }, (_: any, i: number) => i));
            sheet.showRow(Array.from({ length: sheet.rows.length }, (_: any, i: number) => i));
          },
        },
      ],
    };
  }

  function setupFillHighlight() {
    if (!el) return;
    let fillHighlightEls: Element[] = [];
    const FILL_CLASS = "fill-preview";

    function clearFillHighlight() {
      for (const e of fillHighlightEls) e.classList.remove(FILL_CLASS);
      fillHighlightEls = [];
    }

    function applyFillHighlight() {
      clearFillHighlight();
      const borders = el.querySelectorAll(".selection-top,.selection-bottom,.selection-left,.selection-right");
      if (borders.length === 0) return;
      let minCol = Infinity, maxCol = -1, minRow = Infinity, maxRow = -1;
      for (const b of borders) {
        const c = parseInt((b as HTMLElement).getAttribute("data-x") ?? "");
        const r = parseInt((b as HTMLElement).getAttribute("data-y") ?? "");
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
      }
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const cell = el.querySelector(`td[data-x="${c}"][data-y="${r}"]`);
          if (cell && !cell.classList.contains("selection-top") && !cell.classList.contains("selection-bottom") &&
              !cell.classList.contains("selection-left") && !cell.classList.contains("selection-right")) {
            cell.classList.add(FILL_CLASS);
            fillHighlightEls.push(cell);
          }
        }
      }
    }

    el.addEventListener("mousedown", (e: MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains("jss_corner")) {
        const poll = setInterval(() => applyFillHighlight(), 16);
        const stop = () => {
          clearInterval(poll);
          clearFillHighlight();
          document.removeEventListener("mouseup", stop);
        };
        document.addEventListener("mouseup", stop, { once: true });
      }
    }, true);
  }

  function setupAutoFit() {
    if (!el) return;
    const sheet = api?.[0];
    if (!sheet) return;
    const thead = sheet.thead?.parentElement;
    if (!thead) return;

    thead.addEventListener("dblclick", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TD") return;
      const rect = target.getBoundingClientRect();
      const distFromRight = rect.right - e.clientX;
      if (distFromRight > 10) return;
      const colIdx = parseInt(target.getAttribute("data-x") ?? "");
      if (isNaN(colIdx)) return;
      const cells = el.querySelectorAll(`td[data-x="${colIdx}"]`);
      let maxW = 0;
      const measuring = document.createElement("span");
      measuring.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:inherit";
      document.body.appendChild(measuring);
      for (const cell of cells) {
        measuring.textContent = cell.textContent ?? "";
        if (measuring.offsetWidth > maxW) maxW = measuring.offsetWidth;
      }
      document.body.removeChild(measuring);
      sheet.setWidth(colIdx, maxW + 16);
    });
  }

  $effect(() => {
    void data;
    void columns;
    init();
  });

  onDestroy(() => {
    try { jspreadsheet.destroy(el as any, true); } catch {}
    api = null;
  });
</script>

<div class="spreadsheet{className ? ` ${className}` : ""}" class:spreadsheet--ready={ready}>
  <div bind:this={el} class="spreadsheet__grid"></div>
</div>

<style>
  .spreadsheet {
    height: 100%;
    overflow: hidden;
    font-family: var(--font-ui);
  }

  .spreadsheet__grid {
    height: 100%;
    overflow: auto;
  }

  /* ── Spreadsheet base ── */
  .spreadsheet :global(.jss_spreadsheet) {
    --jss-border-color: var(--border);
    outline: none;
    background: var(--bg);
    color: var(--fg);
  }

  .spreadsheet :global(.jss_toolbar) {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .spreadsheet :global(.jss_content) {
    background: var(--bg);
    scrollbar-color: var(--muted) transparent;
  }

  /* ── suppress search bar (ActionBar duplicate) ── */
  .spreadsheet :global(.jss_toolbar .jsearch),
  .spreadsheet :global(.jss_search) {
    display: none !important;
  }

  /* ── toolbar container ── */
  .spreadsheet :global(.jss_toolbar) {
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
  .spreadsheet :global(.jtoolbar) {
    --jss-background-color-highlight: color-mix(in srgb, var(--fg) 10%, transparent);
    background: var(--surface);
    padding: 1px 2px;
    gap: 0;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--fg-muted);
  }

  /* ── toolbar items (buttons) ── */
  .spreadsheet :global(.jtoolbar .jtoolbar-item) {
    padding: 1px 3px;
    min-width: 0;
    --jss-background-color-highlight: color-mix(in srgb, var(--fg) 10%, transparent);
  }

  .spreadsheet :global(.jtoolbar .jtoolbar-item:hover) {
    background-color: color-mix(in srgb, var(--fg) 10%, transparent) !important;
  }

  /* ── Material Icons in toolbar ── */
  .spreadsheet :global(.jtoolbar .jtoolbar-item i) {
    color: var(--fg-muted);
    font-size: 16px;
    line-height: 1;
  }

  .spreadsheet :global(.jtoolbar .jtoolbar-item:hover i) {
    color: var(--fg);
  }

  .spreadsheet :global(.jtoolbar .jtoolbar-item.jtoolbar-disabled) {
    opacity: 0.35;
    pointer-events: none;
  }

  /* ── toolbar divisor ── */
  .spreadsheet :global(.jtoolbar .jtoolbar-divisor) {
    background-color: var(--border);
  }

  /* ── toolbar label ── */
  .spreadsheet :global(.jtoolbar .jtoolbar-label) {
    color: var(--fg-muted);
    font-family: var(--font-ui);
    font-size: 11px;
  }

  /* ── toolbar select / dropdown (alignment, etc.) ── */
  .spreadsheet :global(.jss_toolbar .jdropdown) {
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

  .spreadsheet :global(.jss_toolbar .jdropdown:hover) {
    color: var(--fg);
    border-color: var(--muted);
  }

  .spreadsheet :global(.jss_toolbar .jdropdown:focus) {
    border-color: var(--accent);
    outline: none;
  }

  /* ── toolbar search input ── */
  .spreadsheet :global(.jss_toolbar .jsearch) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-ui);
    font-size: 11px;
    height: 20px;
    padding: 0 4px;
  }

  .spreadsheet :global(.jss_toolbar .jsearch:focus) {
    border-color: var(--accent);
    outline: none;
  }

  /* ── picker / select popups in toolbar ── */
  .spreadsheet :global(.jpicker-header) {
    background-color: var(--surface);
    color: var(--fg-muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-ui);
    font-size: 11px;
  }

  .spreadsheet :global(.jpicker-header:hover) {
    background-color: color-mix(in srgb, var(--fg) 10%, var(--surface));
  }

  .spreadsheet :global(.jpicker-content) {
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--fg) 15%, transparent);
  }

  /* ── color picker ── */
  .spreadsheet :global(.jcolor-input) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-family: var(--font-ui);
    font-size: 11px;
  }

  .spreadsheet :global(.jcolor-content) {
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--fg) 20%, transparent);
  }

  .spreadsheet :global(.jcolor-controls) {
    border-bottom-color: var(--border);
  }

  /* ── table ── */
  .spreadsheet :global(.jss_worksheet) {
    background-color: var(--bg);
    border-color: var(--border);
    color: var(--fg);
    font-family: var(--font-ui);
    font-size: 12px;
  }

  /* header row */
  .spreadsheet :global(.jss_worksheet > thead > tr > td) {
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

  .spreadsheet :global(.jss_worksheet > thead > tr > td.selected) {
    background-color: color-mix(in srgb, var(--accent) 12%, var(--surface));
    color: var(--accent);
  }

  /* body cells */
  .spreadsheet :global(.jss_worksheet > tbody > tr > td) {
    background-color: var(--bg);
    color: var(--fg);
    border-color: var(--border);
    font-family: var(--font-ui);
    font-size: 12px;
  }

  /* row hover */
  .spreadsheet :global(.jss_worksheet > tbody > tr:hover > td) {
    background-color: color-mix(in srgb, var(--accent) 5%, var(--bg));
  }

  /* selected cell */
  .spreadsheet :global(.jss_worksheet > tbody > tr > td.selected),
  .spreadsheet :global(.jss_worksheet > tbody > tr > td.highlight) {
    background-color: color-mix(in srgb, var(--accent) 10%, var(--bg)) !important;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  /* row index column (first-child) */
  .spreadsheet :global(.jss_worksheet > tbody > tr > td:first-child) {
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
  .spreadsheet :global(.jss_worksheet > tbody > tr.selected > td:first-child) {
    background-color: color-mix(in srgb, var(--accent) 12%, var(--surface));
    color: var(--accent);
  }

  /* dragging state */
  .spreadsheet :global(.jss_worksheet > tbody > tr.dragging > td) {
    opacity: 0.4;
  }

  /* fill handle drag preview */
  .spreadsheet :global(.jss_worksheet > tbody > tr > td.fill-preview) {
    background-color: color-mix(in srgb, var(--accent) 12%, var(--bg)) !important;
  }

  /* readonly cells */
  .spreadsheet :global(.jss_worksheet > tbody > tr > td.readonly) {
    color: var(--muted);
  }

  /* ── editor overlay ── */
  .spreadsheet :global(.editor) {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-ui);
    font-size: 12px;
    border: 2px solid var(--accent);
    outline: none;
  }

  /* ── dropdown / filter popups ── */
  .spreadsheet :global(.jdropdown) {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 12px;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--fg) 12%, transparent);
  }

  .spreadsheet :global(.jdropdown .jdropdown-item:hover) {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    color: var(--fg);
  }

  .spreadsheet :global(.jdropdown .jdropdown-item.selected) {
    background: color-mix(in srgb, var(--accent) 15%, var(--surface));
    color: var(--accent);
  }

  /* ── column filter inputs ── */
  .spreadsheet :global(.jss_filter) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 2px;
  }

  .spreadsheet :global(.jss_filter:focus) {
    border-color: var(--accent);
    outline: none;
  }

  /* ── scrollbars ── */
  .spreadsheet :global(.jss_content::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }

  .spreadsheet :global(.jss_content::-webkit-scrollbar-track) {
    background: transparent;
  }

  .spreadsheet :global(.jss_content::-webkit-scrollbar-thumb) {
    background: var(--muted);
    border-radius: 4px;
  }

  .spreadsheet :global(.jss_content::-webkit-scrollbar-thumb:hover) {
    background: var(--fg-muted);
  }

  /* ── context menu ── */
  .spreadsheet :global(.jcontextmenu) {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 12px;
    box-shadow: 0 6px 18px color-mix(in srgb, var(--fg) 18%, transparent);
  }

  .spreadsheet :global(.jcontextmenu .jcontextmenu-item:hover) {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    color: var(--fg);
  }

  /* ── loading / empty ── */
  .spreadsheet :global(.jss_page) {
    background: var(--bg);
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: 13px;
  }
</style>
