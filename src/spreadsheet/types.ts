// ── Types for SQLite-backed spreadsheet system ─────────────────────────────

export interface SpreadsheetMeta {
  id: string;
  name: string;
  original_path: string | null;
  lazy_type: string | null;
  imported_at: string;
  updated_at: string;
}

export interface SpreadsheetData {
  id: string;
  name: string;
  original_path: string | null;
  columns: ColumnDef[];
  data: string[][];
  state: SpreadsheetViewState;
  imported_at: string;
  updated_at: string;
}

export interface ColumnDef {
  title: string;
  width: number;
  type: string;
  options?: string | null;
}

export interface SpreadsheetViewState {
  hidden_columns: string;
  hidden_rows: string;
  frozen_columns: number;
  frozen_rows: number;
  sort_column: number | null;
  sort_order: string | null;
  /** Per-cell styles JSON object: { "row,col": "font-weight:bold;text-align:center" } */
  styles?: string;
}

/** One cell edit — coordinates straight from jspreadsheet's `onchange`. */
export interface CellChange {
  row_index: number;
  col_index: number;
  value: string;
}
