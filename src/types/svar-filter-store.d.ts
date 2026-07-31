/**
 * Type shim for @svar-ui/filter-store.
 * The package's types field doesn't resolve correctly.
 * We declare only the exports used in the project.
 */

declare module "@svar-ui/filter-store" {
  // ── Types ──────────────────────────────────────────────────
  export type TFilterType =
    | "greater" | "less" | "greaterOrEqual" | "lessOrEqual"
    | "equal" | "notEqual"
    | "contains" | "notContains"
    | "beginsWith" | "notBeginsWith"
    | "endsWith" | "notEndsWith"
    | "between" | "notBetween";

  export type TType = "number" | "text" | "date" | "tuple";

  export type AnyData = number | string | Date;

  export interface IFilter {
    field: string | "*";
    type?: TType;
    predicate?: string;
    filter?: TFilterType;
    includes?: AnyData[];
    value?: AnyData;
  }

  export interface IFilterSet {
    rules?: (IFilter | IFilterSet)[];
    glue?: "and" | "or";
  }

  export interface IField {
    id: string;
    label: string;
    type: TType;
    predicate?: string;
    format?: string | ((value: AnyData) => string);
  }

  export type ArrayFilterFunction = (value: any[]) => any[];

  export interface FilterOptions {
    orNull?: boolean;
  }

  // ── Functions ──────────────────────────────────────────────
  export function createArrayFilter(
    cfg: IFilterSet,
    opts?: FilterOptions,
    fields?: IField[],
  ): ArrayFilterFunction;
}
