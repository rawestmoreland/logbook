import { useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { computePrintRunningTotals, ENDORSEMENT_TYPE_LABELS, parseNumberValue } from '@logbook/core'

import type { PrintRunningTotals } from '@logbook/core'

import { flightsForPrintQueryOptions, startingTotalsQueryOptions } from '#/lib/queries/flights'

import type { PrintFlightRow } from '#/lib/server/flights'

export const Route = createFileRoute('/_authed/print-logbook')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(flightsForPrintQueryOptions(pilotId)),
      queryClient.ensureQueryData(startingTotalsQueryOptions(pilotId)),
    ])
  },
  component: PrintLogbookPage,
})

function formatShortDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return `${month}/${day}/${year.slice(2)}`
}

/** A paper logbook leaves a zero-value cell blank rather than printing "0.0" — same convention here. */
function formatHours(n: number): string {
  return n === 0 ? '' : n.toFixed(1)
}

function formatCount(n: number): string {
  return n === 0 ? '' : String(n)
}

const TABLE_HEADERS = [
  'Date',
  'Aircraft',
  'From',
  'To',
  'Total',
  'PIC',
  'SIC',
  'Dual Rcvd',
  'Solo',
  'X-ctry',
  'Night',
  'Actual Inst',
  'Sim Inst',
  'Day Ldg',
  'Ngt Ldg',
  'App.',
  'Running Total',
  'Remarks',
] as const

function FlightRowCells({ row }: { row: PrintFlightRow & { runningTotal: PrintRunningTotals } }) {
  const aircraft = [row.model, row.tailNumber].filter(Boolean).join(' ')
  const cell = 'border-b border-border/60 px-1.5 py-0.5 text-right font-mono text-[10px] text-ink'
  return (
    <>
      <td className="border-b border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-ink">
        {formatShortDate(row.date)}
      </td>
      <td className="border-b border-border/60 px-1.5 py-0.5 text-[10px] text-ink">{aircraft || '—'}</td>
      <td className="border-b border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-ink">{row.routeFrom}</td>
      <td className="border-b border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-ink">{row.routeTo}</td>
      <td className={`${cell} font-medium`}>{formatHours(row.totalTime)}</td>
      <td className={cell}>{formatHours(row.picTime)}</td>
      <td className={cell}>{formatHours(row.sicTime)}</td>
      <td className={cell}>{formatHours(row.dualTime)}</td>
      <td className={cell}>{formatHours(row.soloTime)}</td>
      <td className={cell}>{formatHours(row.crossCountryTime)}</td>
      <td className={cell}>{formatHours(row.nightTime)}</td>
      <td className={cell}>{formatHours(row.actualInstrument)}</td>
      <td className={cell}>{formatHours(row.simInstrument)}</td>
      <td className={cell}>{formatCount(row.dayLandingsFullStop)}</td>
      <td className={cell}>{formatCount(row.nightLandingsFullStop)}</td>
      <td className={cell}>{formatCount(row.approaches)}</td>
      <td className={`${cell} font-medium`}>{row.runningTotal.totalTime.toFixed(1)}</td>
      <td className="border-b border-border/60 px-1.5 py-0.5 text-[10px] text-ink-dim">
        {row.signedEndorsementTypes.length > 0 && (
          <div className="font-semibold text-ink">
            ✓ {row.signedEndorsementTypes.map((t) => ENDORSEMENT_TYPE_LABELS[t]).join(', ')}
          </div>
        )}
        {row.remarks}
      </td>
    </>
  )
}

function toStartingRunningTotals(values: { totalTime: string; picTime: string; dualTime: string; crossCountryTime: string } | null): PrintRunningTotals | null {
  if (!values) return null
  return {
    totalTime: parseNumberValue(values.totalTime),
    picTime: parseNumberValue(values.picTime),
    dualTime: parseNumberValue(values.dualTime),
    crossCountryTime: parseNumberValue(values.crossCountryTime),
  }
}

function PrintLogbookPage() {
  const { pilotId, pilot } = Route.useRouteContext()
  const { data: flights } = useSuspenseQuery(flightsForPrintQueryOptions(pilotId))
  const { data: startingTotals } = useSuspenseQuery(startingTotalsQueryOptions(pilotId))

  const startingRunningTotals = useMemo(() => toStartingRunningTotals(startingTotals), [startingTotals])
  const rows = useMemo(
    () => computePrintRunningTotals(flights, startingRunningTotals),
    [flights, startingRunningTotals],
  )

  const grandTotal: PrintRunningTotals = rows.at(-1)?.runningTotal ??
    startingRunningTotals ?? { totalTime: 0, picTime: 0, dualTime: 0, crossCountryTime: 0 }

  const generatedOn = new Date()

  return (
    <div className="print:m-0">
      <div className="flex items-center justify-between gap-4 pb-4 print:hidden">
        <div>
          <div className="text-lg font-semibold tracking-tight text-ink">Print logbook</div>
          <div className="text-xs text-ink-dim">
            Use your browser's print dialog (Ctrl/Cmd+P) and choose "Save as PDF" for a portable copy.
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Print
        </button>
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-base font-semibold text-ink">{pilot.name || 'Pilot'}'s Logbook</div>
        <div className="text-[10px] text-ink-dim">Generated {generatedOn.toLocaleDateString()}</div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface-alt">
            {TABLE_HEADERS.map((h, i) => (
              <th
                key={h}
                className={`border-b border-border px-1.5 py-1 text-[9.5px] font-semibold tracking-wide text-ink-dim uppercase ${
                  i >= 4 && i <= 16 ? 'text-right' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {startingRunningTotals && (
            <tr className="bg-surface-alt">
              <td colSpan={4} className="border-b border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-dim">
                Totals brought forward
              </td>
              <td className="border-b border-border/60 px-1.5 py-0.5 text-right font-mono text-[10px] font-medium text-ink">
                {startingRunningTotals.totalTime.toFixed(1)}
              </td>
              <td className="border-b border-border/60 px-1.5 py-0.5 text-right font-mono text-[10px] text-ink">
                {startingRunningTotals.picTime.toFixed(1)}
              </td>
              <td className="border-b border-border/60" />
              <td className="border-b border-border/60 px-1.5 py-0.5 text-right font-mono text-[10px] text-ink">
                {startingRunningTotals.dualTime.toFixed(1)}
              </td>
              <td className="border-b border-border/60" />
              <td className="border-b border-border/60 px-1.5 py-0.5 text-right font-mono text-[10px] text-ink">
                {startingRunningTotals.crossCountryTime.toFixed(1)}
              </td>
              <td colSpan={4} className="border-b border-border/60" />
              <td className="border-b border-border/60 px-1.5 py-0.5 text-right font-mono text-[10px] font-medium text-ink">
                {startingRunningTotals.totalTime.toFixed(1)}
              </td>
              <td className="border-b border-border/60" />
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="break-inside-avoid">
              <FlightRowCells row={row} />
            </tr>
          ))}
          {rows.length === 0 && !startingRunningTotals && (
            <tr>
              <td colSpan={TABLE_HEADERS.length} className="px-3 py-8 text-center text-sm text-ink-dim">
                No flights logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-8 break-inside-avoid text-[10.5px] text-ink">
        <p>
          I certify that the entries in this logbook are true and complete to the best of my knowledge, comprising a
          total time of <span className="font-semibold">{grandTotal.totalTime.toFixed(1)}</span> hours as of the date
          below.
        </p>
        <div className="mt-8 flex items-end justify-between gap-8">
          <div className="flex-1 border-t border-ink pt-1">
            <div className="font-medium">{pilot.name}</div>
            <div className="text-[9.5px] text-ink-dim">Pilot signature</div>
          </div>
          <div className="w-40 border-t border-ink pt-1 text-right">
            <div className="font-medium">{generatedOn.toLocaleDateString()}</div>
            <div className="text-[9.5px] text-ink-dim">Date generated</div>
          </div>
        </div>
      </div>
    </div>
  )
}
