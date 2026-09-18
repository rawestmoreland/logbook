import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import {
  checkCrossCountryDistance,
  checkFlight,
  checkForDuplicateFlights,
  parseDateValue,
  routeWaypointIdents,
} from '@logbook/core'

import type {
  CheckableFlight,
  CheckableFlightRoute,
  Coordinates,
  FlightCheckWarning,
} from '@logbook/core'

import { getAirportsByIdents } from '#/lib/airports'
import { checkFlightsQueryOptions } from '#/lib/queries/check-flights'
import { ignoredChecksQueryOptions } from '#/lib/queries/ignored-checks'

import type { CheckFlightData } from '#/lib/server/check-flights'
import { ignoreCheck, unignoreCheck } from '#/lib/server/ignored-checks'

export const Route = createFileRoute('/_authed/check-flights')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await Promise.all([
      queryClient.query({
        ...checkFlightsQueryOptions(pilotId),
        staleTime: 'static',
      }),
      queryClient.query({
        ...ignoredChecksQueryOptions(pilotId),
        staleTime: 'static',
      }),
    ])
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
    routeFrom: f.routeFrom,
    routeTo: f.routeTo,
    route: f.route,
    instanceType: f.instanceType,
  }
}

function toCheckableFlightRoute(
  f: CheckFlightData,
  airportsByIdent: Partial<Record<string, Coordinates>>,
): CheckableFlightRoute {
  const idents = routeWaypointIdents(
    f.routeFrom ?? '',
    f.routeTo ?? '',
    f.route,
  )
  const waypoints = idents
    .map((ident) => airportsByIdent[ident])
    .filter(
      (coordinates): coordinates is Coordinates => coordinates !== undefined,
    )

  return {
    id: f.id,
    crossCountryTime: f.crossCountryTime,
    waypoints,
  }
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

/** Same `(flightId, code)` composite key `ignored_checks`' unique index enforces. */
function ignoreKey(flightId: string, code: string): string {
  return `${flightId}:${code}`
}

type FlaggedFlight = {
  flight: CheckFlightData
  warnings: Array<FlightCheckWarning>
}

type IgnoredEntry = {
  id: string
  flight: CheckFlightData
  code: string
  messages: Array<string>
}

function CheckFlightsPage() {
  const { pilotId } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(checkFlightsQueryOptions(pilotId))
  const { data: ignoredChecks } = useSuspenseQuery(
    ignoredChecksQueryOptions(pilotId),
  )
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)

  // Resolved client-side, after the page is already interactive, straight
  // from the browser's PocketBase client (see lib/airports.ts) — the SSR
  // loader only prefetches `data` itself, so this never runs on the server
  // and never needs to go through our own server function at all.
  const [airportsByIdent, setAirportsByIdent] = useState<
    Partial<Record<string, Coordinates>>
  >({})

  useEffect(() => {
    let cancelled = false
    const idents = data.flatMap((f) =>
      routeWaypointIdents(f.routeFrom ?? '', f.routeTo ?? '', f.route),
    )
    getAirportsByIdents(idents).then((result) => {
      if (!cancelled) setAirportsByIdent(result)
    })
    return () => {
      cancelled = true
    }
  }, [data])

  const flights = data.map(toCheckableFlight)
  const flightsById = new Map(data.map((f) => [f.id, f]))
  const duplicateWarningsById = checkForDuplicateFlights(flights)
  const crossCountryWarningsById = checkCrossCountryDistance(
    data.map((f) => toCheckableFlightRoute(f, airportsByIdent)),
  )
  const ignoredIdByKey = new Map(
    ignoredChecks.map((c) => [ignoreKey(c.flightId, c.code), c.id]),
  )

  const flagged: Array<FlaggedFlight> = []
  const ignoredByKey = new Map<string, IgnoredEntry>()

  for (const flight of flights) {
    const warnings = [
      ...checkFlight(flight),
      ...(duplicateWarningsById.get(flight.id) ?? []),
      ...(crossCountryWarningsById.get(flight.id) ?? []),
    ]
    if (warnings.length === 0) continue
    const source = flightsById.get(flight.id)
    if (!source) continue

    const visible: Array<FlightCheckWarning> = []
    for (const w of warnings) {
      const key = ignoreKey(flight.id, w.code)
      const ignoredId = ignoredIdByKey.get(key)
      if (ignoredId === undefined) {
        visible.push(w)
        continue
      }
      const entry = ignoredByKey.get(key)
      if (entry) entry.messages.push(w.message)
      else
        ignoredByKey.set(key, {
          id: ignoredId,
          flight: source,
          code: w.code,
          messages: [w.message],
        })
    }
    if (visible.length > 0) flagged.push({ flight: source, warnings: visible })
  }
  flagged.sort((a, b) => b.flight.date.localeCompare(a.flight.date))
  const ignored = [...ignoredByKey.values()].sort((a, b) =>
    b.flight.date.localeCompare(a.flight.date),
  )

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['check-flights', pilotId] }),
      queryClient.invalidateQueries({ queryKey: ['ignored-checks', pilotId] }),
    ])

  const handleIgnore = async (flightId: string, code: string) => {
    const key = ignoreKey(flightId, code)
    setBusyKey(key)
    try {
      await ignoreCheck({ data: { flightId, code } })
      await invalidateAll()
    } finally {
      setBusyKey(null)
    }
  }

  const handleRestore = async (id: string, flightId: string, code: string) => {
    const key = ignoreKey(flightId, code)
    setBusyKey(key)
    try {
      await unignoreCheck({ data: { id } })
      await invalidateAll()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">
            Check Flights
          </div>
          <div className="text-xs text-ink-dim">
            Advisory checks over your logbook — warnings worth a second look,
            not errors
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px]">
          <span className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
            Flagged
          </span>
          <span className="font-mono font-medium text-ink">
            {flagged.length}
          </span>
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
                <span className="font-mono text-xs text-ink-dim">
                  {flight.tailNumber}
                </span>
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
              {warnings.map((w, i) => {
                const key = ignoreKey(flight.id, w.code)
                return (
                  <li
                    key={`${w.code}-${i}`}
                    className="flex items-start justify-between gap-3 text-[12.5px] text-ink"
                  >
                    <span>{w.message}</span>
                    <button
                      type="button"
                      disabled={busyKey === key}
                      onClick={() => handleIgnore(flight.id, w.code)}
                      className="flex-shrink-0 text-[11px] text-ink-dim underline hover:text-ink disabled:opacity-50"
                    >
                      Ignore
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        {ignored.length > 0 && (
          <div className="mt-1 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowIgnored((v) => !v)}
              className="self-start text-[11.5px] text-ink-dim underline hover:text-ink"
            >
              {showIgnored ? 'Hide' : 'Show'} ignored checks ({ignored.length})
            </button>
            {showIgnored && (
              <div className="flex flex-col gap-2">
                {ignored.map((entry) => {
                  const key = ignoreKey(entry.flight.id, entry.code)
                  return (
                    <div
                      key={key}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 opacity-70"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-sm font-medium text-ink">
                          {fmtDate(parseDateValue(entry.flight.date))}
                        </span>
                        {entry.flight.tailNumber && (
                          <span className="font-mono text-xs text-ink-dim">
                            {entry.flight.tailNumber}
                          </span>
                        )}
                        <Link
                          to="/log-flight/$flightId"
                          params={{ flightId: entry.flight.id }}
                          className="ml-auto text-xs text-accent underline"
                        >
                          View flight
                        </Link>
                      </div>
                      <ul className="flex flex-col gap-1">
                        {entry.messages.map((message, i) => (
                          <li
                            key={i}
                            className="text-[12.5px] text-ink-dim"
                          >
                            {message}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={busyKey === key}
                        onClick={() =>
                          handleRestore(entry.id, entry.flight.id, entry.code)
                        }
                        className="self-start text-[11px] text-accent underline disabled:opacity-50"
                      >
                        Un-ignore
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
