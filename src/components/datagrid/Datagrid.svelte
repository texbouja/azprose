<script lang="ts">
  // ── SVAR Grid wrapper (datagrid éditable) ─────────────────────────────────
  // Pendant SVAR de Spreadsheet.svelte (wrapper jspreadsheet) : reçoit les
  // données/colonnes en props, expose l'API Grid au parent via `getApi()`
  // (pour la toolbar undo/redo/filtres) et forwarde chaque édition de
  // cellule vers le parent via `onUpdateCell` — payload brut de l'action
  // `update-cell` du DataStore, y compris `eventSource` (les rejoués par
  // undo portent `eventSource: "undo"` ; le parent PERSISTE quand même,
  // le mode `undo` n'est pas un filtre de persistance).

  import { Grid } from "@svar-ui/svelte-grid";
  import type { IRow, IColumn, IApi, ISortMarks } from "@svar-ui/grid-store";

  /** Payload de l'action `update-cell` du DataStore SVAR (contrat exact de
   *  `IDataMethodsConfig["update-cell"]` ; `TID = number | string`). */
  export interface UpdateCellPayload {
    id: string | number;
    column: string | number;
    value: string | number | Date;
    eventSource?: string;
  }

  let {
    data = [],
    columns = [],
    undo = true,
    reorder = false,
    sortMarks = {},
    filterValues = {},
    sizes = {},
    onUpdateCell,
    onReady,
    class: className = "",
    ...restProps
  }: {
    data: IRow[];
    columns: IColumn[];
    /** Active l'historique undo/redo du Grid (Ctrl+Z / Ctrl+Y). */
    undo?: boolean;
    /** Réordonnancement des lignes par glisser-déposer. */
    reorder?: boolean;
    /** Marqueurs de tri colonne→état (contrat `ISortMarks`). */
    sortMarks?: ISortMarks;
    /** Filtres actifs (contrat `IFilterValues`, cf. `createFilter`). */
    filterValues?: Record<string, any>;
    /** Tailles (rowHeight/headerHeight/columnWidth). */
    sizes?: Record<string, any>;
    /** Fires à chaque édition de cellule (saisie, combo, date, undo…). */
    onUpdateCell?: (payload: UpdateCellPayload) => void;
    /** Fires une fois l'API Grid disponible (au premier init du DataStore). */
    onReady?: (api: IApi) => void;
    /** Prop Svelte `class`. */
    class?: string;
    /** Tout autre prop (onresizecolumn, onsortrows, onmoveitem…) est
     *  transmis au Grid et routé par son EventBusRouter (`on` + nom). */
    [key: string]: any;
  } = $props();

  let api: IApi | null = null;

  /** Accès à l'API Grid (exec/on/getReactiveState…) pour la toolbar parent. */
  export function getApi(): IApi | null {
    return api;
  }
</script>

<div class="datagrid{className ? ` ${className}` : ""}">
  <Grid
    {data}
    {columns}
    {undo}
    {reorder}
    {sortMarks}
    {filterValues}
    {sizes}
    init={(a) => {
      api = a;
      onReady?.(a);
    }}
    onupdatecell={(e: UpdateCellPayload) => onUpdateCell?.(e)}
    {...restProps}
  />
</div>

<style>
  .datagrid {
    height: 100%;
    overflow: hidden;
    font-family: var(--font-preview, var(--font-ui));
  }

  /* Le Grid rend son propre conteneur racine `.wx-grid` (avec `height: 100%`
     interne et `.wx-scroll { flex: 1 }`) ; on renforce la chaîne de hauteur
     pour que la zone de données remplisse l'espace disponible. */
  .datagrid :global(.wx-grid) {
    height: 100%;
  }
</style>
