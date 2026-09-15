import { createServerFn } from '@tanstack/react-start'

import {
  displayTailNumber,
  flightFormSchema,
  isAnonymousTail,
  parseDateValue,
  parseNumberValue,
} from '@logbook/core'

import type {
  AircraftModelsResponse,
  AircraftResponse,
  FlightExportRow,
  FlightFormValues,
  FlightsResponse,
  ManufacturersResponse,
} from '@logbook/core'

import { describeModel } from '#/lib/server/models'
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
        expand: 'aircraft.model.manufacturer',
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
      const expand = f.expand as
        | {
            aircraft?: AircraftResponse<{
              model?: AircraftModelsResponse<{ manufacturer?: ManufacturersResponse }>
            }>
          }
        | undefined
      const aircraft = expand?.aircraft
      const model = aircraft?.expand.model
      const manufacturer = model?.expand.manufacturer
      const aircraftType =
        model && manufacturer ? describeModel(manufacturer.name, model.model, model.common_name) : ''
      return {
        id: f.id,
        date: f.date,
        aircraftType,
        aircraftIdent: aircraft ? displayTailNumber(aircraft.tail_number, aircraftType) : '',
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

/**
 * A single flight, reshaped back into `FlightFormValues` so the edit route
 * can hand it straight to the same form the create route uses as `values`.
 */
export const getFlight = createServerFn({ method: 'GET' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<FlightFormValues & { id: string }> => {
    const pb = createRequestPocketBase()
    const f = await pb.collection('flights').getOne(data.id)

    return {
      id: f.id,
      date: f.date.slice(0, 10),
      aircraftId: f.aircraft,
      routeFrom: f.route_from,
      routeTo: f.route_to,
      totalTime: String(f.total_time),
      picTime: String(f.pic_time),
      sicTime: String(f.sic_time),
      dualTime: String(f.dual_time),
      soloTime: String(f.solo_time),
      nightTime: String(f.night_time),
      actualInstrument: String(f.actual_instrument),
      simInstrument: String(f.sim_instrument),
      dayLandings: String(f.day_landings),
      nightLandings: String(f.night_landings),
      dayLandingsFullStop: String(f.day_landings_full_stop),
      approaches: String(f.approaches),
      holding: f.holding,
      courseTracking: f.course_tracking,
      remarks: f.remarks,
    }
  })

/**
 * Snake_case PocketBase field mapping shared by `createFlight`/`updateFlight`
 * and the CSV importer's `commitImportFlights` (`import.ts`) — every create-flight
 * path goes through the same shape rather than each hand-rolling its own
 * copy. Takes `aircraftId` separately from the rest since the CSV importer's
 * row shape (`CsvRowValues`) carries `tailNumber`/`model` text instead of an
 * already-resolved `aircraftId`.
 */
export function toFlightFields(aircraftId: string, values: Omit<FlightFormValues, 'aircraftId'>) {
  return {
    aircraft: aircraftId,
    date: parseDateValue(values.date).toISOString(),
    route_from: values.routeFrom.trim().toUpperCase(),
    route_to: values.routeTo.trim().toUpperCase(),
    total_time: parseNumberValue(values.totalTime),
    pic_time: parseNumberValue(values.picTime),
    sic_time: parseNumberValue(values.sicTime),
    dual_time: parseNumberValue(values.dualTime),
    solo_time: parseNumberValue(values.soloTime),
    night_time: parseNumberValue(values.nightTime),
    actual_instrument: parseNumberValue(values.actualInstrument),
    sim_instrument: parseNumberValue(values.simInstrument),
    day_landings: parseNumberValue(values.dayLandings),
    night_landings: parseNumberValue(values.nightLandings),
    day_landings_full_stop: parseNumberValue(values.dayLandingsFullStop),
    approaches: parseNumberValue(values.approaches),
    holding: values.holding,
    course_tracking: values.courseTracking,
    remarks: values.remarks?.trim() ?? '',
  }
}

export type CreateFlightInput = FlightFormValues & { pilotId: string }

/**
 * `pilotId` isn't part of `flightFormSchema` (it comes from route context,
 * not a form field), so it rides alongside the validated shape rather than
 * through it. PocketBase's own `createRule` (`pilot.user = @request.auth.id`)
 * is the actual authority here — it rejects the write outright if this
 * pilotId doesn't belong to the caller, regardless of what the client sends.
 */
export const createFlight = createServerFn({ method: 'POST' })
  .validator((data: CreateFlightInput): CreateFlightInput => {
    flightFormSchema.parse(data)
    return data
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()

    const created = await pb.collection('flights').create({
      pilot: data.pilotId,
      ...toFlightFields(data.aircraftId, data),
    })

    return { id: created.id }
  })

export type UpdateFlightInput = FlightFormValues & { id: string }

/**
 * Same validation and field mapping as `createFlight`. `updateRule`
 * (`pilot.user = @request.auth.id`) is the actual authority on ownership —
 * this doesn't re-check it, same as `createFlight`'s note about `createRule`.
 */
export const updateFlight = createServerFn({ method: 'POST' })
  .validator((data: UpdateFlightInput): UpdateFlightInput => {
    flightFormSchema.parse(data)
    return data
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()

    await pb.collection('flights').update(data.id, toFlightFields(data.aircraftId, data))

    return { id: data.id }
  })

/**
 * Soft delete: sets `deleted: true` rather than a hard delete, per the sync
 * convention every collection follows (see CLAUDE.md and
 * `deleteAircraft`). `getFlights` already filters `deleted != true` on both
 * its page and full-history queries, so a deleted flight drops out of the
 * list and every total with no other change needed.
 */
export const deleteFlight = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()
    await pb.collection('flights').update(data.id, { deleted: true })
    return { id: data.id }
  })

/**
 * Every one of the pilot's flights in the CSV export column shape — unlike
 * `getFlights`'s `all` query (which projects down to just the numeric
 * fields totals need), this needs the full per-flight rows, so it's its own
 * query rather than a variant of that one.
 */
export const getFlightsForExport = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<Array<FlightExportRow>> => {
    const pb = createRequestPocketBase()
    const filter = pb.filter('pilot = {:pilotId} && deleted != true', {
      pilotId: data.pilotId,
    })

    const flights = await pb.collection('flights').getFullList({
      filter,
      sort: 'date',
      expand: 'aircraft.model.manufacturer',
    })

    return flights.map((f) => {
      const expand = f.expand as
        | {
            aircraft?: AircraftResponse<{
              model?: AircraftModelsResponse<{ manufacturer?: ManufacturersResponse }>
            }>
          }
        | undefined
      const aircraft = expand?.aircraft
      const model = aircraft?.expand.model
      const manufacturer = model?.expand.manufacturer
      const modelDescription =
        model && manufacturer ? describeModel(manufacturer.name, model.model, model.common_name) : ''
      // A synthesized anonymous tail (`#<modelId>`) is an internal
      // implementation detail, not something to round-trip through the
      // export — a re-import should route it back through anonymous-aircraft
      // resolution, not treat `#abc123` as a literal tail number.
      const tailNumber =
        aircraft && !isAnonymousTail(aircraft.tail_number) ? aircraft.tail_number : ''

      return {
        date: f.date.slice(0, 10),
        tailNumber,
        model: modelDescription,
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
        dayLandingsFullStop: f.day_landings_full_stop,
        approaches: f.approaches,
        holding: f.holding,
        courseTracking: f.course_tracking,
        remarks: f.remarks,
      }
    })
  })
