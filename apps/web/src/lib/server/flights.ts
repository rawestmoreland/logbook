import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import {
  displayTailNumber,
  flightFormSchema,
  isAnonymousTail,
  parseDateValue,
  parseNumberValue,
  startingTotalsFormSchema,
  STARTING_TOTALS_DATE,
} from '@logbook/core'

import type {
  AircraftModelsResponse,
  AircraftResponse,
  FlightExportRow,
  FlightFormValues,
  FlightsResponse,
  ManufacturersResponse,
  StartingTotalsFormValues,
} from '@logbook/core'

import { describeModel } from '#/lib/server/models'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

export const PAGE_SIZE = 20

export type FlightListItem = {
  id: string
  date: string
  aircraftType: string
  aircraftIdent: string
  route: string
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
  totalLandings: number
  nightLandingsFullStop: number
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
  crossCountryTime: number
  dualGivenTime: number
  groundSimTime: number
  totalLandings: number
  nightLandingsFullStop: number
}

/**
 * Everything about the pilot's flights that's independent of the current
 * search/aircraft filter or page — its own query so the Main screen's
 * header/stats strip can stay mounted (and un-refetched) while the table
 * itself re-fetches per page/filter change, instead of both being tied to
 * one query key and re-suspending together.
 */
export type FlightsSummary = {
  totalCount: number
  firstFlightDate: string | null
  grandTotals: FlightTotals
}

export type FlightsPageResult = {
  flights: Array<FlightListItem>
  /** Count matching the current search/aircraft filter — what pagination is based on. */
  filteredCount: number
  totalPages: number
  pageTotals: FlightTotals
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
  crossCountryTime: 0,
  dualGivenTime: 0,
  groundSimTime: 0,
  totalLandings: 0,
  nightLandingsFullStop: 0,
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
    | 'cross_country_time'
    | 'dual_given_time'
    | 'ground_sim_time'
    | 'total_landings'
    | 'night_landings_full_stop'
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
    sum.crossCountryTime += f.cross_country_time
    sum.dualGivenTime += f.dual_given_time
    sum.groundSimTime += f.ground_sim_time
    sum.totalLandings += f.total_landings
    sum.nightLandingsFullStop += f.night_landings_full_stop
    return sum
  }, zeroTotals())
}

/** Exported for the client to derive "amount forward" from the summary's grandTotals and a page's pageTotals without a redundant fetch. */
export function subtractTotals(a: FlightTotals, b: FlightTotals): FlightTotals {
  return {
    totalTime: a.totalTime - b.totalTime,
    picTime: a.picTime - b.picTime,
    sicTime: a.sicTime - b.sicTime,
    dualTime: a.dualTime - b.dualTime,
    soloTime: a.soloTime - b.soloTime,
    nightTime: a.nightTime - b.nightTime,
    actualInstrument: a.actualInstrument - b.actualInstrument,
    simInstrument: a.simInstrument - b.simInstrument,
    crossCountryTime: a.crossCountryTime - b.crossCountryTime,
    dualGivenTime: a.dualGivenTime - b.dualGivenTime,
    groundSimTime: a.groundSimTime - b.groundSimTime,
    totalLandings: a.totalLandings - b.totalLandings,
    nightLandingsFullStop: a.nightLandingsFullStop - b.nightLandingsFullStop,
  }
}

/**
 * Totals aggregated over every one of the pilot's flights (fetched as a
 * `fields=`-projected numbers-only list, so aggregating the whole logbook
 * stays cheap even at a few thousand entries), independent of any
 * search/aircraft filter or page — the Main screen's header and stats strip
 * read from this rather than `getFlights`, so paging through the table
 * doesn't need to touch them at all.
 */
export const getFlightsSummary = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<FlightsSummary> => {
    const pb = createRequestPocketBase()
    const all = await pb.collection('flights').getFullList({
      filter: pb.filter('pilot = {:pilotId} && deleted != true && pending != true', {
        pilotId: data.pilotId,
      }),
      sort: 'date',
      fields:
        'date,total_time,pic_time,sic_time,dual_time,solo_time,night_time,actual_instrument,sim_instrument,cross_country_time,dual_given_time,ground_sim_time,total_landings,night_landings_full_stop',
    })

    return {
      totalCount: all.length,
      firstFlightDate: all[0]?.date ?? null,
      grandTotals: sumTotals(all),
    }
  })

export type GetFlightsInput = {
  pilotId: string
  page?: number
  search?: string
  aircraftId?: string
}

/**
 * A bounded, sorted page of full flight records for the Main screen's
 * table, scoped by search/aircraft filter and page. Deliberately doesn't
 * carry `grandTotals`/`totalCount`/`firstFlightDate` — those live in
 * `getFlightsSummary` instead, so a page/filter change only re-fetches (and
 * only re-suspends) this narrower query, not the summary the header/stats
 * strip depend on. "Amount forward" is likewise left for the caller to
 * derive as `subtractTotals(summary.grandTotals, pageTotals)`, since
 * computing it here would mean re-fetching the whole-history list this
 * function otherwise has no need for.
 */
export const getFlights = createServerFn({ method: 'GET' })
  .validator((data: GetFlightsInput): GetFlightsInput => data)
  .handler(async ({ data }): Promise<FlightsPageResult> => {
    const pb = createRequestPocketBase()
    const filterParts = [
      pb.filter('pilot = {:pilotId} && deleted != true && is_starting_totals != true && pending != true', {
        pilotId: data.pilotId,
      }),
    ]
    if (data.aircraftId) {
      filterParts.push(pb.filter('aircraft = {:aircraftId}', { aircraftId: data.aircraftId }))
    }
    const search = data.search?.trim()
    if (search) {
      filterParts.push(
        pb.filter('(route ~ {:q} || remarks ~ {:q} || aircraft.tail_number ~ {:q})', { q: search }),
      )
    }
    const pageNumber = data.page ?? 1

    const page = await pb.collection('flights').getList(pageNumber, PAGE_SIZE, {
      filter: filterParts.join(' && '),
      sort: '-date',
      expand: 'aircraft.model.manufacturer',
    })

    const pageTotals = sumTotals(page.items)
    const flights: Array<FlightListItem> = page.items.map(toFlightListItem)

    return {
      flights,
      filteredCount: page.totalItems,
      totalPages: page.totalPages,
      pageTotals,
    }
  })

/** Shared by `getFlights` and `getPendingFlights` — both list flights fetched with the same `aircraft.model.manufacturer` expand. */
function toFlightListItem(f: FlightsResponse): FlightListItem {
  const expand = f.expand as
    | { aircraft?: AircraftResponse<{ model?: AircraftModelsResponse<{ manufacturer?: ManufacturersResponse }> }> }
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
    route: f.route,
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
    groundSimTime: f.ground_sim_time,
    totalLandings: f.total_landings,
    nightLandingsFullStop: f.night_landings_full_stop,
    remarks: f.remarks,
  }
}

/**
 * Every one of the pilot's pending flights (MyFlightbook parity) — logged
 * but not yet reviewed, so held out of `getFlights`/`getFlightsSummary`/
 * currency until confirmed. Shaped identically to `getFlights`' list items;
 * the Pending Flights page's Confirm/Discard/Edit actions are the only way
 * one of these rows changes.
 */
export const getPendingFlights = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<Array<FlightListItem>> => {
    const pb = createRequestPocketBase()
    const flights = await pb.collection('flights').getFullList({
      filter: pb.filter('pilot = {:pilotId} && deleted != true && pending = true', {
        pilotId: data.pilotId,
      }),
      sort: '-date',
      expand: 'aircraft.model.manufacturer',
    })

    return flights.map(toFlightListItem)
  })

/**
 * Confirms a pending flight: clears `pending`, so it now counts everywhere
 * `getFlights`/`getFlightsSummary`/currency already filter it out of.
 */
export const confirmPendingFlight = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()
    await pb.collection('flights').update(data.id, { pending: false })
    return { id: data.id }
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
      route: f.route,
      totalTime: String(f.total_time),
      picTime: String(f.pic_time),
      sicTime: String(f.sic_time),
      dualTime: String(f.dual_time),
      soloTime: String(f.solo_time),
      nightTime: String(f.night_time),
      actualInstrument: String(f.actual_instrument),
      simInstrument: String(f.sim_instrument),
      crossCountryTime: String(f.cross_country_time),
      dualGivenTime: String(f.dual_given_time),
      groundSimTime: String(f.ground_sim_time),
      totalLandings: String(f.total_landings),
      dayLandingsFullStop: String(f.day_landings_full_stop),
      nightLandingsFullStop: String(f.night_landings_full_stop),
      approaches: String(f.approaches),
      holding: f.holding,
      courseTracking: f.course_tracking,
      remarks: f.remarks,
      pending: f.pending,
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
    route: values.route.trim().toUpperCase(),
    total_time: parseNumberValue(values.totalTime),
    pic_time: parseNumberValue(values.picTime),
    sic_time: parseNumberValue(values.sicTime),
    dual_time: parseNumberValue(values.dualTime),
    solo_time: parseNumberValue(values.soloTime),
    night_time: parseNumberValue(values.nightTime),
    actual_instrument: parseNumberValue(values.actualInstrument),
    sim_instrument: parseNumberValue(values.simInstrument),
    cross_country_time: parseNumberValue(values.crossCountryTime),
    dual_given_time: parseNumberValue(values.dualGivenTime),
    ground_sim_time: parseNumberValue(values.groundSimTime),
    total_landings: parseNumberValue(values.totalLandings),
    day_landings_full_stop: parseNumberValue(values.dayLandingsFullStop),
    night_landings_full_stop: parseNumberValue(values.nightLandingsFullStop),
    approaches: parseNumberValue(values.approaches),
    holding: values.holding,
    course_tracking: values.courseTracking,
    remarks: values.remarks?.trim() ?? '',
    pending: values.pending ?? false,
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
 * `deleteAircraft`). `getFlights`/`getFlightsSummary` already filter
 * `deleted != true`, so a deleted flight drops out of the list and every
 * total with no other change needed.
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
 * `getFlightsSummary`'s query (which projects down to just the numeric
 * fields totals need), this needs the full per-flight rows, so it's its own
 * query rather than a variant of that one.
 */
export const getFlightsForExport = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<Array<FlightExportRow>> => {
    const pb = createRequestPocketBase()
    // Excludes pending flights same as getFlights — an export is a
    // permanent-record artifact, and an unconfirmed flight isn't part of the
    // permanent record yet.
    const filter = pb.filter(
      'pilot = {:pilotId} && deleted != true && is_starting_totals != true && pending != true',
      { pilotId: data.pilotId },
    )

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
        route: f.route,
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
        groundSimTime: f.ground_sim_time,
        totalLandings: f.total_landings,
        dayLandingsFullStop: f.day_landings_full_stop,
        nightLandingsFullStop: f.night_landings_full_stop,
        approaches: f.approaches,
        holding: f.holding,
        courseTracking: f.course_tracking,
        remarks: f.remarks,
      }
    })
  })

/**
 * Reshapes a starting-totals `flights` row back into `StartingTotalsFormValues`
 * — same convention as `getFlight`.
 */
function toStartingTotalsFormValues(f: FlightsResponse): StartingTotalsFormValues {
  return {
    totalTime: String(f.total_time),
    picTime: String(f.pic_time),
    sicTime: String(f.sic_time),
    dualTime: String(f.dual_time),
    soloTime: String(f.solo_time),
    nightTime: String(f.night_time),
    actualInstrument: String(f.actual_instrument),
    simInstrument: String(f.sim_instrument),
    crossCountryTime: String(f.cross_country_time),
    dualGivenTime: String(f.dual_given_time),
    groundSimTime: String(f.ground_sim_time),
    totalLandings: String(f.total_landings),
    dayLandingsFullStop: String(f.day_landings_full_stop),
    nightLandingsFullStop: String(f.night_landings_full_stop),
    approaches: String(f.approaches),
  }
}

/**
 * Looks up the pilot's one starting-totals row, if any — shared by
 * `getStartingTotals` and `saveStartingTotals`'s create-or-update check.
 */
async function findStartingTotalsRecord(
  pb: ReturnType<typeof createRequestPocketBase>,
  pilotId: string,
): Promise<FlightsResponse | null> {
  try {
    return await pb
      .collection('flights')
      .getFirstListItem(pb.filter('pilot = {:pilotId} && is_starting_totals = true', { pilotId }))
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null
    throw err
  }
}

/**
 * The pilot's starting-totals row, if they've entered one — `null` when
 * they haven't, which the Starting Totals page reads as "show the empty
 * form" rather than an error.
 */
export const getStartingTotals = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<StartingTotalsFormValues | null> => {
    const pb = createRequestPocketBase()
    const existing = await findStartingTotalsRecord(pb, data.pilotId)
    return existing ? toStartingTotalsFormValues(existing) : null
  })

export type SaveStartingTotalsInput = StartingTotalsFormValues & { pilotId: string }

/**
 * Create-or-update in one call: a starting-totals snapshot is edited in
 * place, not logged as a new entry each time (see CLAUDE.md's note on this
 * being a single carry-forward row, not a log of edits). `aircraft` is left
 * unset — the field went back to optional in
 * `1789800000_updated_flights.go` specifically so this row can omit it —
 * and `is_starting_totals`/`date` mark it so it's excluded from the flight
 * list/search/export (`getFlights`/`getFlightsForExport`) while still
 * folding into `getFlightsSummary`'s grand totals and staying outside every
 * currency window (`STARTING_TOTALS_DATE`). The database's own partial
 * unique index (`idx_flights_one_starting_totals_per_pilot`) is the actual
 * authority on "at most one per pilot" — this just avoids hitting it on the
 * happy path by updating the existing row when there is one.
 */
export const saveStartingTotals = createServerFn({ method: 'POST' })
  .validator((data: SaveStartingTotalsInput): SaveStartingTotalsInput => {
    startingTotalsFormSchema.parse(data)
    return data
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()
    const fields = {
      date: parseDateValue(STARTING_TOTALS_DATE).toISOString(),
      is_starting_totals: true,
      total_time: parseNumberValue(data.totalTime),
      pic_time: parseNumberValue(data.picTime),
      sic_time: parseNumberValue(data.sicTime),
      dual_time: parseNumberValue(data.dualTime),
      solo_time: parseNumberValue(data.soloTime),
      night_time: parseNumberValue(data.nightTime),
      actual_instrument: parseNumberValue(data.actualInstrument),
      sim_instrument: parseNumberValue(data.simInstrument),
      cross_country_time: parseNumberValue(data.crossCountryTime),
      dual_given_time: parseNumberValue(data.dualGivenTime),
      ground_sim_time: parseNumberValue(data.groundSimTime),
      total_landings: parseNumberValue(data.totalLandings),
      day_landings_full_stop: parseNumberValue(data.dayLandingsFullStop),
      night_landings_full_stop: parseNumberValue(data.nightLandingsFullStop),
      approaches: parseNumberValue(data.approaches),
      holding: false,
      course_tracking: false,
      remarks: '',
    }

    const existing = await findStartingTotalsRecord(pb, data.pilotId)

    if (existing) {
      await pb.collection('flights').update(existing.id, fields)
      return { id: existing.id }
    }

    const created = await pb.collection('flights').create({ pilot: data.pilotId, ...fields })
    return { id: created.id }
  })
