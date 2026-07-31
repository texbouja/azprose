/**
 * Configuration par défaut pour les grilles SVAR DataGrid.
 * Active toutes les fonctionnalités spreadsheet :
 *   tri, redimensionnement, sélection, multi-select, undo.
 */

import type { IColumnConfig } from "@svar-ui/svelte-grid";

export interface GridConfigOverrides {
  columns?: IColumnConfig[];
  data?: Record<string, any>[];
  sort?: boolean;
  resize?: boolean;
  select?: boolean;
  multiselect?: boolean;
  undo?: boolean;
  filters?: boolean;
  [key: string]: any;
}

/**
 * Retourne une configuration par défaut enrichie pour une grille SVAR.
 *
 * Applique les réglages recommandés (tri, resize, sélection, undo)
 * tout en permettant les surcharges.
 *
 * @example
 * ```ts
 * const gridProps = defaultGridConfig({
 *   columns: myColumns,
 *   data: myData,
 *   sort: true,
 * });
 * ```
 */
export function defaultGridConfig(
  overrides: GridConfigOverrides,
): GridConfigOverrides {
  const {
    columns = [],
    ...rest
  } = overrides;

  return {
    columns: columns.map((col) => ({
      ...col,
      resize: col.resize ?? true,
      sort: col.sort ?? true,
    })),
    sort: true,
    resize: true,
    select: true,
    multiselect: true,
    undo: true,
    ...rest,
  };
}
