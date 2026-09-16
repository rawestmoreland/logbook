import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import {
  CATEGORIES,
  CATEGORY_CLASS_LABELS,
  categoryOf,
  dayPassengerCurrency,
  flightReviewCurrency,
  instrumentCurrency,
  medicalCurrency,
  nightPassengerCurrency,
  parseDateValue,
} from '@logbook/core'

import type { CategoryClass, CurrencyFlight, CurrencyResult } from '@logbook/core'

import { currencyQueryOptions } from '#/lib/queries/currency'

import type { CurrencyFlightData } from '#/lib/server/currency'

export const Route = createFileRoute('/_authed/currency')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(currencyQueryOptions(pilotId))
  },
  component: CurrencyPage,
})

function toCurrencyFlight(f: CurrencyFlightData): CurrencyFlight {
  return {
    id: f.id,
    date: parseDateValue(f.date),
    categoryClass: f.categoryClass,
    tailwheel: f.tailwheel,
    instanceType: f.instanceType,
    dayLandings: f.dayLandings,
    dayLandingsFullStop: f.dayLandingsFullStop,
    nightLandings: f.nightLandings,
    approaches: f.approaches,
    holding: f.holding,
    courseTracking: f.courseTracking,
  }
}

/** Whole years old at `at` — the FAA medical duration ladder (61.23(d))
 * keys off age at the exam, not age today. */
function ageAt(birthdate: Date, at: Date): number {
  let age = at.getFullYear() - birthdate.getFullYear()
  const hadBirthdayThisYear =
    at.getMonth() > birthdate.getMonth() ||
    (at.getMonth() === birthdate.getMonth() && at.getDate() >= birthdate.getDate())
  if (!hadBirthdayThisYear) age -= 1
  return age
}

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
  state: CurrencyResult['state']
  agesOutOn: Date
}

/** How a rule's `qualifying` count reads in the ledger — "6 day", "1 night", "6 appr". */
const COUNT_SUFFIX: Record<string, string> = {
  '61.57(a)(1)': 'day',
  '61.57(b)': 'night',
  '61.57(c)(1)': 'appr',
}

/** Expands one result's `qualifying` events into ledger rows, resolving each
 * flight's tail number and airport from the flights already on the page. */
function ledgerRowsFor(
  result: CurrencyResult,
  flightsById: Map<string, CurrencyFlightData>,
): Array<LedgerRow> {
  const suffix = COUNT_SUFFIX[result.rule]
  const rows: Array<LedgerRow> = []
  for (const q of result.qualifying) {
    const f = flightsById.get(q.flightId)
    if (!f) continue
    rows.push({
      key: `${result.rule}-${q.flightId}`,
      date: q.date,
      tailNumber: f.tailNumber,
      airport: f.routeFrom ?? f.routeTo ?? '—',
      counts: suffix ? `${q.counts} ${suffix}` : String(q.counts),
      rule: result.label,
      state: result.state,
      agesOutOn: q.agesOutOn,
    })
  }
  return rows
}

function CurrencyPage() {
  const { pilotId } = Route.useRouteContext()
  const { data } = useSuspenseQuery(currencyQueryOptions(pilotId))

  const asOf = new Date()
  const flights = data.flights.map(toCurrencyFlight)

  const categoryClasses = [...new Set(flights.map((f) => f.categoryClass))].sort()
  const categories = [...new Set(categoryClasses.map(categoryOf))].sort(
    (a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b),
  )

  const passengerResults: Array<{ categoryClass: CategoryClass; results: Array<CurrencyResult> }> =
    categoryClasses.map((cc) => ({
      categoryClass: cc,
      results: [dayPassengerCurrency(flights, asOf, cc), nightPassengerCurrency(flights, asOf, cc)],
    }))
  const instrumentResults: Array<{ category: string; result: CurrencyResult }> = categories.map(
    (category) => {
      // instrumentCurrency is scoped per category, not class — any class
      // within the category resolves the same result, so the first one
      // flown in it stands in for the category as a whole.
      const cc = categoryClasses.find((c) => categoryOf(c) === category) as CategoryClass
      return { category, result: instrumentCurrency(flights, asOf, cc) }
    },
  )

  const reviewResult = flightReviewCurrency(
    data.lastFlightReviewDate ? parseDateValue(data.lastFlightReviewDate) : null,
    asOf,
  )

  const canComputeMedical =
    data.medical.medicalClass && data.medical.medicalIssued && data.medical.birthdate
  const medicalResult =
    canComputeMedical && data.medical.medicalIssued && data.medical.birthdate && data.medical.medicalClass
      ? medicalCurrency(
          parseDateValue(data.medical.medicalIssued),
          data.medical.medicalClass,
          ageAt(parseDateValue(data.medical.birthdate), parseDateValue(data.medical.medicalIssued)),
          asOf,
        )
      : null

  const allResults: Array<CurrencyResult> = [
    ...passengerResults.flatMap((p) => p.results),
    ...instrumentResults.map((i) => i.result),
    reviewResult,
    ...(medicalResult ? [medicalResult] : []),
  ]

  const nextDeadline = allResults
    .filter((r) => r.daysRemaining !== null && r.expiresOn !== null)
    .sort((a, b) => (a.daysRemaining as number) - (b.daysRemaining as number))
    .at(0)

  const flightsById = new Map(data.flights.map((f) => [f.id, f]))
  const ledgerRows = allResults
    .flatMap((r) => ledgerRowsFor(r, flightsById))
    .sort((a, b) => b.date.getTime() - a.date.getTime())

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
            <span className="font-mono font-medium text-ink">{fmtDate(nextDeadline.expiresOn as Date)}</span>
            <span className="text-ink-dim">
              — {nextDeadline.label} · {nextDeadline.daysRemaining}{' '}
              day{nextDeadline.daysRemaining === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-5 px-8 pt-4.5 pb-6">
        {flights.length === 0 && (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            No flights logged yet — currency has nothing to compute from.
          </div>
        )}

        {passengerResults.length > 0 && (
          <Section title="Passenger carrying — 61.57(a)/(b)">
            <div className="flex flex-col gap-2.5">
              {passengerResults.map(({ categoryClass: cc, results }) => (
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

        {instrumentResults.length > 0 && (
          <Section title="Instrument — 61.57(c)(1)">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {instrumentResults.map(({ category, result }) => (
                <CurrencyCard key={category} result={result} sublabel={category.replace(/_/g, ' ')} />
              ))}
            </div>
          </Section>
        )}

        <Section title="Flight review — 61.56">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <CurrencyCard result={reviewResult} />
          </div>
        </Section>

        <Section title="Medical — 61.23">
          {medicalResult ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <CurrencyCard result={medicalResult} />
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
                  <tr className="border-b border-border bg-surface-alt text-[10.5px] font-semibold text-ink-dim">
                    <th className="px-3.5 py-2 font-semibold">Date</th>
                    <th className="px-2.5 py-2 font-semibold">Aircraft</th>
                    <th className="px-2.5 py-2 font-semibold">Airport</th>
                    <th className="px-2.5 py-2 text-right font-semibold">Counts</th>
                    <th className="px-3.5 py-2 font-semibold">Rule</th>
                    <th className="px-3.5 py-2 text-right font-semibold">Ages out</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr key={row.key} className="border-b border-border/60 last:border-0">
                      <td className="px-3.5 py-2 font-mono text-ink">{fmtDate(row.date)}</td>
                      <td className="px-2.5 py-2 font-mono text-ink">{row.tailNumber}</td>
                      <td className="px-2.5 py-2 font-mono text-ink-dim">{row.airport}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-ink">{row.counts}</td>
                      <td className="px-3.5 py-2 text-ink-dim">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                              row.state === 'current'
                                ? 'bg-status-good'
                                : row.state === 'expiring'
                                  ? 'bg-status-warn'
                                  : 'bg-status-bad'
                            }`}
                          />
                          {row.rule}
                        </span>
                      </td>
                      <td
                        className={`px-3.5 py-2 text-right font-mono ${
                          row.state === 'current' ? 'text-ink-dim' : 'text-status-warn'
                        }`}
                      >
                        {fmtDate(row.agesOutOn)}
                      </td>
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

const stateColors: Record<CurrencyResult['state'], string> = {
  current: 'text-status-good border-status-good/30 bg-status-good/5',
  expiring: 'text-status-warn border-status-warn/30 bg-status-warn/5',
  expired: 'text-status-bad border-status-bad/30 bg-status-bad/5',
}

function CurrencyCard({ result, sublabel }: { result: CurrencyResult; sublabel?: string }) {
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
          {result.state === 'expired' ? 'Expired' : 'Expires'} {fmtDate(result.expiresOn)}
        </div>
      )}
      {result.action && <div className="text-[12px] text-ink">{result.action}</div>}
    </div>
  )
}
