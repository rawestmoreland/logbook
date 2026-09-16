import type { ColumnMeta, RowData } from '@tanstack/react-table'

// Lets column defs carry the header/cell `className` alongside the rest of
// the column definition, instead of re-deriving alignment/font styling from
// column index or id at render time. Declared against `RowData` (rather than
// a bare `TData`) to match the type parameters of the upstream `ColumnMeta`
// interface this is merging into — TS requires identical type parameters
// across all declarations of the same interface.
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    headerClassName?: string
    // A function when the class depends on the row's data (e.g. dimming a
    // zero value) rather than being fixed per column.
    cellClassName?: string | ((row: TData) => string)
  }
}

export function resolveCellClassName<TData extends RowData>(
  meta: ColumnMeta<TData, unknown> | undefined,
  row: TData,
): string | undefined {
  if (!meta?.cellClassName) return undefined
  return typeof meta.cellClassName === 'function' ? meta.cellClassName(row) : meta.cellClassName
}
