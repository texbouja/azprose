// ── Types for SQLite-backed SVAR datagrid system ───────────────────────────
// v8 model: a datagrid is a VIEW over a source spreadsheet. `DatagridData` is
// built live at read time (columns JOINed from spreadsheet_columns × view
// config, rows from spreadsheet_cells) — never a stored snapshot.

export interface DatagridMeta {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  /** Set when the grid is derived from a spreadsheet (the view's source). */
  source_spreadsheet_id?: string | null;
}

/** Column definition as READ from the JOIN: title/type/options come from the
 *  source spreadsheet (single source of truth), width/hidden from the view
 *  config (falling back to the spreadsheet values). */
export interface DatagridColumnDef {
  id: string;
  title: string;
  type: string;
  width: number;
  options?: string | null;
  hidden: boolean;
  /** Per-column filter rule, persisted as opaque JSON (an `@svar-ui` `IFilter`
   *  without `field` — the field IS the column). Column reserved by the v8/v9
   *  migrations and still covered by the backend tests, but no longer written
   *  by the frontend: the stack filter is now STACK-WIDE and lives in
   *  `datagrid_stack_rules` (v10), keyed by column title. */
  filter?: string | null;
}

/** Row = a JSON `{colId: value}` DataHash blob (SVAR IRow shape), rebuilt
 *  from spreadsheet_cells at read time. */
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
  /** Set when the grid is derived from a spreadsheet (the view's source). */
  source_spreadsheet_id?: string | null;
}

/** One rule of the STACK-wide filter (v10). Rules are global to the
 *  "Recherche dans la base de données" stack — the `field` is the column
 *  TITLE (shared across every grid), and `rule` is the opaque JSON of an
 *  `@svar-ui` `IFilter` without `field` (the field IS the title). Persisted
 *  in `datagrid_stack_rules` (replace-all snapshot). */
export interface StackFilterRule {
  /** Column title — the rule applies to every grid that has this column. */
  field: string;
  /** Opaque JSON rule: `{"filter":<predicate id>,"type":<type>,"value":<v>}`. */
  rule: string;
}

/** Column title + detected value type, reported by each stacked grid so the
 *  unified filter widget can build its field list (union over the stack). */
export interface StackFilterField {
  field: string;
  type: "text" | "number" | "date";
}
