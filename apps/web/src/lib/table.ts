import { metaHelper, tableFeatures } from '@tanstack/react-table'

import type { RowData } from '@tanstack/react-table'

// Lets column defs carry the header/cell `className` alongside the rest of
// the column definition, instead of re-deriving alignment/font styling from
// column index or id at render time.
export type ColumnMeta<TData extends RowData> = {
  headerClassName?: string
  // A function when the class depends on the row's data (e.g. dimming a
  // zero value) rather than being fixed per column.
  cellClassName?: string | ((row: TData) => string)
}

/** Registers a table's `columnMeta` type-only slot, scoped to its own row
 * type — v9's per-table feature registration replaces v8's single global
 * `declare module '@tanstack/react-table'` merge. */
export function tableFeaturesWithMeta<TData extends RowData>() {
  return tableFeatures({
    columnMeta: metaHelper<ColumnMeta<TData>>(),
  })
}

export function resolveCellClassName<TData extends RowData>(
  meta: ColumnMeta<TData> | undefined,
  row: TData,
): string | undefined {
  if (!meta?.cellClassName) return undefined
  return typeof meta.cellClassName === 'function' ? meta.cellClassName(row) : meta.cellClassName
}
