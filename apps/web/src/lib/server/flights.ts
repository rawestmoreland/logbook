import { createServerFn } from '@tanstack/react-start'

import type { AircraftResponse, FlightsResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

const PAGE_SIZE = 20

export type FlightListItem = {
  id: string
  date: string
  aircraftType: string
  aircraftIdent: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  sicTime: number
  dualTime: number
  soloTime: number
  nightTime: number
  actualInstrument: number
  simInstrument: number
  dayLandings: number
  nightLandings: number
  remarks: string
}

export type FlightTotals = {
  totalTime: number
  picTime: number
  sicTime: number
  dualTime: number
  soloTime: number
  nightTime: number
  actualInstrument: number
  simInstrument: number
  dayLandings: number
  nightLandings: number
}

export type FlightsPage = {
  flights: Array<FlightListItem>
  totalCount: number
  firstFlightDate: string | null
  pageTotals: FlightTotals
  amountForwardTotals: FlightTotals
  grandTotals: FlightTotals
}

const zeroTotals = (): FlightTotals => ({
  totalTime: 0,
  picTime: 0,
  sicTime: 0,
  dualTime: 0,
  soloTime: 0,
  nightTime: 0,
  actualInstrument: 0,
  simInstrument: 0,
  dayLandings: 0,
  nightLandings: 0,
})

function sumTotals(
  flights: Array<Pick<
    FlightsResponse,
    | 'total_time'
    | 'pic_time'
    | 'sic_time'
    | 'dual_time'
    | 'solo_time'
    | 'night_time'
    | 'actual_instrument'
    | 'sim_instrument'
    | 'day_landings'
    | 'night_landings'
  >>,
): FlightTotals {
  return flights.reduce((sum, f) => {
    sum.totalTime += f.total_time
    sum.picTime += f.pic_time
    sum.sicTime += f.sic_time
    sum.dualTime += f.dual_time
    sum.soloTime += f.solo_time
    sum.nightTime += f.night_time
    sum.actualInstrument += f.actual_instrument
    sum.simInstrument += f.sim_instrument
    sum.dayLandings += f.day_landings
    sum.nightLandings += f.night_landings
    return sum
  }, zeroTotals())
}

function subtractTotals(a: FlightTotals, b: FlightTotals): FlightTotals {
  return {
    totalTime: a.totalTime - b.totalTime,
    picTime: a.picTime - b.picTime,
    sicTime: a.sicTime - b.sicTime,
    dualTime: a.dualTime - b.dualTime,
    soloTime: a.soloTime - b.soloTime,
    nightTime: a.nightTime - b.nightTime,
    actualInstrument: a.actualInstrument - b.actualInstrument,
    simInstrument: a.simInstrument - b.simInstrument,
    dayLandings: a.dayLandings - b.dayLandings,
    nightLandings: a.nightLandings - b.nightLandings,
  }
}

/**
 * Flights for the Main screen: a bounded, sorted page of full records for
 * display, plus totals aggregated over every one of the pilot's flights
 * (fetched as a `fields=`-projected numbers-only list, so aggregating the
 * whole logbook stays cheap even at a few thousand entries).
 * "Amount forward" is just grand totals minus this page's totals — accurate
 * regardless of where the page cursor sits, so there's no need to track it
 * as separate running state.
 */
export const getFlights = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<FlightsPage> => {
    const pb = createRequestPocketBase()
    const filter = pb.filter('pilot = {:pilotId} && deleted != true', {
      pilotId: data.pilotId,
    })

    // Distinct requestKeys: both calls hit the same `flights` list endpoint
    // concurrently, and the SDK's default auto-cancellation treats
    // same-endpoint in-flight requests as duplicates and aborts the older
    // one — exactly what these two legitimately concurrent calls look like.
    const [page, all] = await Promise.all([
      pb.collection('flights').getList(1, PAGE_SIZE, {
        filter,
        sort: '-date',
        expand: 'aircraft',
        requestKey: 'flights-page',
      }),
      pb.collection('flights').getFullList({
        filter,
        sort: 'date',
        fields:
          'date,total_time,pic_time,sic_time,dual_time,solo_time,night_time,actual_instrument,sim_instrument,day_landings,night_landings',
        requestKey: 'flights-all',
      }),
    ])

    const grandTotals = sumTotals(all)
    const pageTotals = sumTotals(page.items)

    const flights: Array<FlightListItem> = page.items.map((f) => {
      const expand = f.expand as { aircraft?: AircraftResponse } | undefined
      const aircraft = expand?.aircraft
      return {
        id: f.id,
        date: f.date,
        aircraftType: aircraft?.type ?? '',
        aircraftIdent: aircraft?.tail_number ?? '',
        routeFrom: f.route_from,
        routeTo: f.route_to,
        totalTime: f.total_time,
        picTime: f.pic_time,
        sicTime: f.sic_time,
        dualTime: f.dual_time,
        soloTime: f.solo_time,
        nightTime: f.night_time,
        actualInstrument: f.actual_instrument,
        simInstrument: f.sim_instrument,
        dayLandings: f.day_landings,
        nightLandings: f.night_landings,
        remarks: f.remarks,
      }
    })

    return {
      flights,
      totalCount: page.totalItems,
      firstFlightDate: all[0]?.date ?? null,
      pageTotals,
      amountForwardTotals: subtractTotals(grandTotals, pageTotals),
      grandTotals,
    }
  })
