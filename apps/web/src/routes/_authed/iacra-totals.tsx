import { useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { CATEGORY_CLASS_LABELS, computeIacraTotals, parseDateValue, parseNumberValue } from '@logbook/core'

import type { AnalysisFlight, IacraCategoryRow, IacraTotalsRow, StartingTotalsFormValues } from '@logbook/core'

import { analysisQueryOptions } from '#/lib/queries/analysis'
import { startingTotalsQueryOptions } from '#/lib/queries/flights'

export const Route = createFileRoute('/_authed/iacra-totals')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(analysisQueryOptions(pilotId)),
      queryClient.ensureQueryData(startingTotalsQueryOptions(pilotId)),
    ])
  },
  component: IacraTotalsPage,
})

// Same shape `analysis.tsx`'s `toAnalysisFlight` converts — dates travel as
// strings across the server function boundary (see `AnalysisFlightData`),
// and `AnalysisFlight` requires a real `Date`.
function toAnalysisFlight(f: {
  id: string
  date: string
  totalTime: number
  picTime: number
  sicTime: number
  dualTime: number
  soloTime: number
  nightTime: number
  actualInstrument: number
  simInstrument: number
  crossCountryTime: number
  dualGivenTime: number
  groundSimTime: number
  approaches: number
  totalLandings: number
  dayLandingsFullStop: number
  nightLandingsFullStop: number
  tailNumber: string
  aircraftModel: string
  categoryClass: AnalysisFlight['categoryClass']
  instanceType: AnalysisFlight['instanceType']
}): AnalysisFlight {
  return { ...f, date: parseDateValue(f.date) }
}

/** `StartingTotalsFormValues`'s fields are form strings; `flightCount: 0`
 * since this is one carry-forward snapshot, not a set of individual
 * flights — `computeIacraTotals`'s grand total sums it in without letting
 * it count toward "how many flights did I log." */
function toIacraRow(values: StartingTotalsFormValues | null): IacraTotalsRow | null {
  if (!values) return null
  return {
    totalTime: parseNumberValue(values.totalTime),
    picTime: parseNumberValue(values.picTime),
    sicTime: parseNumberValue(values.sicTime),
    dualTime: parseNumberValue(values.dualTime),
    soloTime: parseNumberValue(values.soloTime),
    nightTime: parseNumberValue(values.nightTime),
    actualInstrument: parseNumberValue(values.actualInstrument),
    simInstrument: parseNumberValue(values.simInstrument),
    crossCountryTime: parseNumberValue(values.crossCountryTime),
    dualGivenTime: parseNumberValue(values.dualGivenTime),
    groundSimTime: parseNumberValue(values.groundSimTime),
    approaches: parseNumberValue(values.approaches),
    totalLandings: parseNumberValue(values.totalLandings),
    dayLandingsFullStop: parseNumberValue(values.dayLandingsFullStop),
    nightLandingsFullStop: parseNumberValue(values.nightLandingsFullStop),
    flightCount: 0,
  }
}

/** A zero reads as absence, not as data — same convention as the Flights
 * page's `formatHours`. */
function formatHours(n: number): string {
  return n === 0 ? '—' : n.toFixed(1)
}

/** Combined "Lndgs" cell: total landings with the day/night full-stop split
 * in parens, e.g. `12(9D 3N)` — mirrors the Flights page's `formatLandings`. */
function formatLandings(day: number, night: number): string {
  const total = day + night
  if (total === 0) return '—'
  const parts: Array<string> = []
  if (day > 0) parts.push(`${day}D`)
  if (night > 0) parts.push(`${night}N`)
  return `${total}(${parts.join(' ')})`
}

function formatCount(n: number): string {
  return n === 0 ? '—' : String(n)
}

function categoryLabel(row: IacraCategoryRow): string {
  const base = CATEGORY_CLASS_LABELS[row.categoryClass]
  return row.isSimulator ? `${base} — Simulator/ATD` : base
}

const TABLE_HEADERS = [
  'Category / Class',
  'Total',
  'PIC',
  'SIC',
  'X-ctry',
  'Night',
  'Actual',
  'Sim',
  'Dual Rcvd',
  'Dual Given',
  'Solo',
  'Lndgs',
  'Appr',
] as const

function TotalsRowCells({ row, bold }: { row: IacraTotalsRow; bold?: boolean }) {
  const cellClass = `border-b border-border/60 px-2.5 text-right font-mono text-[12.5px] ${
    bold ? 'font-medium text-ink' : 'text-ink'
  }`
  return (
    <>
      <td className={cellClass}>{formatHours(row.totalTime)}</td>
      <td className={cellClass}>{formatHours(row.picTime)}</td>
      <td className={cellClass}>{formatHours(row.sicTime)}</td>
      <td className={cellClass}>{formatHours(row.crossCountryTime)}</td>
      <td className={cellClass}>{formatHours(row.nightTime)}</td>
      <td className={cellClass}>{formatHours(row.actualInstrument)}</td>
      <td className={cellClass}>{formatHours(row.simInstrument)}</td>
      <td className={cellClass}>{formatHours(row.dualTime)}</td>
      <td className={cellClass}>{formatHours(row.dualGivenTime)}</td>
      <td className={cellClass}>{formatHours(row.soloTime)}</td>
      <td className={cellClass}>{formatLandings(row.dayLandingsFullStop, row.nightLandingsFullStop)}</td>
      <td className={cellClass}>{formatCount(row.approaches)}</td>
    </>
  )
}

function IacraTotalsPage() {
  const { pilotId } = Route.useRouteContext()
  const { data: analysisData } = useSuspenseQuery(analysisQueryOptions(pilotId))
  const { data: startingTotals } = useSuspenseQuery(startingTotalsQueryOptions(pilotId))

  const flights = useMemo(() => analysisData.flights.map(toAnalysisFlight), [analysisData.flights])
  const priorTotals = useMemo(() => toIacraRow(startingTotals), [startingTotals])

  const result = useMemo(() => computeIacraTotals(flights, priorTotals), [flights, priorTotals])
  const { categoryRows, grandTotal } = result

  const isEmpty = categoryRows.length === 0 && !priorTotals

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">IACRA totals</div>
          <div className="text-xs text-ink-dim">
            Record of Pilot Time worksheet — transcribe these numbers into your certificate or rating application
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 px-8 pt-4.5 pb-6">
        {isEmpty ? (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            No flights logged yet — nothing to total for an application yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="h-[30px] bg-surface-alt">
                    {TABLE_HEADERS.map((h, i) => (
                      <th
                        key={h}
                        className={`border-b border-border px-2.5 text-xs font-semibold text-ink-dim ${
                          i === 0 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((row) => (
                    <tr key={`${row.categoryClass}-${row.isSimulator}`} className="h-9">
                      <td className="border-b border-border/60 px-2.5 text-[12.5px] text-ink">
                        {categoryLabel(row)}
                      </td>
                      <TotalsRowCells row={row} />
                    </tr>
                  ))}
                  {categoryRows.length === 0 && (
                    <tr>
                      <td colSpan={TABLE_HEADERS.length} className="px-3 py-8 text-center text-sm text-ink-dim">
                        No flights logged yet in the app.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  {priorTotals && (
                    <tr className="h-9 bg-surface-alt">
                      <td className="px-2.5 text-[12.5px] font-medium text-ink-dim">
                        Prior to this app (not broken out by category)
                      </td>
                      <TotalsRowCells row={priorTotals} />
                    </tr>
                  )}
                  <tr className="h-9 bg-[#f4f7f9]">
                    <td className="px-2.5 text-xs font-semibold tracking-wide text-ink uppercase">Total</td>
                    <TotalsRowCells row={grandTotal} bold />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
