import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { checkFlight, checkForDuplicateFlights, parseDateValue } from '@logbook/core'

import type { CheckableFlight, FlightCheckWarning } from '@logbook/core'

import { checkFlightsQueryOptions } from '#/lib/queries/check-flights'

import type { CheckFlightData } from '#/lib/server/check-flights'

export const Route = createFileRoute('/_authed/check-flights')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(checkFlightsQueryOptions(pilotId))
  },
  component: CheckFlightsPage,
})

function toCheckableFlight(f: CheckFlightData): CheckableFlight {
  return {
    id: f.id,
    date: parseDateValue(f.date),
    totalTime: f.totalTime,
    picTime: f.picTime,
    sicTime: f.sicTime,
    dualTime: f.dualTime,
    soloTime: f.soloTime,
    nightTime: f.nightTime,
    actualInstrument: f.actualInstrument,
    simInstrument: f.simInstrument,
    crossCountryTime: f.crossCountryTime,
    dualGivenTime: f.dualGivenTime,
    totalLandings: f.totalLandings,
    dayLandingsFullStop: f.dayLandingsFullStop,
    nightLandingsFullStop: f.nightLandingsFullStop,
    approaches: f.approaches,
    tailNumber: f.tailNumber,
  }
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

type FlaggedFlight = {
  flight: CheckFlightData
  warnings: Array<FlightCheckWarning>
}

function CheckFlightsPage() {
  const { pilotId } = Route.useRouteContext()
  const { data } = useSuspenseQuery(checkFlightsQueryOptions(pilotId))

  const flights = data.map(toCheckableFlight)
  const flightsById = new Map(data.map((f) => [f.id, f]))
  const duplicateWarningsById = checkForDuplicateFlights(flights)

  const flagged: Array<FlaggedFlight> = []
  for (const flight of flights) {
    const warnings = [...checkFlight(flight), ...(duplicateWarningsById.get(flight.id) ?? [])]
    if (warnings.length === 0) continue
    const source = flightsById.get(flight.id)
    if (!source) continue
    flagged.push({ flight: source, warnings })
  }
  flagged.sort((a, b) => b.flight.date.localeCompare(a.flight.date))

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">Check Flights</div>
          <div className="text-xs text-ink-dim">
            Advisory checks over your logbook — warnings worth a second look, not errors
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px]">
          <span className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">Flagged</span>
          <span className="font-mono font-medium text-ink">{flagged.length}</span>
          <span className="text-ink-dim">
            of {flights.length} flight{flights.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-2.5 px-8 pt-4.5 pb-6">
        {flights.length === 0 && (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            No flights logged yet — nothing to check.
          </div>
        )}

        {flights.length > 0 && flagged.length === 0 && (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            No issues found — your logbook looks clean.
          </div>
        )}

        {flagged.map(({ flight, warnings }) => (
          <div
            key={flight.id}
            className="flex flex-col gap-2 rounded-lg border border-status-warn/30 bg-status-warn/5 p-4"
          >
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm font-medium text-ink">
                {fmtDate(parseDateValue(flight.date))}
              </span>
              {flight.tailNumber && (
                <span className="font-mono text-xs text-ink-dim">{flight.tailNumber}</span>
              )}
              {(flight.routeFrom || flight.routeTo) && (
                <span className="text-xs text-ink-faint">
                  {flight.routeFrom ?? '—'} → {flight.routeTo ?? '—'}
                </span>
              )}
              <Link
                to="/log-flight/$flightId"
                params={{ flightId: flight.id }}
                className="ml-auto text-xs text-accent underline"
              >
                View flight
              </Link>
            </div>
            <ul className="flex flex-col gap-1">
              {warnings.map((w, i) => (
                <li key={`${w.code}-${i}`} className="text-[12.5px] text-ink">
                  {w.message}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  )
}
