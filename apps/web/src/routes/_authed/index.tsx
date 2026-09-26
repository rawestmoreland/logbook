import { Suspense, useEffect, useState } from 'react'
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createColumnHelper, useTable } from '@tanstack/react-table'

import { formatDateValue, formatFlightsAsCsv } from '@logbook/core'

import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { flightsPageQueryOptions, flightsSummaryQueryOptions } from '#/lib/queries/flights'
import { deleteFlight, getFlightsForExport, PAGE_SIZE, subtractTotals } from '#/lib/server/flights'
import { resolveCellClassName, tableFeaturesWithMeta } from '#/lib/table'
import type { FlightListItem, FlightTotals } from '#/lib/server/flights'

import type { Dispatch, SetStateAction } from 'react'

export const Route = createFileRoute('/_authed/')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    // Both queries prefetched up front so first load is a single round trip
    // (like before the summary/page split) — only *later* page/filter
    // changes end up scoped to just `flightsPageQueryOptions`'s refetch.
    await Promise.all([
      queryClient.query({ ...flightsSummaryQueryOptions(pilotId), staleTime: 'static' }),
      queryClient.query({ ...flightsPageQueryOptions(pilotId), staleTime: 'static' }),
    ])
  },
  component: FlightsPage,
})

// Fixed 3-letter abbreviations rather than an Intl locale: en-GB's CLDR data
// renders September as "Sept", which doesn't match the Main design
// artboard's "09 Sep" mock data or a paper logbook's day-month order.
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function formatShortDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
}

function formatLongDate(iso: string) {
  const d = new Date(iso)
  return `${formatShortDate(iso)} ${d.getFullYear()}`
}

/** A zero reads as absence, not as data — dim it so the eye lands on real values. */
function formatHours(n: number): { text: string; dim: boolean } {
  return n === 0 ? { text: '—', dim: true } : { text: n.toFixed(1), dim: false }
}

/** Single `Lndgs` cell: total landings, with the day/night split in parens — e.g. `3(3D)`, `5(3D 2N)`. */
function formatLandings(day: number, night: number): { text: string; dim: boolean } {
  const total = day + night
  if (total === 0) return { text: '—', dim: true }
  const parts: Array<string> = []
  if (day > 0) parts.push(`${day}D`)
  if (night > 0) parts.push(`${night}N`)
  return { text: `${total}(${parts.join(' ')})`, dim: false }
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '0%'
  return `${((part / whole) * 100).toFixed(1)}%`
}

const flightFeatures = tableFeaturesWithMeta<FlightListItem>()
const flightColumnHelper = createColumnHelper<typeof flightFeatures, FlightListItem>()

/** Shared shape for the PIC/Dual/Solo/Night/Actual/Sim/Ngt-landings columns
 * — same right-aligned mono cell, dimmed when the value is a zero. */
function numColumn(
  id: string,
  getValue: (f: FlightListItem) => number,
  format: (n: number) => { text: string; dim: boolean },
) {
  return flightColumnHelper.display({
    id,
    cell: (info) => format(getValue(info.row.original)).text,
    meta: {
      cellClassName: (f: FlightListItem) => {
        const { dim } = format(getValue(f))
        return `border-b border-border/60 px-2 text-right font-mono text-[12.5px] ${dim ? 'text-ink-zero' : 'text-ink'}`
      },
    },
  })
}

function FlightsPage() {
  const { pilotId } = Route.useRouteContext()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [aircraftId, setAircraftId] = useState('')

  // Same debounce pattern as model-picker.tsx's search-as-you-type.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) setDebouncedSearch(search)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  // Page is reset from the input handlers directly (handleSearchChange/
  // handleAircraftChange) rather than a useEffect keyed on the filter
  // values: useSuspenseQuery suspends on every page/filter change, and
  // React re-runs a suspended-then-resumed subtree's effects from scratch
  // regardless of whether their dependencies actually changed — an effect
  // here would also fire (and reset page back to 1) on a plain page
  // navigation, not just on a real filter change.
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }
  const handleAircraftChange = (value: string) => {
    setAircraftId(value)
    setPage(1)
  }

  // Independent of page/search/aircraft filter, so the header/stats strip
  // below stay mounted (and un-refetched) while the table re-suspends on
  // its own as `page`/`debouncedSearch`/`aircraftId` change — see
  // `FlightsTable`.
  const { data: summary } = useSuspenseQuery(flightsSummaryQueryOptions(pilotId))
  const { totalCount, firstFlightDate, grandTotals } = summary

  const { data: aircraftList } = useQuery(aircraftQueryOptions(pilotId))

  const hasFilter = !!(debouncedSearch || aircraftId)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      const rows = await getFlightsForExport({ data: { pilotId } })
      const csv = formatFlightsAsCsv(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `logbook-export-${formatDateValue(new Date())}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export flights')
    } finally {
      setExporting(false)
    }
  }

  const stats = [
    {
      label: 'Total time',
      value: grandTotals.totalTime.toFixed(1),
      note: `${totalCount} ${totalCount === 1 ? 'flight' : 'flights'}`,
    },
    {
      label: 'PIC',
      value: grandTotals.picTime.toFixed(1),
      note: `${pct(grandTotals.picTime, grandTotals.totalTime)} of total`,
    },
    {
      label: 'Dual',
      value: grandTotals.dualTime.toFixed(1),
      note: `${pct(grandTotals.dualTime, grandTotals.totalTime)} of total`,
    },
    {
      label: 'Night',
      value: grandTotals.nightTime.toFixed(1),
      note: `${grandTotals.nightLandingsFullStop} night landings`,
    },
    {
      label: 'Instrument',
      value: (grandTotals.actualInstrument + grandTotals.simInstrument).toFixed(
        1,
      ),
      note: `${grandTotals.actualInstrument.toFixed(1)} actual · ${grandTotals.simInstrument.toFixed(1)} sim`,
    },
    {
      label: 'Cross-country',
      value: grandTotals.crossCountryTime.toFixed(1),
      note: `${pct(grandTotals.crossCountryTime, grandTotals.totalTime)} of total`,
    },
    {
      label: 'Landings',
      value: String(grandTotals.totalLandings),
      note: `${grandTotals.totalLandings - grandTotals.nightLandingsFullStop} day · ${grandTotals.nightLandingsFullStop} night`,
    },
  ]

  return (
    <>
      {/* page header */}
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">
            Flights
          </div>
          <div className="text-xs text-ink-dim">
            {totalCount} {totalCount === 1 ? 'entry' : 'entries'}
            {firstFlightDate && (
              <> · first logged {formatLongDate(firstFlightDate)}</>
            )}
          </div>
        </div>
        <div className="flex-grow" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-ink disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <Link
            to="/print-logbook"
            className="flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-ink"
          >
            Print logbook
          </Link>
          <Link
            to="/log-flight"
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Log flight
          </Link>
        </div>
      </div>

      {/* totals strip */}
      <div className="grid flex-shrink-0 grid-cols-2 gap-3 px-8 pt-4.5 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3.5 py-3"
          >
            <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              {s.label}
            </div>
            <div className="font-mono text-2xl leading-none font-medium tracking-tight tabular-nums">
              {s.value}
            </div>
            <div className="text-[11px] text-ink-dim">{s.note}</div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-shrink-0 items-center gap-2 px-8 pt-4.5 pb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search route, tail number, remarks"
          className="h-8 w-64 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <select
          value={aircraftId}
          onChange={(e) => handleAircraftChange(e.target.value)}
          className="h-8 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink focus:outline-none"
        >
          <option value="">All aircraft</option>
          {aircraftList?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayTailNumber}
            </option>
          ))}
        </select>
      </div>

      {/*
       * The table, its totals footer, the "Showing X of Y" line and
       * pagination all live in their own suspense boundary: they're the
       * only things that need to re-fetch (and briefly show a fallback) as
       * `page`/`debouncedSearch`/`aircraftId` change. Everything above —
       * header, stats strip, search input, aircraft filter — reads from the
       * page/filter-independent summary query and stays mounted throughout,
       * instead of the whole route re-suspending on every click through.
       */}
      <Suspense fallback={<FlightsTableFallback />}>
        <FlightsTable
          pilotId={pilotId}
          page={page}
          search={debouncedSearch}
          aircraftId={aircraftId}
          hasFilter={hasFilter}
          grandTotals={grandTotals}
          onPageChange={setPage}
        />
      </Suspense>

      {!!exportError && <p className="px-8 pb-4 text-xs text-status-bad">{exportError}</p>}
    </>
  )
}

// Shared by the real table and its loading skeleton, so column widths and
// the header row line up pixel-for-pixel between the two.
const TABLE_HEADERS = [
  'Date',
  'Type',
  'Ident',
  'From',
  'To',
  'Total',
  'PIC',
  'Dual',
  'Solo',
  'Night',
  'X-ctry',
  'Actual',
  'Sim',
  'Lndgs',
  'Remarks',
  '',
] as const

function TableColgroup() {
  return (
    <colgroup>
      <col className="w-22" />
      <col className="w-[74px]" />
      <col className="w-[86px]" />
      <col className="w-[58px]" />
      <col className="w-[58px]" />
      <col className="w-[62px]" />
      <col className="w-[62px]" />
      <col className="w-[62px]" />
      <col className="w-[62px]" />
      <col className="w-[62px]" />
      <col className="w-[62px]" />
      <col className="w-[62px]" />
      <col className="w-12" />
      <col className="w-[72px]" />
      <col />
      <col className="w-[68px]" />
    </colgroup>
  )
}

function TableHeadRow() {
  return (
    <thead>
      <tr className="h-[30px] bg-surface-alt">
        {TABLE_HEADERS.map((h, i) => (
          <th
            key={h || 'actions'}
            className={`border-b border-border px-2 text-xs font-semibold text-ink-dim first:px-2.5 last:px-3 ${
              i >= 5 && i <= 13 ? 'text-right' : 'text-left'
            }`}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function FlightsTable({
  pilotId,
  page,
  search,
  aircraftId,
  hasFilter,
  grandTotals,
  onPageChange,
}: {
  pilotId: string
  page: number
  search: string
  aircraftId: string
  hasFilter: boolean
  grandTotals: FlightTotals
  onPageChange: Dispatch<SetStateAction<number>>
}) {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(flightsPageQueryOptions(pilotId, { page, search, aircraftId }))
  const { flights, pageTotals, filteredCount, totalPages } = data
  const amountForwardTotals = subtractTotals(grandTotals, pageTotals)

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const handleDelete = async (id: string) => {
    setDeleteError('')
    setDeletingId(id)
    try {
      await deleteFlight({ data: { id } })
      // The summary (grand totals/lifetime count/first-logged date) and
      // this page both depend on the flight that just disappeared, so both
      // need a refetch rather than a hand-patched cache update.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flights-summary', pilotId] }),
        queryClient.invalidateQueries({ queryKey: ['flights-page', pilotId] }),
      ])
      setConfirmingDeleteId(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete flight')
    } finally {
      setDeletingId(null)
    }
  }

  const columns = flightColumnHelper.columns([
    flightColumnHelper.display({
      id: 'date',
      cell: (info) => formatShortDate(info.row.original.date),
      meta: { cellClassName: 'border-b border-border/60 px-2.5 font-mono text-[12.5px] text-ink' },
    }),
    flightColumnHelper.display({
      id: 'type',
      cell: (info) => info.row.original.aircraftType || '—',
      meta: {
        cellClassName:
          'overflow-hidden border-b border-border/60 px-2 text-[12.5px] text-ellipsis whitespace-nowrap text-ink-dim',
      },
    }),
    flightColumnHelper.display({
      id: 'ident',
      cell: (info) => info.row.original.aircraftIdent || '—',
      meta: { cellClassName: 'border-b border-border/60 px-2 font-mono text-[12.5px] text-ink' },
    }),
    flightColumnHelper.display({
      id: 'from',
      cell: (info) => info.row.original.routeFrom || '—',
      meta: { cellClassName: 'border-b border-border/60 px-2 font-mono text-[12.5px] text-ink' },
    }),
    flightColumnHelper.display({
      id: 'to',
      cell: (info) => info.row.original.routeTo || '—',
      meta: { cellClassName: 'border-b border-border/60 px-2 font-mono text-[12.5px] text-ink' },
    }),
    flightColumnHelper.display({
      id: 'total',
      cell: (info) => {
        const { totalTime } = info.row.original
        return totalTime === 0 ? '—' : totalTime.toFixed(1)
      },
      meta: {
        cellClassName: 'border-b border-border/60 px-2 text-right font-mono text-[12.5px] font-medium text-ink',
      },
    }),
    numColumn('pic', (f) => f.picTime, formatHours),
    numColumn('dual', (f) => f.dualTime, formatHours),
    numColumn('solo', (f) => f.soloTime, formatHours),
    numColumn('night', (f) => f.nightTime, formatHours),
    numColumn('xc', (f) => f.crossCountryTime, formatHours),
    numColumn('actual', (f) => f.actualInstrument, formatHours),
    numColumn('sim', (f) => f.simInstrument, formatHours),
    flightColumnHelper.display({
      id: 'lndgs',
      cell: (info) => {
        const { totalLandings, nightLandingsFullStop } = info.row.original
        return formatLandings(totalLandings - nightLandingsFullStop, nightLandingsFullStop).text
      },
      meta: {
        cellClassName: (f: FlightListItem) => {
          const { dim } = formatLandings(f.totalLandings - f.nightLandingsFullStop, f.nightLandingsFullStop)
          return `border-b border-border/60 px-2 text-right font-mono text-[12.5px] ${dim ? 'text-ink-zero' : 'text-ink'}`
        },
      },
    }),
    flightColumnHelper.display({
      id: 'remarks',
      cell: (info) => info.row.original.remarks || '—',
      meta: {
        cellClassName:
          'overflow-hidden border-b border-border/60 px-3 text-[12.5px] text-ellipsis whitespace-nowrap text-ink-dim',
      },
    }),
    flightColumnHelper.display({
      id: 'actions',
      cell: (info) => {
        const f = info.row.original
        const confirmingDelete = confirmingDeleteId === f.id
        const deleting = deletingId === f.id
        return (
          <div
            className={`flex items-center justify-end gap-1 ${
              confirmingDelete ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
            }`}
          >
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  aria-label={`Confirm delete flight on ${formatShortDate(f.date)}`}
                  title="Confirm delete"
                  onClick={() => handleDelete(f.id)}
                  disabled={deleting}
                  className="flex h-6 w-6 items-center justify-center rounded text-status-bad hover:bg-status-bad/10 disabled:opacity-60"
                >
                  <CheckIcon />
                </button>
                <button
                  type="button"
                  aria-label="Cancel delete"
                  title="Cancel"
                  onClick={() => setConfirmingDeleteId(null)}
                  disabled={deleting}
                  className="flex h-6 w-6 items-center justify-center rounded text-ink-dim hover:bg-surface-alt disabled:opacity-60"
                >
                  <XIcon />
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/log-flight/$flightId"
                  params={{ flightId: f.id }}
                  aria-label={`Edit flight on ${formatShortDate(f.date)}`}
                  title="Edit"
                  className="flex h-6 w-6 items-center justify-center rounded text-ink-dim hover:bg-surface-alt hover:text-ink"
                >
                  <PencilIcon />
                </Link>
                <button
                  type="button"
                  aria-label={`Delete flight on ${formatShortDate(f.date)}`}
                  title="Delete"
                  onClick={() => setConfirmingDeleteId(f.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-ink-dim hover:bg-status-bad/10 hover:text-status-bad"
                >
                  <TrashIcon />
                </button>
              </>
            )}
          </div>
        )
      },
      meta: { cellClassName: 'border-b border-border/60 px-1.5 text-right' },
    }),
  ])

  const table = useTable({
    features: flightFeatures,
    data: flights,
    columns,
    getRowId: (f) => f.id,
  })

  return (
    <>
      <div className="flex flex-shrink-0 justify-end px-8 pb-3">
        <div className="text-xs text-ink-dim">
          {filteredCount === 0
            ? 'Showing 0 of 0'
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredCount)} of ${filteredCount}`}
        </div>
      </div>

      {/* table */}
      <div className="min-h-0 flex-grow px-8 pb-6">
        <div className="h-full overflow-auto rounded-lg border border-border bg-surface">
          <table className="w-full table-fixed border-collapse">
            <TableColgroup />
            <TableHeadRow />
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="group h-9">
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id} className={resolveCellClassName(cell.column.columnDef.meta, row.original)}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
              {flights.length === 0 && (
                <tr>
                  <td
                    colSpan={15}
                    className="px-3 py-8 text-center text-sm text-ink-dim"
                  >
                    {hasFilter ? 'No flights match your filters.' : 'No flights logged yet.'}
                  </td>
                </tr>
              )}
            </tbody>
            {flights.length > 0 && (
              <TotalsFoot
                pageTotals={pageTotals}
                amountForwardTotals={amountForwardTotals}
                grandTotals={grandTotals}
              />
            )}
          </table>
        </div>
      </div>

      {/* pagination */}
      <div className="flex flex-shrink-0 items-center justify-end gap-2 px-8 pb-4">
        <button
          type="button"
          onClick={() => onPageChange((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="flex h-7.5 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-ink disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-xs text-ink-dim">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange((p) => Math.min(Math.max(totalPages, 1), p + 1))}
          disabled={page >= totalPages}
          className="flex h-7.5 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-ink disabled:opacity-40"
        >
          Next
        </button>
      </div>

      {!!deleteError && <p className="px-8 pb-4 text-xs text-status-bad">{deleteError}</p>}
    </>
  )
}

/**
 * Per-column skeleton bar shape for `SkeletonRow`, matching each column's
 * real alignment/rough content width — reusing `TableColgroup`/
 * `TableHeadRow` gets the header and column widths pixel-identical for
 * free, but the body's alignment isn't derivable from those, so it's
 * spelled out here instead.
 */
const SKELETON_COLUMNS = [
  { align: 'left', width: 'w-10' }, // Date
  { align: 'left', width: 'w-14' }, // Type
  { align: 'left', width: 'w-12' }, // Ident
  { align: 'left', width: 'w-8' }, // From
  { align: 'left', width: 'w-8' }, // To
  { align: 'right', width: 'w-6' }, // Total
  { align: 'right', width: 'w-6' }, // PIC
  { align: 'right', width: 'w-6' }, // Dual
  { align: 'right', width: 'w-6' }, // Solo
  { align: 'right', width: 'w-6' }, // Night
  { align: 'right', width: 'w-6' }, // X-ctry
  { align: 'right', width: 'w-6' }, // Actual
  { align: 'right', width: 'w-6' }, // Sim
  { align: 'right', width: 'w-10' }, // Lndgs
  { align: 'left', width: 'w-28' }, // Remarks
  { align: 'left', width: '' }, // actions — left blank
] as const

function SkeletonRow() {
  return (
    <tr className="h-9">
      {SKELETON_COLUMNS.map((col, i) => (
        <td
          key={i}
          className="border-b border-border/60 px-2 first:px-2.5 last:px-1.5"
        >
          {!!col.width && (
            <div
              className={`h-2.5 animate-pulse rounded bg-ink-zero ${col.width} ${
                col.align === 'right' ? 'ml-auto' : ''
              }`}
            />
          )}
        </td>
      ))}
    </tr>
  )
}

/** Same three-row shape as `TotalsFoot`, with the (unchanging) row labels kept and the numbers skeletoned. */
function SkeletonFoot() {
  const skeletonCells = (count: number) =>
    Array.from({ length: count }, (_, i) => (
      <td key={i} className="border-b border-border/60 px-2 text-right">
        <div className="ml-auto h-2.5 w-8 animate-pulse rounded bg-ink-zero" />
      </td>
    ))

  return (
    <tfoot>
      <tr className="h-[30px] bg-surface-alt">
        <td colSpan={5} className="px-2.5 text-xs font-semibold tracking-wide text-ink-dim">
          This page
        </td>
        {skeletonCells(9)}
        <td className="border-b border-border/60" />
        <td className="border-b border-border/60" />
      </tr>
      <tr className="h-[30px] bg-surface-alt">
        <td colSpan={5} className="px-2.5 text-xs font-semibold tracking-wide text-ink-dim">
          Amount forward
        </td>
        {skeletonCells(9)}
        <td className="border-b border-border/60" />
        <td className="border-b border-border/60" />
      </tr>
      <tr className="h-9 bg-[#f4f7f9]">
        <td colSpan={5} className="px-2.5 text-xs font-semibold tracking-wide text-ink uppercase">
          Total to date
        </td>
        {skeletonCells(9)}
        <td className="px-3 text-[11px] text-ink-faint">Certified totals</td>
        <td />
      </tr>
    </tfoot>
  )
}

/**
 * Mirrors `FlightsTable`'s layout/heights (down to the shared
 * `TableColgroup`/`TableHeadRow`) so swapping it in while the table's own
 * query is loading doesn't jump the page — a full row-shaped skeleton
 * reads as "this content is refreshing" rather than the table being
 * replaced by a blank state and back.
 */
function FlightsTableFallback() {
  return (
    <>
      <div className="flex flex-shrink-0 justify-end px-8 pb-3">
        <div className="h-3 w-28 animate-pulse rounded bg-ink-zero" />
      </div>
      <div className="min-h-0 flex-grow px-8 pb-6">
        <div className="h-full overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full table-fixed border-collapse">
            <TableColgroup />
            <TableHeadRow />
            <tbody>
              {Array.from({ length: PAGE_SIZE }, (_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
            <SkeletonFoot />
          </table>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center justify-end gap-2 px-8 pb-4 opacity-40">
        <button
          type="button"
          disabled
          className="flex h-7.5 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-ink"
        >
          Previous
        </button>
        <span className="text-xs text-ink-dim">Page</span>
        <button
          type="button"
          disabled
          className="flex h-7.5 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-ink"
        >
          Next
        </button>
      </div>
    </>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
      <path
        d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12l-7.2 7.2-2.67.55.55-2.67 7.2-7.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
      <path
        d="M3 4.5h10M6.5 4.5v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M6 7v4.5M10 7v4.5M4 4.5l.6 8a1 1 0 0 0 1 .95h4.8a1 1 0 0 0 1-.95l.6-8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
      <path
        d="M3.5 8.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TotalsFoot({
  pageTotals,
  amountForwardTotals,
  grandTotals,
}: {
  pageTotals: FlightTotals
  amountForwardTotals: FlightTotals
  grandTotals: FlightTotals
}) {
  const cell = (n: number, opts?: { bold?: boolean }) => (
    <td
      className={`border-b border-border/60 px-2 text-right font-mono text-[12.5px] text-ink-dim ${
        opts?.bold ? 'text-[13.5px] font-medium text-ink' : ''
      }`}
    >
      {n.toFixed(1)}
    </td>
  )

  const landingsCell = (n: number, opts?: { bold?: boolean }) => (
    <td
      className={`border-b border-border/60 px-2 text-right font-mono text-[12.5px] text-ink-dim ${
        opts?.bold ? 'text-[13.5px] font-medium text-ink' : ''
      }`}
    >
      {n}
    </td>
  )

  return (
    <tfoot>
      <tr className="h-[30px] bg-surface-alt">
        <td
          colSpan={5}
          className="px-2.5 text-xs font-semibold tracking-wide text-ink-dim"
        >
          This page
        </td>
        {cell(pageTotals.totalTime)}
        {cell(pageTotals.picTime)}
        {cell(pageTotals.dualTime)}
        {cell(pageTotals.soloTime)}
        {cell(pageTotals.nightTime)}
        {cell(pageTotals.crossCountryTime)}
        {cell(pageTotals.actualInstrument)}
        {cell(pageTotals.simInstrument)}
        {landingsCell(pageTotals.totalLandings)}
        <td className="border-b border-border/60" />
        <td className="border-b border-border/60" />
      </tr>
      <tr className="h-[30px] bg-surface-alt">
        <td
          colSpan={5}
          className="px-2.5 text-xs font-semibold tracking-wide text-ink-dim"
        >
          Amount forward
        </td>
        {cell(amountForwardTotals.totalTime)}
        {cell(amountForwardTotals.picTime)}
        {cell(amountForwardTotals.dualTime)}
        {cell(amountForwardTotals.soloTime)}
        {cell(amountForwardTotals.nightTime)}
        {cell(amountForwardTotals.crossCountryTime)}
        {cell(amountForwardTotals.actualInstrument)}
        {cell(amountForwardTotals.simInstrument)}
        {landingsCell(amountForwardTotals.totalLandings)}
        <td className="border-b border-border/60" />
        <td className="border-b border-border/60" />
      </tr>
      <tr className="h-9 bg-[#f4f7f9]">
        <td
          colSpan={5}
          className="px-2.5 text-xs font-semibold tracking-wide text-ink uppercase"
        >
          Total to date
        </td>
        {cell(grandTotals.totalTime, { bold: true })}
        {cell(grandTotals.picTime, { bold: true })}
        {cell(grandTotals.dualTime, { bold: true })}
        {cell(grandTotals.soloTime, { bold: true })}
        {cell(grandTotals.nightTime, { bold: true })}
        {cell(grandTotals.crossCountryTime, { bold: true })}
        {cell(grandTotals.actualInstrument, { bold: true })}
        {cell(grandTotals.simInstrument, { bold: true })}
        {landingsCell(grandTotals.totalLandings, { bold: true })}
        <td className="px-3 text-[11px] text-ink-faint">Certified totals</td>
        <td />
      </tr>
    </tfoot>
  )
}
