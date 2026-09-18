import { createServerFn } from '@tanstack/react-start'

import { isAircraftInstanceType, isAnonymousTail } from '@logbook/core'

import type { AircraftInstanceType, AircraftResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

/** Wire-friendly shape of `CheckableFlight` — the date travels as a string
 * and is parsed back with `parseDateValue` on the Check Flights page, same
 * convention as `CurrencyFlightData`. */
export type CheckFlightData = {
  id: string
  date: string
  tailNumber: string
  /** Real aircraft vs. simulator/ATD — see `checkFlight`'s device-session exemption. */
  instanceType: AircraftInstanceType
  routeFrom: string | null
  routeTo: string | null
  /** Full multi-stop route text, when logged — see `routeWaypointIdents` in `route.ts`. */
  route: string | null
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
  totalLandings: number
  dayLandingsFullStop: number
  nightLandingsFullStop: number
  approaches: number
}

/**
 * Every one of the pilot's real flights, shaped for `flight-checker.ts`.
 * Starting totals are excluded, same as `getFlightsForExport` — they're a
 * single aggregate row, not a flight the checker's per-flight rules make
 * sense against.
 *
 * Pending flights, unlike starting totals, are deliberately left in: Check
 * Flights is advisory (see the module doc comment in flight-checker.ts) and
 * a pending flight benefits from a second look — a decimal-point typo or an
 * accidental duplicate is worth catching before confirming it, not after.
 * `getFlightsSummary`/`getFlights`/`getCurrencyData` exclude pending flights
 * because those feed totals and currency, which a pilot hasn't vouched for
 * an unconfirmed flight yet; this only surfaces warnings, so the same
 * exclusion isn't warranted here.
 */
export const getCheckFlightsData = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<Array<CheckFlightData>> => {
    const pb = createRequestPocketBase()
    const filter = pb.filter('pilot = {:pilotId} && deleted != true && is_starting_totals != true', {
      pilotId: data.pilotId,
    })

    const flights = await pb.collection('flights').getFullList({
      filter,
      sort: 'date',
      expand: 'aircraft',
    })

    return flights.map((f) => {
      const aircraft = (f.expand as { aircraft?: AircraftResponse } | undefined)?.aircraft
      const tailNumber = aircraft && !isAnonymousTail(aircraft.tail_number) ? aircraft.tail_number : ''
      // Widen to `string` first: PocketBase's typegen marks every select field
      // non-optional, which hides that an unset one actually comes back as
      // `""` at runtime. Unset defaults to 'real', same convention as currency.ts.
      const instanceType: string | undefined = aircraft?.instance_type
      const resolvedInstanceType: AircraftInstanceType =
        instanceType !== undefined && isAircraftInstanceType(instanceType) ? instanceType : 'real'

      return {
        id: f.id,
        date: f.date.slice(0, 10),
        tailNumber,
        instanceType: resolvedInstanceType,
        routeFrom: f.route_from || null,
        routeTo: f.route_to || null,
        route: f.route || null,
        totalTime: f.total_time,
        picTime: f.pic_time,
        sicTime: f.sic_time,
        dualTime: f.dual_time,
        soloTime: f.solo_time,
        nightTime: f.night_time,
        actualInstrument: f.actual_instrument,
        simInstrument: f.sim_instrument,
        crossCountryTime: f.cross_country_time,
        dualGivenTime: f.dual_given_time,
        totalLandings: f.total_landings,
        dayLandingsFullStop: f.day_landings_full_stop,
        nightLandingsFullStop: f.night_landings_full_stop,
        approaches: f.approaches,
      }
    })
  })
