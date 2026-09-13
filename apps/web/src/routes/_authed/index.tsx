import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { flightsQueryOptions } from '@/lib/queries/flights'
import type { FlightListItem, FlightTotals } from '@/lib/server/flights'

export const Route = createFileRoute('/_authed/')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(flightsQueryOptions(pilotId))
  },
  component: FlightsPage,
})

// Fixed 3-letter abbreviations rather than an Intl locale: en-GB's CLDR data
// renders September as "Sept", which doesn't match the Main design
// artboard's "09 Sep" mock data or a paper logbook's day-month order.
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
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

function FlightsPage() {
  const { pilotId } = Route.useRouteContext()
  const { data } = useSuspenseQuery(flightsQueryOptions(pilotId))
  const { flights, totalCount, firstFlightDate, pageTotals, amountForwardTotals, grandTotals } =
    data

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
      value: (grandTotals.actualInstrument + grandTotals.simInstrument).toFixed(1),
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
          <div className="text-lg font-semibold tracking-tight text-ink">Flights</div>
          <div className="text-xs text-ink-dim">
            {totalCount} {totalCount === 1 ? 'entry' : 'entries'}
            {firstFlightDate && <> · first logged {formatLongDate(firstFlightDate)}</>}
          </div>
        </div>
        <div className="flex-grow" />
        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-ink">
            Export
          </div>
          <div className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-white">
            Log flight
          </div>
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
        <div className="flex h-8 w-64 items-center gap-2 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink-faint">
          Search route, tail number, remarks
        </div>
        <div className="flex h-8 items-center rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink">
          All aircraft
        </div>
        <div className="flex-grow" />
        <div className="text-xs text-ink-dim">
          Showing {flights.length} of {totalCount}
        </div>
      </div>

      {/* table */}
      <div className="min-h-0 flex-grow px-8 pb-6">
        <div className="h-full overflow-auto rounded-lg border border-border bg-surface">
          <table className="w-full table-fixed border-collapse">
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
            </colgroup>
            <thead>
              <tr className="h-[30px] bg-surface-alt">
                {[
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
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`border-b border-border px-2 text-xs font-semibold text-ink-dim first:px-2.5 last:px-3 ${
                      i >= 5 && i <= 12 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => (
                <FlightRow key={f.id} flight={f} />
              ))}
              {flights.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-3 py-8 text-center text-sm text-ink-dim">
                    No flights logged yet.
                  </td>
                </tr>
              )}
            </tbody>
            {flights.length > 0 && (
              <TotalsFoot pageTotals={pageTotals} amountForwardTotals={amountForwardTotals} grandTotals={grandTotals} />
            )}
          </table>
        </div>
      </div>
    </>
  )
}

function FlightRow({ flight: f }: { flight: FlightListItem }) {
  const pic = formatHours(f.picTime)
  const dual = formatHours(f.dualTime)
  const solo = formatHours(f.soloTime)
  const night = formatHours(f.nightTime)
  const actual = formatHours(f.actualInstrument)
  const sim = formatHours(f.simInstrument)
  const nightLdg = formatCount(f.nightLandings)

  return (
    <tr className="h-9">
      <td className="border-b border-border/60 px-2.5 font-mono text-[12.5px] text-ink">
        {formatShortDate(f.date)}
      </td>
      <td className="overflow-hidden border-b border-border/60 px-2 text-[12.5px] text-ellipsis whitespace-nowrap text-ink-dim">
        {f.aircraftType || '—'}
      </td>
      <td className="border-b border-border/60 px-2 font-mono text-[12.5px] text-ink">
        {f.aircraftIdent || '—'}
      </td>
      <td className="border-b border-border/60 px-2 font-mono text-[12.5px] text-ink">
        {f.routeFrom || '—'}
      </td>
      <td className="border-b border-border/60 px-2 font-mono text-[12.5px] text-ink">
        {f.routeTo || '—'}
      </td>
      <td className="border-b border-border/60 px-2 text-right font-mono text-[12.5px] font-medium text-ink">
        {f.totalTime === 0 ? '—' : f.totalTime.toFixed(1)}
      </td>
      <Num value={pic} />
      <Num value={dual} />
      <Num value={solo} />
      <Num value={night} />
      <Num value={actual} />
      <Num value={sim} />
      <td className="border-b border-border/60 px-2 text-right font-mono text-[12.5px] text-ink-dim">
        {f.dayLandings === 0 ? '—' : f.dayLandings}
      </td>
      <Num value={nightLdg} />
      <td className="overflow-hidden border-b border-border/60 px-3 text-[12.5px] text-ellipsis whitespace-nowrap text-ink-dim">
        {f.remarks || '—'}
      </td>
    </tr>
  )
}

function Num({ value }: { value: { text: string; dim: boolean } }) {
  return (
    <td
      className={`border-b border-border/60 px-2 text-right font-mono text-[12.5px] ${
        value.dim ? 'text-ink-zero' : 'text-ink'
      }`}
    >
      {value.text}
    </td>
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
        <td colSpan={5} className="px-2.5 text-xs font-semibold tracking-wide text-ink-dim">
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
      </tr>
      <tr className="h-[30px] bg-surface-alt">
        <td colSpan={5} className="px-2.5 text-xs font-semibold tracking-wide text-ink-dim">
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
      </tr>
      <tr className="h-9 bg-[#f4f7f9]">
        <td colSpan={5} className="px-2.5 text-xs font-semibold tracking-wide text-ink uppercase">
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
      </tr>
    </tfoot>
  )
}
