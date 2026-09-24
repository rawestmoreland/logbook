import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createColumnHelper, useTable } from '@tanstack/react-table'

import { CATEGORY_CLASS_LABELS, parseDateValue } from '@logbook/core'

import { currencyQueryOptions } from '#/lib/queries/currency'
import { resolveCellClassName, tableFeaturesWithMeta } from '#/lib/table'

import type { CurrencyFlightData, CurrencyResultData } from '#/lib/server/currency'

export const Route = createFileRoute('/_authed/currency')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(currencyQueryOptions(pilotId))
  },
  component: CurrencyPage,
})

function fmtDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

type LedgerRow = {
  key: string
  date: Date
  tailNumber: string
  airport: string
  counts: string
  rule: string
  state: CurrencyResultData['state']
  agesOutOn: Date
}

/** How a rule's `qualifying` count reads in the ledger — "6 day", "1 night", "6 appr". */
const COUNT_SUFFIX: Record<string, string> = {
  '61.57(a)(1)': 'day',
  '61.57(b)': 'night',
  '61.57(c)(1)': 'appr',
  'FCL.060(b)(1)': 'ldg',
  'FCL.060(b)(2)': 'night',
}

/** Expands one result's `qualifying` events into ledger rows, resolving each
 * flight's tail number and airport from the flights already on the page. */
function ledgerRowsFor(
  result: CurrencyResultData,
  flightsById: Map<string, CurrencyFlightData>,
): Array<LedgerRow> {
  const suffix = COUNT_SUFFIX[result.rule]
  const rows: Array<LedgerRow> = []
  for (const q of result.qualifying) {
    const f = flightsById.get(q.flightId)
    if (!f) continue
    rows.push({
      key: `${result.rule}-${q.flightId}`,
      date: parseDateValue(q.date),
      tailNumber: f.tailNumber,
      airport: f.routeFrom ?? f.routeTo ?? '—',
      counts: suffix ? `${q.counts} ${suffix}` : String(q.counts),
      rule: result.label,
      state: result.state,
      agesOutOn: parseDateValue(q.agesOutOn),
    })
  }
  return rows
}

const stateDotClass: Record<CurrencyResultData['state'], string> = {
  current: 'bg-status-good',
  expiring: 'bg-status-warn',
  expired: 'bg-status-bad',
}

const ledgerFeatures = tableFeaturesWithMeta<LedgerRow>()
const ledgerColumnHelper = createColumnHelper<typeof ledgerFeatures, LedgerRow>()

const ledgerColumns = ledgerColumnHelper.columns([
  ledgerColumnHelper.accessor('date', {
    header: 'Date',
    cell: (info) => fmtDate(info.getValue()),
    meta: {
      headerClassName: 'px-3.5 py-2 font-semibold',
      cellClassName: 'px-3.5 py-2 font-mono text-ink',
    },
  }),
  ledgerColumnHelper.accessor('tailNumber', {
    header: 'Aircraft',
    meta: {
      headerClassName: 'px-2.5 py-2 font-semibold',
      cellClassName: 'px-2.5 py-2 font-mono text-ink',
    },
  }),
  ledgerColumnHelper.accessor('airport', {
    header: 'Airport',
    meta: {
      headerClassName: 'px-2.5 py-2 font-semibold',
      cellClassName: 'px-2.5 py-2 font-mono text-ink-dim',
    },
  }),
  ledgerColumnHelper.accessor('counts', {
    header: 'Counts',
    meta: {
      headerClassName: 'px-2.5 py-2 text-right font-semibold',
      cellClassName: 'px-2.5 py-2 text-right font-mono text-ink',
    },
  }),
  ledgerColumnHelper.accessor('rule', {
    header: 'Rule',
    cell: (info) => (
      <span className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${stateDotClass[info.row.original.state]}`}
        />
        {info.getValue()}
      </span>
    ),
    meta: {
      headerClassName: 'px-3.5 py-2 font-semibold',
      cellClassName: 'px-3.5 py-2 text-ink-dim',
    },
  }),
  ledgerColumnHelper.accessor('agesOutOn', {
    header: 'Ages out',
    cell: (info) => (
      <span className={info.row.original.state === 'current' ? 'text-ink-dim' : 'text-status-warn'}>
        {fmtDate(info.getValue())}
      </span>
    ),
    meta: {
      headerClassName: 'px-3.5 py-2 text-right font-semibold',
      cellClassName: 'px-3.5 py-2 text-right font-mono',
    },
  }),
])

function CurrencyPage() {
  const { pilotId } = Route.useRouteContext()
  const { data } = useSuspenseQuery(currencyQueryOptions(pilotId))

  // The medical section's title reflects which pathway the server actually
  // computed a result for; when it didn't (medicalReason is set), the only
  // reachable case is the FAA certificate pathway missing a required field
  // — see the doc comment on CurrencyData.medicalReason.
  const medicalTitle =
    data.medical?.rule === '14 CFR 68'
      ? 'Medical — BasicMed (14 CFR 68)'
      : data.medical?.rule === 'MED.A.045'
        ? 'Medical — MED.A.045 (EASA)'
        : 'Medical — 61.23'

  const allResults: Array<CurrencyResultData> = [
    ...data.passenger.flatMap((p) => p.results),
    ...data.instrument.map((i) => i.result),
    data.review,
    ...(data.medical ? [data.medical] : []),
  ]

  const nextDeadline = allResults
    .filter((r) => r.daysRemaining !== null && r.expiresOn !== null)
    .sort((a, b) => (a.daysRemaining as number) - (b.daysRemaining as number))
    .at(0)

  const flightsById = new Map(data.flights.map((f) => [f.id, f]))
  const ledgerRows = allResults
    .flatMap((r) => ledgerRowsFor(r, flightsById))
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const ledgerTable = useTable({
    features: ledgerFeatures,
    data: ledgerRows,
    columns: ledgerColumns,
    getRowId: (row) => row.key,
  })

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">Currency</div>
          <div className="text-xs text-ink-dim">Part 61 currency, computed from your logbook</div>
        </div>
        {nextDeadline && (
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px]">
            <span className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Next deadline
            </span>
            <span className="font-mono font-medium text-ink">
              {fmtDate(parseDateValue(nextDeadline.expiresOn as string))}
            </span>
            <span className="text-ink-dim">
              — {nextDeadline.label} · {nextDeadline.daysRemaining}{' '}
              day{nextDeadline.daysRemaining === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-5 px-8 pt-4.5 pb-6">
        {data.flights.length === 0 && (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            No flights logged yet — currency has nothing to compute from.
          </div>
        )}

        {data.passenger.length > 0 && (
          <Section title={data.isEasa ? 'Recency — FCL.060' : 'Passenger carrying — 61.57(a)/(b)'}>
            <div className="flex flex-col gap-2.5">
              {data.passenger.map(({ categoryClass: cc, results }) => (
                <div key={cc} className="flex flex-col gap-1.5">
                  <div className="text-[11px] font-semibold tracking-wide text-ink-dim">
                    {CATEGORY_CLASS_LABELS[cc]}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {results.map((r) => (
                      <CurrencyCard key={r.rule} result={r} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {data.instrument.length > 0 && (
          <Section title="Instrument — 61.57(c)(1)">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {data.instrument.map(({ category, result }) => (
                <CurrencyCard key={category} result={result} sublabel={category.replace(/_/g, ' ')} />
              ))}
            </div>
          </Section>
        )}

        <Section title="Flight review — 61.56">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <CurrencyCard result={data.review} />
          </div>
        </Section>

        <Section title={medicalTitle}>
          {data.medical ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <CurrencyCard result={data.medical} sublabel={data.medicalSublabel} />
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface px-3.5 py-4 text-sm text-ink-dim">
              Set your birthdate, medical class, and medical issue date on your{' '}
              <Link to="/profile" className="text-accent underline">
                profile
              </Link>{' '}
              to compute medical currency.
            </div>
          )}
        </Section>

        {ledgerRows.length > 0 && (
          <Section title="What carries your currency">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  {ledgerTable.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="border-b border-border bg-surface-alt text-[10.5px] font-semibold text-ink-dim"
                    >
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className={header.column.columnDef.meta?.headerClassName}>
                          <ledgerTable.FlexRender header={header} />
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {ledgerTable.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      {row.getAllCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={resolveCellClassName(cell.column.columnDef.meta, row.original)}
                        >
                          <ledgerTable.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">{title}</div>
      {children}
    </div>
  )
}

const stateColors: Record<CurrencyResultData['state'], string> = {
  current: 'text-status-good border-status-good/30 bg-status-good/5',
  expiring: 'text-status-warn border-status-warn/30 bg-status-warn/5',
  expired: 'text-status-bad border-status-bad/30 bg-status-bad/5',
}

function CurrencyCard({ result, sublabel }: { result: CurrencyResultData; sublabel?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-medium text-ink">{result.label}</div>
          <div className="text-[11px] text-ink-faint">
            {result.rule}
            {sublabel ? ` · ${sublabel}` : ''}
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${stateColors[result.state]}`}
        >
          {result.state}
        </span>
      </div>
      {result.daysRemaining !== null ? (
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[26px] font-medium tracking-tight text-ink">
            {Math.max(result.daysRemaining, 0)}
          </span>
          <span className="text-[12px] text-ink-dim">days remaining</span>
        </div>
      ) : (
        <div className="text-[15px] font-medium text-status-bad">Not current</div>
      )}
      <div className="flex items-baseline gap-1.5 text-[11.5px] text-ink-faint">
        <span className="font-mono text-ink-dim">{result.have}</span>
        <span>/ {result.need} required</span>
      </div>
      {result.expiresOn && (
        <div className="text-[11px] text-ink-faint">
          {result.state === 'expired' ? 'Expired' : 'Expires'} {fmtDate(parseDateValue(result.expiresOn))}
        </div>
      )}
      {result.action && <div className="text-[12px] text-ink">{result.action}</div>}
    </div>
  )
}
