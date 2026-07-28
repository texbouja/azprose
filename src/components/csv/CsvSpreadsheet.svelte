<script lang="ts">
  import { tick } from "svelte";
  import { writeTextFile } from "@tauri-apps/plugin-fs";
  import jspreadsheet from "jspreadsheet-ce";
  import Spreadsheet, { type JspreadsheetInstance } from "@/components/spreadsheet/Spreadsheet.svelte";
  import { writeCache, detectDrift, type CsvCache } from "@/csv/cache";
  import { registerCsvFlush, unregisterCsvFlush } from "@/csv/flush";
  import { detectDelimiter, dataToCSV } from "@/csv/spreadsheet";

  let {
    value = "",
    filePath = "",
    onChange,
  }: {
    value?: string;
    filePath?: string;
    onChange?: (csv: string) => void;
  } = $props();

  let spreadsheetRef: Spreadsheet;

  let lastFilePath = "";
  let initGeneration = 0;

  let delimiter = ",";
  let data: (string | number | boolean)[][] = $state([]);
  let columns: Record<string, any>[] = $state([]);

  function toCSV(d: (string | number | boolean)[][]): string {
    return dataToCSV(d, delimiter);
  }

  function evaluatedCSV(): string {
    const api = spreadsheetRef?.getApi();
    const sheet = api?.[0];
    if (!sheet) return toCSV(data);
    return toCSV(sheet.getData(false, true));
  }

  function detectHidden(sheet: any): { hiddenColumns: number[]; hiddenRows: number[] } {
    const hiddenColumns: number[] = [];
    const hiddenRows: number[] = [];
    for (let i = 0; i < sheet.headers.length; i++) {
      if (sheet.headers[i]?.style?.display === "none") hiddenColumns.push(i);
    }
    for (let i = 0; i < sheet.rows.length; i++) {
      if (sheet.rows[i]?.element?.style?.display === "none") hiddenRows.push(i);
    }
    return { hiddenColumns, hiddenRows };
  }

  function grabState(sheet: any) {
    const rawData: (string | number | boolean)[][] = sheet.getData();
    const styles = (sheet.getStyle() as Record<string, string>) ?? {};
    const columnWidths = (sheet.getWidth() as (string | number)[]).map(Number);
    const { hiddenColumns, hiddenRows } = detectHidden(sheet);
    return { data: rawData, styles, columnWidths, hiddenColumns, hiddenRows };
  }

  function debounce<F extends (...args: any[]) => void>(ms: number, fn: F): F {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return ((...args: any[]) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    }) as unknown as F;
  }

  async function saveToDisk(): Promise<void> {
    const api = spreadsheetRef?.getApi();
    const sheet = api?.[0];
    if (!sheet || !filePath) return;
    const { data: d, styles, columnWidths, hiddenColumns, hiddenRows } = grabState(sheet);
    const csv = evaluatedCSV();
    await writeTextFile(filePath, csv);
    await writeCache(filePath, d, styles, columnWidths, hiddenColumns, hiddenRows, csv);
  }

  async function saveCache_(): Promise<void> {
    const api = spreadsheetRef?.getApi();
    const sheet = api?.[0];
    if (!sheet || !filePath) return;
    const { data: d, styles, columnWidths, hiddenColumns, hiddenRows } = grabState(sheet);
    const csv = evaluatedCSV();
    await writeCache(filePath, d, styles, columnWidths, hiddenColumns, hiddenRows, csv);
  }

  function handleSave() {
    saveToDisk().catch(() => {});
  }

  const debouncedCacheWrite = debounce(500, (
    d: (string | number | boolean)[][],
    styles: Record<string, string>,
    columnWidths: number[],
    hiddenColumns: number[],
    hiddenRows: number[],
    csv: string,
  ) => {
    if (!filePath) return;
    writeCache(filePath, d, styles, columnWidths, hiddenColumns, hiddenRows, csv).catch(() => {});
  });

  function handleCellChange(_colIndex: number, _rowIndex: number, _value: any, _oldValue: any) {
    const api = spreadsheetRef?.getApi();
    const sheet = api?.[0];
    if (!sheet) return;
    const { data: d, styles, columnWidths, hiddenColumns, hiddenRows } = grabState(sheet);
    const csv = evaluatedCSV();
    onChange?.(csv);
    debouncedCacheWrite(d, styles, columnWidths, hiddenColumns, hiddenRows, csv);
  }

  function printSheet() {
    const api = spreadsheetRef?.getApi();
    const sheet = api?.[0];
    if (!sheet) return;
    const allData: any[][] = sheet.getData(false, true);
    const headers: string[] = sheet.getHeaders() as string[];
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const h of headers) {
      const th = document.createElement("th");
      th.textContent = h;
      th.style.border = "1px solid #ccc";
      th.style.padding = "4px 8px";
      th.style.background = "#f5f5f5";
      th.style.textAlign = "left";
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const row of allData) {
      const tr = document.createElement("tr");
      for (const cell of row) {
        const td = document.createElement("td");
        td.textContent = String(cell ?? "");
        td.style.border = "1px solid #ccc";
        td.style.padding = "4px 8px";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    const win = window.open("", "_blank");
    if (win) {
      win.document.write("<html><head><title>CSV Export</title></head><body>");
      win.document.write(table.outerHTML);
      win.document.write("</body></html>");
      win.document.close();
      win.print();
    }
  }

  function buildToolbar(defaultToolbar: any, _instance: JspreadsheetInstance[]) {
    const items = defaultToolbar.items.map((item: any) => {
      if (item.content === "save") {
        return { ...item, title: "Save", onclick: handleSave };
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
            const api = spreadsheetRef?.getApi();
            const sheet = api?.[0];
            if (!sheet) return;
            sheet.showColumn(Array.from({ length: sheet.headers.length }, (_: any, i: number) => i));
            sheet.showRow(Array.from({ length: sheet.rows.length }, (_: any, i: number) => i));
          },
        },
        {
          content: "print",
          title: "Print",
          onclick: printSheet,
        },
      ],
    };
  }

  $effect(() => {
    const fp = filePath;
    const v = value;
    if (!fp || !v) return;

    if (fp === lastFilePath && data.length > 0) return;
    lastFilePath = fp;

    delimiter = detectDelimiter(v);
    const parsed: string[][] = jspreadsheet.helpers.parseCSV(v, delimiter);
    const allRows = parsed.map((row: string[]) => row.map((cell: string) => cell ?? ""));

    let cacheData: CsvCache | null = null;
    let dataRows: string[][];

    const gen = ++initGeneration;
    let cancelled = false;

    (async () => {
      try {
        const drift = await detectDrift(fp, v);
        if (drift.status === "no-drift" && drift.cache) {
          cacheData = drift.cache;
          dataRows = cacheData.data.map((row) => row.map(String));
        } else {
          dataRows = allRows;
        }
      } catch {
        dataRows = allRows;
      }

      if (cancelled || initGeneration !== gen) return;

      const numCols = dataRows[0]?.length ?? 0;
      columns = Array.from({ length: numCols }, () => ({
        width: 120,
      }));
      data = dataRows.map((row) =>
        Array.from({ length: numCols }, (_, i) => row[i] ?? ""),
      );

      await tick();
      if (cancelled || initGeneration !== gen) return;

      registerCsvFlush(fp, saveCache_);

      if (cacheData) {
        await tick();
        const api = spreadsheetRef?.getApi();
        const sheet = api?.[0];
        if (sheet) {
          if (Object.keys(cacheData.styles).length > 0) {
            sheet.setStyle(cacheData.styles);
          }
          if (Array.isArray(cacheData.columnWidths) && cacheData.columnWidths.length > 0) {
            cacheData.columnWidths.forEach((w, i) => { if (w > 0) sheet.setWidth(i, w); });
          }
          if (cacheData.hiddenColumns.length > 0) {
            sheet.hideColumn(cacheData.hiddenColumns);
          }
          if (cacheData.hiddenRows.length > 0) {
            sheet.hideRow(cacheData.hiddenRows);
          }
        }
      } else {
        saveCache_().catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
      saveCache_().catch(() => {});
      unregisterCsvFlush(fp);
      lastFilePath = "";
    };
  });
</script>

<Spreadsheet
  bind:this={spreadsheetRef}
  {data}
  {columns}
  onchange={handleCellChange}
  onSave={handleSave}
  toolbar={buildToolbar}
  class="csv-spreadsheet"
  worksheetOptions={{
    columnSorting: true,
    textOverflow: false,
  }}
/>

<style>
  .csv-spreadsheet :global(.jss_worksheet) {
    font-family: var(--csv-font-family, var(--font-ui));
    font-size: var(--csv-font-size, 12px);
    line-height: var(--csv-line-height, 1.4);
  }

  .csv-spreadsheet :global(.jss_worksheet > thead > tr > td) {
    font-family: var(--font-ui);
    font-size: 11px;
  }

  .csv-spreadsheet :global(.jss_worksheet > tbody > tr > td) {
    font-family: var(--csv-font-family, var(--font-ui));
    font-size: var(--csv-font-size, 12px);
    line-height: var(--csv-line-height, 1.4);
  }

  .csv-spreadsheet :global(.editor) {
    font-family: var(--csv-font-family, var(--font-ui));
    font-size: var(--csv-font-size, 12px);
    line-height: var(--csv-line-height, 1.4);
  }
</style>
