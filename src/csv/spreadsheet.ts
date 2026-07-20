import jspreadsheet from "jspreadsheet-ce";
import "jsuites/dist/jsuites.css";
import "jspreadsheet-ce/dist/jspreadsheet.css";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { writeCache, detectDrift, type CsvCache } from "./cache";
import { registerCsvFlush, unregisterCsvFlush } from "./flush";

export type SpreadsheetInstance = ReturnType<typeof jspreadsheet>[number];

export interface SpreadsheetResult {
  destroy: () => void;
  getCSV: () => string;
  getStyles: () => Record<string, string>;
  setStyles: (styles: Record<string, string>) => void;
  onchanges: Array<(csv: string) => void>;
  saveToDisk: () => Promise<void>;
  saveCache: () => Promise<void>;
}

function detectDelimiter(source: string): string {
  const firstLine = source.split("\n")[0] ?? "";
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  if (tabCount > commaCount && tabCount > semicolonCount) return "\t";
  if (semicolonCount > commaCount) return ";";
  return ",";
}

function escapeCSVField(value: string, delimiter: string): string {
  const str = String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function dataToCSV(data: (string | number | boolean)[][], delimiter: string): string {
  return data.map((row) => row.map((cell) => escapeCSVField(String(cell ?? ""), delimiter)).join(delimiter)).join("\n");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function debounce<F extends (...args: any[]) => void>(ms: number, fn: F): F {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as unknown as F;
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

/** CSV always writes evaluated values — never formula strings. */
function evaluatedCSV(sheet: any, toCSV: (d: any[][]) => string): string {
  return toCSV(sheet.getData(false, true));
}

// ── Main ───────────────────────────────────────────────────────────────────

export async function initSpreadsheet(
  el: HTMLDivElement,
  source: string,
  filePath: string,
  onChange?: (csv: string) => void,
): Promise<SpreadsheetResult> {
  const delimiter = detectDelimiter(source);

  const parsed: string[][] = jspreadsheet.helpers.parseCSV(source, delimiter);
  const allRows = parsed.map((row) => row.map((cell) => cell ?? ""));

  let cacheData: CsvCache | null = null;
  let dataRows: string[][];

  try {
    const drift = await detectDrift(filePath, source);
    if (drift.status === "no-drift" && drift.cache) {
      cacheData = drift.cache;
      dataRows = cacheData.data.map((row) => row.map(String));
    } else {
      dataRows = allRows;
    }
  } catch {
    dataRows = allRows;
  }

  const numCols = dataRows[0]?.length ?? 0;
  const columns = Array.from({ length: numCols }, () => ({
    width: 120,
  }));

  const sheetData = dataRows.map((row) =>
    Array.from({ length: numCols }, (_, i) => row[i] ?? ""),
  );

  function toCSV(data: (string | number | boolean)[][]): string {
    return dataToCSV(data, delimiter);
  }

  const onchanges: Array<(csv: string) => void> = [];
  if (onChange) onchanges.push(onChange);

  const debouncedCacheWrite = debounce(500, (
    data: (string | number | boolean)[][],
    styles: Record<string, string>,
    columnWidths: number[],
    hiddenColumns: number[],
    hiddenRows: number[],
    csv: string,
  ) => {
    writeCache(filePath, data, styles, columnWidths, hiddenColumns, hiddenRows, csv).catch(() => {});
  });

  let _instance: SpreadsheetInstance[] | null = null;

  async function saveToDisk(): Promise<void> {
    const sheet = _instance?.[0];
    if (!sheet) return;
    const { data, styles, columnWidths, hiddenColumns, hiddenRows } = grabState(sheet);
    const csv = evaluatedCSV(sheet, toCSV);
    await writeTextFile(filePath, csv);
    await writeCache(filePath, data, styles, columnWidths, hiddenColumns, hiddenRows, csv);
  }

  async function saveCache_(): Promise<void> {
    const sheet = _instance?.[0];
    if (!sheet) return;
    const { data, styles, columnWidths, hiddenColumns, hiddenRows } = grabState(sheet);
    const csv = evaluatedCSV(sheet, toCSV);
    await writeCache(filePath, data, styles, columnWidths, hiddenColumns, hiddenRows, csv);
  }

  // ── Create jspreadsheet ──────────────────────────────────────────────────
  const instance = jspreadsheet(el, {
    worksheets: [
      {
        data: sheetData,
        columns,
        csvHeaders: false,
        columnSorting: true,
        filters: true,
        textOverflow: false,
      },
    ],
    contextMenu: (sheet: any, col: string | number | null, row: string | number | null, _evt: any, items: any[], _role: string) => {
      const colIdx = col != null ? parseInt(String(col)) : null;
      const rowIdx = row != null ? parseInt(String(row)) : null;
      if (items.length > 0) items.push({ type: "line" });
      if (_role === "header" && colIdx != null) {
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
    },
    toolbar: (defaultToolbar: any) => {
      const items = defaultToolbar.items
        .map((item: any) => {
          if (item.content === "save") {
            return { ...item, title: "Save", onclick: () => { saveToDisk().catch(() => {}); } };
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
          {
            content: "print",
            title: "Print",
            onclick: () => {
              const sheet = instance[0];
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
            },
          },
        ],
      };
    },
    onchange: () => {
      const sheet = instance[0];
      if (!sheet) return;
      const { data, styles, columnWidths, hiddenColumns, hiddenRows } = grabState(sheet);
      const csv = evaluatedCSV(sheet, toCSV);
      for (const fn of onchanges) fn(csv);
      debouncedCacheWrite(data, styles, columnWidths, hiddenColumns, hiddenRows, csv);
    },
    onchangestyle: (_worksheet: any, newValue: any) => {
      const sheet = instance[0];
      if (!sheet) return;
      const { data, columnWidths, hiddenColumns, hiddenRows } = grabState(sheet);
      const csv = evaluatedCSV(sheet, toCSV);
      debouncedCacheWrite(data, newValue, columnWidths, hiddenColumns, hiddenRows, csv);
    },
  });

  _instance = instance;
  registerCsvFlush(filePath, saveCache_);

  // ── Double-click auto-fit column width ────────────────────────────────────
  const sheet = instance[0];
  if (sheet) {
    const thead = sheet.thead?.parentElement;
    if (thead) {
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

    // ── Fill handle drag highlight ───────────────────────────────────────────
    // jspreadsheet only marks the 4 border cells with selection-* classes.
    // We watch for those classes and fill the interior with a highlight.
    let fillHighlightEls: Element[] = [];
    const FILL_CLASS = "fill-preview";

    function clearFillHighlight() {
      for (const el of fillHighlightEls) el.classList.remove(FILL_CLASS);
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
        // Poll for selection-* classes during drag
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

  // ── Restore from cache ────────────────────────────────────────────────────
  if (cacheData) {
    const sheet = instance[0];
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

  return {
    destroy: () => {
      unregisterCsvFlush(filePath);
      jspreadsheet.destroy(el as any, true);
    },
    getCSV: () => {
      const sheet = instance[0];
      if (!sheet) return source;
      return evaluatedCSV(sheet, toCSV);
    },
    getStyles: () => {
      const sheet = instance[0];
      if (!sheet) return {};
      return sheet.getStyle() as Record<string, string>;
    },
    setStyles: (styles: Record<string, string>) => {
      const sheet = instance[0];
      if (sheet && Object.keys(styles).length > 0) {
        sheet.setStyle(styles);
      }
    },
    onchanges,
    saveToDisk,
    saveCache: saveCache_,
  };
}
