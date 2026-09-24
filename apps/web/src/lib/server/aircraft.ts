import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import {
  anonymousTailNumberForModel,
  displayTailNumber,
  isAircraftInstanceType,
  isAnonymousTail,
} from '@logbook/core'

import type {
  AircraftModelsResponse,
  AircraftResponse,
  AircraftTypeInfo,
  FlightsResponse,
  ManufacturersResponse,
  PilotAircraftResponse,
} from '@logbook/core'

import { buildFlightAircraftSnapshotFields, describeModel, toAircraftTypeInfo } from '#/lib/server/models'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

import type { FlightAircraftSnapshotFields } from '#/lib/server/models'

export type AircraftListItem = {
  id: string
  pilotAircraftId: string
  tailNumber: string
  displayTailNumber: string
  isAnonymous: boolean
  modelId: string
  manufacturerName: string
  model: string
  type: string
  categoryClass: string
  complex: boolean
  highPerformance: boolean
  tailwheel: boolean
  instanceType: string
  /** How many of the pilot's flights used this aircraft — 0 until `getAircraft` fills it in from `flights`. */
  flightCount: number
  /** Most recent flight date logged on this aircraft, or null if it's never been flown. */
  lastFlownDate: string | null
  /**
   * Set when at least one of the pilot's flights on this aircraft has a
   * frozen `logged_*` snapshot that disagrees with the model's current live
   * data (issue #71) — what the fleet page's "sync to current
   * classification" action offers to fix. `null` when everything agrees.
   */
  classificationDrift: AircraftClassificationDrift | null
}

export type AircraftClassificationDrift = {
  /** How many of the pilot's flights on this aircraft would change on sync. */
  flightCount: number
  /** Each distinct "as logged" type among those flights, most flights first. */
  from: Array<{ type: AircraftTypeInfo; flightCount: number }>
  /** The aircraft's current live type — what a sync writes onto every drifted flight. */
  to: AircraftTypeInfo
}

/** The flights a pilot has logged on one aircraft — same set `getAircraft`'s `flightCount` counts. */
function pilotAircraftFlightsFilter(pb: ReturnType<typeof createRequestPocketBase>, pilotId: string): string {
  return pb.filter('pilot = {:pilotId} && deleted != true && is_starting_totals != true', { pilotId })
}

/**
 * Wire shape of `pocketbase/base/api/aircraft_drift.go`'s response: one
 * entry per aircraft in the pilot's fleet that has at least one drifted
 * flight (an aircraft with none is simply absent from the map, mirroring
 * `AircraftListItem.classificationDrift`'s `null`). `flightIds` isn't part
 * of the public `AircraftClassificationDrift` display type — it's what
 * `syncAircraftToCurrentClassification` re-snapshots.
 */
type AircraftClassificationDriftDTO = AircraftClassificationDrift & { flightIds: Array<string> }

/**
 * Per-aircraft classification drift for the pilot's whole fleet, computed
 * server-side by the Go `currency` package (issue #93 consolidated what used
 * to be a hand-mirrored TS copy of this comparison onto a single
 * implementation, shared with the aircraft-reclassification notification
 * hook) — the same pattern the Currency page's `getCurrencyData` already
 * uses. Fetched for the whole fleet in one request so `getAircraft` doesn't
 * pay a round trip per aircraft, and reused as-is by
 * `syncAircraftToCurrentClassification` for its one aircraft's `flightIds`.
 */
async function fetchClassificationDrift(
  pb: ReturnType<typeof createRequestPocketBase>,
): Promise<Record<string, AircraftClassificationDriftDTO | undefined>> {
  return pb.send<Record<string, AircraftClassificationDriftDTO | undefined>>('/api/aircraft/drift', {
    method: 'GET',
  })
}

type ModelWithManufacturer = AircraftModelsResponse<{ manufacturer: ManufacturersResponse }>
/** Exported for reuse by flights.ts/import.ts, which need the same shape to resolve a flight's aircraft snapshot at save time — see `snapshotFieldsForAircraft`. */
export type AircraftWithModel = AircraftResponse<{ model: ModelWithManufacturer }>
type PilotAircraftWithAircraft = PilotAircraftResponse<{ aircraft: AircraftWithModel }>

function toListItem(pa: PilotAircraftWithAircraft): AircraftListItem {
  const aircraft = pa.expand.aircraft
  const model = aircraft.expand.model
  const manufacturer = model.expand.manufacturer
  const type = describeModel(manufacturer.name, model.model, model.common_name)
  // Widen to `string` first: PocketBase's typegen marks every select field
  // non-optional via `Required<>`, which hides that an unset one actually
  // comes back as `""` at runtime (see pilots.ts's toProfile()).
  const instanceType: string = aircraft.instance_type
  return {
    id: aircraft.id,
    pilotAircraftId: pa.id,
    tailNumber: aircraft.tail_number,
    displayTailNumber: displayTailNumber(aircraft.tail_number, type),
    isAnonymous: isAnonymousTail(aircraft.tail_number),
    modelId: model.id,
    manufacturerName: manufacturer.name,
    model: model.model,
    type,
    categoryClass: model.category_class,
    complex: model.complex,
    highPerformance: model.high_performance,
    tailwheel: model.tailwheel,
    instanceType: instanceType || 'real',
    flightCount: 0,
    lastFlownDate: null,
    classificationDrift: null,
  }
}

/**
 * The pilot's fleet: `pilot_aircraft` join rows (not a filter on the now-
 * shared `aircraft` collection — see CLAUDE.md) expanded out to the
 * aircraft/model/manufacturer each row points at, with each item's
 * `flightCount`/`lastFlownDate` filled in from the pilot's flight history so
 * callers (the log-flight form's "recent aircraft" badges) can rank the
 * fleet by how often/recently it's actually flown instead of just listing
 * every aircraft the pilot has ever logged.
 *
 * Deliberately reads the live `aircraft.model` expand rather than any
 * flight's frozen `logged_*` snapshot (issue #71): this list represents
 * "what's currently in my fleet", not a specific past flight, so if a
 * shared model is corrected, a pilot picking a tail for a new flight should
 * see (and log against) its current classification. The frozen type still
 * protects every already-logged flight via `resolveAircraftType` — only
 * this fleet-membership view stays live. Each item's `classificationDrift`
 * is what bridges the two: it flags when any of the pilot's flights on that
 * tail were logged under different data than the live model now says (see
 * `syncAircraftToCurrentClassification`).
 */
export const getAircraft = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<Array<AircraftListItem>> => {
    const pb = createRequestPocketBase()
    const [joins, flights, drift] = await Promise.all([
      pb.collection('pilot_aircraft').getFullList<PilotAircraftWithAircraft>({
        filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
        expand: 'aircraft.model.manufacturer',
      }),
      pb.collection('flights').getFullList<FlightsResponse>({
        filter: pilotAircraftFlightsFilter(pb, data.pilotId),
        fields: 'aircraft,date',
      }),
      fetchClassificationDrift(pb),
    ])

    const stats = new Map<string, { flightCount: number; lastFlownDate: string | null }>()
    for (const f of flights) {
      const entry = stats.get(f.aircraft) ?? { flightCount: 0, lastFlownDate: null }
      entry.flightCount += 1
      if (!entry.lastFlownDate || f.date > entry.lastFlownDate) entry.lastFlownDate = f.date
      stats.set(f.aircraft, entry)
    }

    return joins.map((join) => {
      const item = toListItem(join)
      const entry = stats.get(item.id)
      return { ...item, ...entry, classificationDrift: drift[item.id] ?? null }
    })
  })

/**
 * Exported for reuse by the CSV importer (`import.ts`), which resolves many
 * tails at commit time and needs the same find-or-create-by-tail fallback
 * for whichever ones turn out to be genuinely new.
 */
export async function findOrCreateAircraftByTail(
  pb: ReturnType<typeof createRequestPocketBase>,
  fields: { tailNumber: string; modelId: string; instanceType: string },
): Promise<AircraftWithModel> {
  try {
    return await pb.collection('aircraft').create<AircraftWithModel>(
      {
        tail_number: fields.tailNumber,
        model: fields.modelId,
        instance_type: fields.instanceType,
      },
      { expand: 'model.manufacturer' },
    )
  } catch (err) {
    if (!(err instanceof ClientResponseError) || err.status !== 400) throw err
  }

  // Another pilot already registered this tail — `tail_number` is
  // unique-indexed, so the row the create attempt collided with is the one
  // every pilot logging this tail shares.
  return await pb.collection('aircraft').getFirstListItem<AircraftWithModel>(
    pb.filter('tail_number = {:tailNumber}', { tailNumber: fields.tailNumber }),
    { expand: 'model.manufacturer' },
  )
}

/**
 * Fetches one aircraft with its model/manufacturer expanded — what
 * `createFlight`/`updateFlight` (flights.ts) need to compute a flight's
 * `logged_*` snapshot fields (issue #71) at save time.
 */
export async function getAircraftWithModel(
  pb: ReturnType<typeof createRequestPocketBase>,
  aircraftId: string,
): Promise<AircraftWithModel> {
  return await pb
    .collection('aircraft')
    .getOne<AircraftWithModel>(aircraftId, { expand: 'model.manufacturer' })
}

/**
 * Resolves many aircraft ids to their record with model/manufacturer
 * expanded, in as few queries as possible — the id-keyed counterpart to
 * `import.ts`'s `lookupAircraftByTails`, for `commitImportFlights`'s
 * per-chunk snapshot computation (it only carries already-resolved
 * aircraft ids, not the expanded records `resolveImportAircraft` saw).
 */
export async function lookupAircraftByIds(
  pb: ReturnType<typeof createRequestPocketBase>,
  ids: Iterable<string>,
): Promise<Map<string, AircraftWithModel>> {
  const distinctIds = [...new Set(ids)].filter(Boolean)
  const byId = new Map<string, AircraftWithModel>()

  const CHUNK_SIZE = 120
  for (let i = 0; i < distinctIds.length; i += CHUNK_SIZE) {
    const chunk = distinctIds.slice(i, i + CHUNK_SIZE)
    const params: Record<string, string> = {}
    const clause = chunk
      .map((id, idx) => {
        const key = `a${idx}`
        params[key] = id
        return `id = {:${key}}`
      })
      .join(' || ')

    const results = await pb.collection('aircraft').getFullList<AircraftWithModel>({
      filter: pb.filter(clause, params),
      expand: 'model.manufacturer',
    })
    for (const aircraft of results) byId.set(aircraft.id, aircraft)
  }

  return byId
}

/**
 * Builds a flight's `logged_*` snapshot fields (issue #71) from an already-
 * expanded aircraft — the write-side counterpart to `resolveAircraftType`
 * (`@logbook/core`), shared by `createFlight`/`updateFlight` and the CSV
 * importer's `commitImportFlights`.
 */
export function snapshotFieldsForAircraft(aircraft: AircraftWithModel): FlightAircraftSnapshotFields {
  const model = aircraft.expand.model
  const manufacturer = model.expand.manufacturer
  return buildFlightAircraftSnapshotFields(toAircraftTypeInfo(model, manufacturer.name))
}

/**
 * Exported for reuse by the CSV importer (`import.ts`), which needs to add
 * an already-resolved aircraft to the pilot's fleet without going through
 * `createAircraft`'s model-resolution path.
 */
export async function findOrCreatePilotAircraft(
  pb: ReturnType<typeof createRequestPocketBase>,
  pilotId: string,
  aircraftId: string,
): Promise<PilotAircraftResponse> {
  try {
    return await pb.collection('pilot_aircraft').create<PilotAircraftResponse>({
      pilot: pilotId,
      aircraft: aircraftId,
    })
  } catch (err) {
    if (!(err instanceof ClientResponseError) || err.status !== 400) throw err
  }

  // Already in the fleet — possibly soft-deleted (removed, then re-added).
  const existing = await pb
    .collection('pilot_aircraft')
    .getFirstListItem<PilotAircraftResponse>(
      pb.filter('pilot = {:pilotId} && aircraft = {:aircraftId}', { pilotId, aircraftId }),
    )
  if (!existing.deleted) return existing
  return await pb
    .collection('pilot_aircraft')
    .update<PilotAircraftResponse>(existing.id, { deleted: false })
}

export type CreateAircraftInput = {
  pilotId: string
  modelId: string
  instanceType: string
  isAnonymous: boolean
  tailNumber?: string
}

/**
 * Find-or-create the shared `aircraft` row by tail number, then add it to
 * the pilot's fleet — never a blind create, since two pilots logging the
 * same tail must end up pointing at the same row (mirrors MyFlightbook).
 * An anonymous aircraft (no tail number) uses a tail synthesized from the
 * model id, so every pilot logging "an anonymous" of that model shares the
 * same row too.
 */
export const createAircraft = createServerFn({ method: 'POST' })
  .validator((data: CreateAircraftInput) => data)
  .handler(async ({ data }): Promise<AircraftListItem> => {
    const pb = createRequestPocketBase()
    if (!isAircraftInstanceType(data.instanceType)) throw new Error('Select an instance type')

    const tailNumber = data.isAnonymous
      ? anonymousTailNumberForModel(data.modelId)
      : data.tailNumber?.trim().toUpperCase()
    if (!tailNumber) throw new Error('Tail number is required')

    const aircraft = await findOrCreateAircraftByTail(pb, {
      tailNumber,
      modelId: data.modelId,
      instanceType: data.instanceType,
    })
    const pilotAircraft = await findOrCreatePilotAircraft(pb, data.pilotId, aircraft.id)

    return toListItem({ ...pilotAircraft, expand: { aircraft } })
  })

/**
 * Removes the aircraft from the pilot's fleet by soft-deleting their
 * `pilot_aircraft` row — never the shared `aircraft`/`aircraft_models` rows,
 * since other pilots may still reference them. `pilot_aircraft`'s own rules
 * (`pilot.user = @request.auth.id`) are the actual authority on ownership,
 * same as `deleteFlight`'s note about `updateRule`.
 */
export const removeAircraftFromFleet = createServerFn({ method: 'POST' })
  .validator((data: { pilotAircraftId: string }) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()
    await pb.collection('pilot_aircraft').update(data.pilotAircraftId, { deleted: true })
    return { id: data.pilotAircraftId }
  })

// PocketBase's batch endpoint caps operations per call (default 50) — same
// limit `import.ts` chunks its batched writes to.
const SYNC_BATCH_CHUNK_SIZE = 50

/**
 * Writes the same snapshot fields onto every flight in `ids`, batched via
 * `pb.createBatch()` — the update-side counterpart to `import.ts`'s
 * `createFlightChunk`, with the same per-flight sequential fallback if the
 * batch endpoint is unavailable (disabled in settings, or the call itself
 * fails).
 */
async function updateFlightSnapshotChunk(
  pb: ReturnType<typeof createRequestPocketBase>,
  ids: Array<string>,
  fields: FlightAircraftSnapshotFields,
): Promise<{ updated: number; failed: number }> {
  try {
    const batch = pb.createBatch()
    for (const id of ids) batch.collection('flights').update(id, fields)
    const results = await batch.send()
    const updated = results.filter((r) => r.status >= 200 && r.status < 300).length
    return { updated, failed: ids.length - updated }
  } catch {
    let updated = 0
    let failed = 0
    for (const id of ids) {
      try {
        await pb.collection('flights').update(id, fields)
        updated++
      } catch {
        failed++
      }
    }
    return { updated, failed }
  }
}

export type SyncAircraftClassificationResult = {
  updated: number
  failed: number
  /** The live type every updated flight now carries. */
  to: AircraftTypeInfo
}

/**
 * The pilot-initiated half of issue #71 ("they can change it in their
 * records if they wish to match the new data"): re-snapshots every one of
 * the pilot's flights on this aircraft whose frozen `logged_*` fields have
 * drifted from the model's *current* live data, using the same
 * `snapshotFieldsForAircraft` write `createFlight`/`updateFlight` do on save.
 *
 * This deliberately changes how those past flights count toward part 61
 * currency/analysis/check-flights (all of which read the snapshot through
 * `resolveAircraftType`) — the fleet page's confirm step spells that out
 * before calling this. Flights already in sync aren't touched, so their
 * `updated` timestamps don't churn. `flights`' own rules remain the
 * authority on ownership, same as `deleteFlight`.
 */
export const syncAircraftToCurrentClassification = createServerFn({ method: 'POST' })
  .validator((data: { pilotId: string; aircraftId: string }) => data)
  .handler(async ({ data }): Promise<SyncAircraftClassificationResult> => {
    const pb = createRequestPocketBase()
    const aircraft = await getAircraftWithModel(pb, data.aircraftId)
    const model = aircraft.expand.model
    const live = toAircraftTypeInfo(model, model.expand.manufacturer.name)
    if (!live) throw new Error("This aircraft's model has no recognized category/class to sync to")

    const drift = await fetchClassificationDrift(pb)
    const driftedIds = drift[data.aircraftId]?.flightIds ?? []
    const fields = snapshotFieldsForAircraft(aircraft)

    let updated = 0
    let failed = 0
    for (let i = 0; i < driftedIds.length; i += SYNC_BATCH_CHUNK_SIZE) {
      const result = await updateFlightSnapshotChunk(pb, driftedIds.slice(i, i + SYNC_BATCH_CHUNK_SIZE), fields)
      updated += result.updated
      failed += result.failed
    }
    return { updated, failed, to: live }
  })
