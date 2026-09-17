import { createServerFn } from '@tanstack/react-start'

import { isAircraftInstanceType, isCategoryClass } from '@logbook/core'

import type {
  AircraftInstanceType,
  AircraftModelsResponse,
  AircraftResponse,
  CategoryClass,
  ManufacturersResponse,
} from '@logbook/core'

import { describeModel } from '#/lib/server/models'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

/** Wire-friendly shape of `AnalysisFlight` — dates travel as strings across
 * the server function boundary, same convention as `CurrencyFlightData`
 * (`currency.ts`); the Analysis page parses them back with `parseDateValue`. */
export type AnalysisFlightData = {
  id: string
  date: string
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
  approaches: number
  dayLandings: number
  dayLandingsFullStop: number
  nightLandings: number
  tailNumber: string
  aircraftModel: string
  categoryClass: CategoryClass
  instanceType: AircraftInstanceType
}

export type AnalysisData = {
  flights: Array<AnalysisFlightData>
}

/**
 * The pilot's entire flight history, shaped for `analysis/aggregate.ts`'s
 * bucket groupings — unlike `getFlights` (`flights.ts`), this is
 * unpaginated (the Analysis page charts the whole logbook at once) and
 * expands `aircraft.model.manufacturer` so tail number, model description,
 * category/class, and instance type are all available to group by. A
 * flight whose aircraft didn't expand to a recognized category/class is
 * dropped, same fail-safe convention as `getCurrencyData`.
 */
export const getAnalysisData = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<AnalysisData> => {
    const pb = createRequestPocketBase()

    const rawFlights = await pb.collection('flights').getFullList({
      filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
      sort: 'date',
      expand: 'aircraft.model.manufacturer',
    })

    const flights: Array<AnalysisFlightData> = []
    for (const f of rawFlights) {
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
      if (!aircraft || !model || !isCategoryClass(model.category_class)) continue

      // Widen to `string` first: PocketBase's typegen marks every select
      // field non-optional, which hides that an unset one actually comes
      // back as `""` at runtime (see aircraft.ts's toListItem()). Unset
      // defaults to 'real', the same convention used there.
      const instanceType: string = aircraft.instance_type

      flights.push({
        id: f.id,
        date: f.date.slice(0, 10),
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
        approaches: f.approaches,
        dayLandings: f.day_landings,
        dayLandingsFullStop: f.day_landings_full_stop,
        nightLandings: f.night_landings,
        tailNumber: aircraft.tail_number,
        aircraftModel: manufacturer ? describeModel(manufacturer.name, model.model, model.common_name) : model.model,
        categoryClass: model.category_class,
        instanceType: isAircraftInstanceType(instanceType) ? instanceType : 'real',
      })
    }

    return { flights }
  })
