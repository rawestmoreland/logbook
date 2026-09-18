import { queryOptions } from '@tanstack/react-query'

import { routeWaypointIdents } from '@logbook/core'

import type { Coordinates } from '@logbook/core'

import { getAirportsByIdents } from '#/lib/server/airports'
import { getCheckFlightsData } from '#/lib/server/check-flights'

import type { CheckFlightData } from '#/lib/server/check-flights'

export type CheckFlightsData = {
  flights: Array<CheckFlightData>
  /** Coordinates for every ident referenced across every flight's route,
   * keyed by ident/icao/iata — see `getAirportsByIdents`. An ident with no
   * entry couldn't be resolved (unknown, private strip, typo). */
  airportsByIdent: Partial<Record<string, Coordinates>>
}

export function checkFlightsQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['check-flights', pilotId],
    queryFn: async (): Promise<CheckFlightsData> => {
      const flights = await getCheckFlightsData({ data: { pilotId } })
      // Deduplicated here, before the server function call — a few hundred
      // flights each contribute 2+ waypoints, and sending that whole list
      // undeduplicated as a GET request's query string is what triggers a
      // 431 (Request Header Fields Too Large) before the request even
      // reaches the handler's own dedup step.
      const idents = [
        ...new Set(
          flights.flatMap((f) => routeWaypointIdents(f.routeFrom ?? '', f.routeTo ?? '', f.route)),
        ),
      ]
      const airportsByIdent = await getAirportsByIdents({ data: { idents } })
      return { flights, airportsByIdent }
    },
  })
}
