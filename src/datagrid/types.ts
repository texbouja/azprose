// ── Types for SQLite-backed SVAR datagrid system ───────────────────────────

export interface DatagridMeta {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** Column definition (mirrors SVAR grid IColumnConfig subset persisted). */
export interface DatagridColumnDef {
  id: string;
  title: string;
  type: string;
  width: number;
  options?: string | null;
  hidden: boolean;
}

/** Row = a JSON `{colId: value}` DataHash blob (SVAR IRow shape). */
export interface DatagridRow {
  id: string;
  data: string;
}

export interface DatagridData {
  id: string;
  name: string;
  columns: DatagridColumnDef[];
  rows: DatagridRow[];
  created_at: string;
  updated_at: string;
}
