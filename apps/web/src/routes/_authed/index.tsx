import { Suspense, useEffect, useState } from 'react'
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createColumnHelper, useTable } from '@tanstack/react-table'

import {
  categoryOf,
  dayPassengerCurrency,
  formatDateValue,
  formatFlightsAsCsv,
  instrumentCurrency,
  nightPassengerCurrency,
  parseDateValue,
} from '@logbook/core'

import { toCurrencyFlight } from '#/lib/currency'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { airlineInsightsQueryOptions } from '#/lib/queries/airline-insights'
import { currencyQueryOptions } from '#/lib/queries/currency'
import { flightsPageQueryOptions, flightsSummaryQueryOptions } from '#/lib/queries/flights'
import { pilotProfileQueryOptions } from '#/lib/queries/pilot'
import { deleteFlight, getFlightsForExport, PAGE_SIZE, subtractTotals } from '#/lib/server/flights'
import { resolveCellClassName, tableFeaturesWithMeta } from '#/lib/table'

import type { CategoryClass, CurrencyResult } from '@logbook/core'
import type { AirlineInsights } from '#/lib/server/airline-insights'
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
    // Which insights strip renders below the totals depends on the pilot's
    // profile type, so it's resolved first rather than prefetched
    // speculatively alongside the queries above.
    const profile = await queryClient.ensureQueryData(pilotProfileQueryOptions())
    await queryClient.ensureQueryData(
      profile.profileType === 'airline' ? airlineInsightsQueryOptions(pilotId) : currencyQueryOptions(pilotId),
    )
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

function formatCount(n: number): { text: string; dim: boolean } {
  return n === 0 ? { text: '—', dim: true } : { text: String(n), dim: false }
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
  const { data: profile } = useSuspenseQuery(pilotProfileQueryOptions())

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
      note: `${grandTotals.nightLandings} night landings`,
    },
    {
      label: 'Instrument',
      value: (grandTotals.actualInstrument + grandTotals.simInstrument).toFixed(
        1,
      ),
      note: `${grandTotals.actualInstrument.toFixed(1)} actual · ${grandTotals.simInstrument.toFixed(1)} sim`,
    },
    {
      label: 'Landings',
      value: String(grandTotals.dayLandings + grandTotals.nightLandings),
      note: `${grandTotals.dayLandings} day · ${grandTotals.nightLandings} night`,
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

      {/* profile-specific insights */}
      <div className="px-8 pt-4.5">
        {profile.profileType === 'airline' ? (
          <AirlineInsightsStrip pilotId={pilotId} />
        ) : (
          <RecreationalInsightsStrip pilotId={pilotId} />
        )}
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

/** One tile in the profile-specific insights strip — same visual language as
 * the totals strip's stat cards above, so the two rows read as one system. */
function InsightTile({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'bad' ? 'text-status-bad' : tone === 'warn' ? 'text-status-warn' : 'text-ink'
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3.5 py-3">
      <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">{label}</div>
      <div className={`font-mono text-2xl leading-none font-medium tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </div>
      <div className="text-[11px] text-ink-dim">{note}</div>
    </div>
  )
}

/** Turbine PIC time and a simple duty/rest snapshot — see `duty.ts`'s module
 * comment on why this isn't a Part 117 legality computation. */
function AirlineInsightsStrip({ pilotId }: { pilotId: string }) {
  const { data } = useSuspenseQuery(airlineInsightsQueryOptions(pilotId))
  const { turbinePicTime, lastDuty, restBeforeLastDuty }: AirlineInsights = data

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <InsightTile label="Turbine PIC" value={turbinePicTime.toFixed(1)} note="Total logged" />
      <InsightTile
        label="Last duty"
        value={lastDuty ? lastDuty.hours.toFixed(1) : '—'}
        note={
          lastDuty
            ? `${lastDuty.reportTime}–${lastDuty.releaseTime} on ${lastDuty.date}`
            : 'Log a report/release time to track duty'
        }
      />
      <InsightTile
        label="Rest before"
        value={restBeforeLastDuty !== null ? restBeforeLastDuty.toFixed(1) : '—'}
        note={restBeforeLastDuty !== null ? 'Since prior duty release' : 'No prior duty period on record'}
      />
    </div>
  )
}

/** Worst (most urgent) of a set of currency results — `null` when none were
 * computable (the pilot hasn't flown a matching category/class). */
function worstCurrency(results: Array<CurrencyResult>): CurrencyResult | null {
  const severity: Record<CurrencyResult['state'], number> = { current: 0, expiring: 1, expired: 2 }
  return results.reduce<CurrencyResult | null>(
    (worst, r) => (!worst || severity[r.state] > severity[worst.state] ? r : worst),
    null,
  )
}

const currencyToneFor: Record<CurrencyResult['state'], 'good' | 'warn' | 'bad'> = {
  current: 'good',
  expiring: 'warn',
  expired: 'bad',
}

function CurrencyTile({ label, result }: { label: string; result: CurrencyResult | null }) {
  if (!result) return <InsightTile label={label} value="—" note="No flights logged yet" />
  return (
    <InsightTile
      label={label}
      value={result.daysRemaining !== null ? String(Math.max(result.daysRemaining, 0)) : '0'}
      note={result.daysRemaining !== null ? 'days remaining' : 'Not current'}
      tone={currencyToneFor[result.state]}
    />
  )
}

/** A quick passenger/instrument currency snapshot, computed the same way as
 * the full `/currency` page but condensed to the pilot's single
 * worst-case result per rule — the full breakdown by category/class lives
 * on that page. */
function RecreationalInsightsStrip({ pilotId }: { pilotId: string }) {
  const { data } = useSuspenseQuery(currencyQueryOptions(pilotId))
  const asOf = new Date()
  const flights = data.flights.map(toCurrencyFlight)
  const categoryClasses = [...new Set(flights.map((f) => f.categoryClass))]
  const categories = [...new Set(categoryClasses.map(categoryOf))]

  const dayResult = worstCurrency(categoryClasses.map((cc) => dayPassengerCurrency(flights, asOf, cc)))
  const nightResult = worstCurrency(categoryClasses.map((cc) => nightPassengerCurrency(flights, asOf, cc)))
  const instrumentResult = worstCurrency(
    categories.map((category) => {
      // Same category-not-class scoping as the /currency page — any class
      // flown within the category resolves the same result.
      const cc = categoryClasses.find((c) => categoryOf(c) === category) as CategoryClass
      const lastIpcDate = data.lastIpcDateByCategory[category]
      return instrumentCurrency(flights, asOf, cc, lastIpcDate ? parseDateValue(lastIpcDate) : null)
    }),
  )

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <CurrencyTile label="Passengers — day" result={dayResult} />
      <CurrencyTile label="Passengers — night" result={nightResult} />
      <CurrencyTile label="Instrument" result={instrumentResult} />
    </div>
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
  'Actual',
  'Sim',
  'Day',
  'Ngt',
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
      <col className="w-12" />
      <col className="w-12" />
      <col />
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
              i >= 5 && i <= 12 ? 'text-right' : 'text-left'
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
    numColumn('actual', (f) => f.actualInstrument, formatHours),
    numColumn('sim', (f) => f.simInstrument, formatHours),
    flightColumnHelper.display({
      id: 'day',
      cell: (info) => {
        const { dayLandings } = info.row.original
        return dayLandings === 0 ? '—' : dayLandings
      },
      meta: {
        cellClassName: 'border-b border-border/60 px-2 text-right font-mono text-[12.5px] text-ink-dim',
      },
    }),
    numColumn('nightLandings', (f) => f.nightLandings, formatCount),
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
                    colSpan={16}
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
  { align: 'right', width: 'w-6' }, // Actual
  { align: 'right', width: 'w-6' }, // Sim
  { align: 'right', width: 'w-4' }, // Day
  { align: 'right', width: 'w-4' }, // Ngt
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
        {cell(pageTotals.actualInstrument)}
        {cell(pageTotals.simInstrument)}
        {landingsCell(pageTotals.dayLandings)}
        {landingsCell(pageTotals.nightLandings)}
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
        {cell(amountForwardTotals.actualInstrument)}
        {cell(amountForwardTotals.simInstrument)}
        {landingsCell(amountForwardTotals.dayLandings)}
        {landingsCell(amountForwardTotals.nightLandings)}
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
        {cell(grandTotals.actualInstrument, { bold: true })}
        {cell(grandTotals.simInstrument, { bold: true })}
        {landingsCell(grandTotals.dayLandings, { bold: true })}
        {landingsCell(grandTotals.nightLandings, { bold: true })}
        <td className="px-3 text-[11px] text-ink-faint">Certified totals</td>
        <td />
      </tr>
    </tfoot>
  )
}
