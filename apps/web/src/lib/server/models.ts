import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import {
  isCategoryClass,
  isComplexAircraft,
  isEngineType,
  isMinimumAvionics,
} from '@logbook/core'

import type {
  AircraftModelsResponse,
  AircraftTypeInfo,
  ManufacturersResponse,
} from '@logbook/core'

import { findOrCreateManufacturer } from '#/lib/server/manufacturers'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type AircraftModelItem = {
  id: string
  manufacturerId: string
  manufacturerName: string
  model: string
  commonName: string
  categoryClass: string
  complex: boolean
  highPerformance: boolean
  tailwheel: boolean
  engineType: string
  /** One of `MINIMUM_AVIONICS` (glass panel / TAA classification), or '' if
   * unset. */
  minimumAvionics: string
  flaps: boolean
  controllablePitchProp: boolean
  retractableGear: boolean
  icao: string
  /** FAA/Transport Canada Type Certificate Data Sheet model number (e.g.
   * "CL-600-2B19"), or '' if unknown — independent of `model`. */
  typeDesignDesignator: string
  description: string
}

type ModelWithManufacturer = AircraftModelsResponse<{
  manufacturer: ManufacturersResponse
}>

/** Shared with aircraft.ts/flights.ts/currency.ts for the aircraft's display type. */
export function describeModel(
  manufacturerName: string,
  model: string,
  commonName: string,
): string {
  return commonName || `${manufacturerName} ${model}`
}

/**
 * The wire shape of a flight's `logged_*` snapshot fields (issue #71),
 * ready to spread directly into a `pb.collection('flights').create()`/
 * `.update()` payload alongside `toFlightFields`'s output. Always writes a
 * full snapshot — `flights.ts`'s `createFlight`/`updateFlight` and
 * `import.ts`'s `commitImportFlights` call this on every save, not only
 * when the aircraft changes, so the flight's frozen type always matches
 * what the pilot picked when they last saved it.
 */
export type FlightAircraftSnapshotFields = {
  logged_aircraft_type: string
  logged_category_class: string
  logged_complex: boolean
  logged_high_performance: boolean
  logged_tailwheel: boolean
  logged_engine_type: string
}

/** Builds `FlightAircraftSnapshotFields` from a resolved `AircraftTypeInfo`, or an all-blank snapshot if the aircraft's model didn't resolve (e.g. an unrecognized category_class). */
export function buildFlightAircraftSnapshotFields(info: AircraftTypeInfo | null): FlightAircraftSnapshotFields {
  return {
    logged_aircraft_type: info?.description ?? '',
    logged_category_class: info?.categoryClass ?? '',
    logged_complex: info?.complex ?? false,
    logged_high_performance: info?.highPerformance ?? false,
    logged_tailwheel: info?.tailwheel ?? false,
    logged_engine_type: info?.engineType ?? '',
  }
}

/**
 * The "live" half of `resolveAircraftType` (`@logbook/core`): builds the
 * currency/analysis/display-relevant `AircraftTypeInfo` straight off a model
 * row's *current* catalog data. `manufacturerName` defaults to `''` for
 * callers (currency.ts, check-flights.ts) that only need the structured
 * flags, not the description text. Returns `null` when the model's
 * `category_class` doesn't resolve to a known value — same fail-safe
 * convention as `getCurrencyData`/`getAnalysisData`.
 */
export function toAircraftTypeInfo(
  model: AircraftModelsResponse,
  manufacturerName = '',
): AircraftTypeInfo | null {
  if (!isCategoryClass(model.category_class)) return null
  // Widen to `string` first: PocketBase's typegen marks every select field
  // non-optional, which hides that an unset one actually comes back as `""`
  // at runtime (see aircraft.ts's toListItem()).
  const engineType: string = model.engine_type
  return {
    description: describeModel(manufacturerName, model.model, model.common_name),
    categoryClass: model.category_class,
    complex: model.complex,
    highPerformance: model.high_performance,
    tailwheel: model.tailwheel,
    engineType: isEngineType(engineType) ? engineType : '',
  }
}

function toItem(m: ModelWithManufacturer): AircraftModelItem {
  const manufacturerName = m.expand.manufacturer.name
  // PocketBase's typegen marks every field non-optional via `Required<>`,
  // which hides that an unset select field actually comes back as `""` at
  // runtime — widen to `string` first so that's a real possibility (see
  // pilots.ts's toProfile()).
  const engineType: string = m.engine_type
  const minimumAvionics: string = m.minimum_avionics
  return {
    id: m.id,
    manufacturerId: m.manufacturer,
    manufacturerName,
    model: m.model,
    commonName: m.common_name,
    categoryClass: m.category_class,
    complex: m.complex,
    highPerformance: m.high_performance,
    tailwheel: m.tailwheel,
    engineType,
    minimumAvionics,
    flaps: m.flaps,
    controllablePitchProp: m.controllable_pitch_prop,
    retractableGear: m.retractable_gear,
    icao: m.icao,
    typeDesignDesignator: m.type_design_designator,
    description: describeModel(manufacturerName, m.model, m.common_name),
  }
}

/**
 * Model search for the aircraft-form's autocomplete, matched across
 * manufacturer name, model code, and common name — `aircraft_models` is a
 * shared, ever-growing catalog covering both real aircraft and training
 * devices (a Redbird AATD is just another model made by "Redbird"), so
 * there's no separate table to search for sims.
 */
export const searchModels = createServerFn({ method: 'GET' })
  .validator((data: { query: string }) => data)
  .handler(async ({ data }): Promise<Array<AircraftModelItem>> => {
    const pb = createRequestPocketBase()
    const query = data.query.trim()
    if (!query) return []

    const models = await pb
      .collection('aircraft_models')
      .getList<ModelWithManufacturer>(1, 15, {
        filter: pb.filter(
          'model ~ {:query} || common_name ~ {:query} || manufacturer.name ~ {:query} || icao ~ {:query} || type_design_designator ~ {:query}',
          { query },
        ),
        expand: 'manufacturer',
        sort: 'model',
      })
    return models.items.map(toItem)
  })

export type FindOrCreateModelInput = {
  manufacturerName: string
  model: string
  commonName?: string
  categoryClass: string
  highPerformance?: boolean
  tailwheel?: boolean
  /** One of `ENGINE_TYPES`, or blank for an engineless model (glider,
   * training device). */
  engineType?: string
  /** One of `MINIMUM_AVIONICS` (glass panel / TAA classification), or blank
   * if unknown. */
  minimumAvionics?: string
  flaps?: boolean
  controllablePitchProp?: boolean
  retractableGear?: boolean
  /** ICAO aircraft type designator (Doc 8643) — the actual identity key
   * when known. Looked up first, across every manufacturer, before
   * manufacturer+model: a type certificate can outlive the company that
   * held it (Canadair -> Bombardier -> Mitsubishi for the CRJ program), so
   * two pilots' exports attributing the same airframe to different
   * manufacturers still resolve to one catalog row as long as both know
   * its ICAO code. */
  icao?: string
  /** FAA/Transport Canada Type Certificate Data Sheet model number (e.g.
   * "CL-600-2B19"), independent of `model` — see the migration adding
   * `type_design_designator` for why this isn't just folded into `model`. */
  typeDesignDesignator?: string
}

async function findModelByIcao(
  pb: ReturnType<typeof createRequestPocketBase>,
  icao: string,
): Promise<AircraftModelItem | null> {
  try {
    const existing = await pb
      .collection('aircraft_models')
      .getFirstListItem<ModelWithManufacturer>(pb.filter('icao = {:icao}', { icao }), {
        expand: 'manufacturer',
      })
    return toItem(existing)
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null
    throw err
  }
}

/**
 * Find-or-create a model under a find-or-created manufacturer, so typing a
 * manufacturer/model combination that doesn't exist yet grows the shared
 * catalog instead of failing. `(manufacturer, model)` has a case-insensitive
 * unique index — same conflict-recovery shape as
 * `findOrCreateManufacturer`. When an ICAO code is given, it's checked
 * first — see `FindOrCreateModelInput.icao` — and short-circuits the whole
 * manufacturer dance if a row with that code already exists.
 */
export const findOrCreateModel = createServerFn({ method: 'POST' })
  .validator((data: FindOrCreateModelInput) => data)
  .handler(async ({ data }): Promise<AircraftModelItem> => {
    const pb = createRequestPocketBase()

    const manufacturerName = data.manufacturerName.trim()
    const model = data.model.trim()
    if (!manufacturerName) throw new Error('Manufacturer is required')
    if (!model) throw new Error('Model is required')
    if (!isCategoryClass(data.categoryClass))
      throw new Error('Select a category/class')
    const engineType = data.engineType?.trim() ?? ''
    if (engineType && !isEngineType(engineType)) throw new Error('Select a valid engine type')
    const minimumAvionics = data.minimumAvionics?.trim() ?? ''
    if (minimumAvionics && !isMinimumAvionics(minimumAvionics))
      throw new Error('Select a valid avionics classification')
    const icao = data.icao?.trim().toUpperCase() ?? ''

    if (icao) {
      const existing = await findModelByIcao(pb, icao)
      if (existing) return existing
    }

    const manufacturer = await findOrCreateManufacturer(pb, manufacturerName)

    const flaps = data.flaps ?? false
    const controllablePitchProp = data.controllablePitchProp ?? false
    const retractableGear = data.retractableGear ?? false

    const fields = {
      manufacturer: manufacturer.id,
      model,
      common_name: data.commonName?.trim() ?? '',
      category_class: data.categoryClass,
      // `complex` isn't independently settable — see isComplexAircraft's
      // doc comment — so it's always derived from the equipment fields
      // rather than trusted from the caller, which also guarantees this
      // never trips the aircraft_models validation hook's consistency check.
      complex: isComplexAircraft({
        categoryClass: data.categoryClass,
        flaps,
        controllablePitchProp,
        retractableGear,
      }),
      high_performance: data.highPerformance ?? false,
      tailwheel: data.tailwheel ?? false,
      engine_type: engineType,
      minimum_avionics: minimumAvionics,
      flaps,
      controllable_pitch_prop: controllablePitchProp,
      retractable_gear: retractableGear,
      icao,
      type_design_designator: data.typeDesignDesignator?.trim() ?? '',
    }

    try {
      const created = await pb
        .collection('aircraft_models')
        .create<AircraftModelsResponse>(fields)
      return toItem({ ...created, expand: { manufacturer } })
    } catch (err) {
      if (!(err instanceof ClientResponseError) || err.status !== 400) throw err
    }

    // Lost a race on the (manufacturer, model) unique index — someone else
    // just created this exact row. An icao mismatch here would mean two
    // different callers disagree about this model's ICAO code; that's rare
    // enough (and not clearly resolvable automatically) to leave for a
    // human to reconcile rather than silently overwriting either value.
    const candidates = await pb
      .collection('aircraft_models')
      .getFullList<AircraftModelsResponse>({
        filter: pb.filter(
          'manufacturer = {:manufacturerId} && model ~ {:model}',
          {
            manufacturerId: manufacturer.id,
            model,
          },
        ),
      })
    const existing = candidates.find(
      (m) => m.model.toLowerCase() === model.toLowerCase(),
    )
    if (!existing) throw new Error(`Could not find or create model "${model}"`)
    return toItem({ ...existing, expand: { manufacturer } })
  })
