import { createServerFn } from '@tanstack/react-start'

import {
  anonymousTailNumberForModel,
  convertForeFlightCsv,
  findAircraftModelAlias,
  findConfidentModelMatch,
  isAircraftInstanceType,
  isForeFlightCsv,
  modelTextMatches,
  parseFlightsCsv,
} from '@logbook/core'

import type {
  AircraftInstanceType,
  AircraftModelAlias,
  AircraftModelsResponse,
  AircraftResponse,
  CsvRowValues,
  ManufacturersResponse,
  ModelMatchCandidate,
  PilotAircraftResponse,
} from '@logbook/core'

import {
  findOrCreateAircraftByTail,
  findOrCreatePilotAircraft,
  lookupAircraftByIds,
  snapshotFieldsForAircraft,
} from '#/lib/server/aircraft'
import { toFlightFields } from '#/lib/server/flights'
import { buildFlightAircraftSnapshotFields, describeModel } from '#/lib/server/models'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

import type { FlightAircraftSnapshotFields } from '#/lib/server/models'

type ModelWithManufacturer = AircraftModelsResponse<{ manufacturer: ManufacturersResponse }>
type AircraftWithModel = AircraftResponse<{ model: ModelWithManufacturer }>

/**
 * Groups CSV rows for aircraft resolution: a tailed row groups by its
 * (uppercased) tail number, an anonymous row (blank tail) groups by its
 * free-text model instead — "keyed by nothing" per the brief, since there's
 * no tail to key by and a synthesized placeholder tail would just be a
 * different flavor of guessing.
 */
function tailKeyFor(values: CsvRowValues): string {
  const tail = values.tailNumber.trim().toUpperCase()
  if (tail) return `tail:${tail}`
  return `anon:${values.model.trim().toLowerCase() || 'unknown'}`
}

// A distinct-tail lookup costs one PocketBase subrequest *per chunk*, not
// per tail — see `lookupAircraftByTails`. Cloudflare Workers' free tier caps
// a single request invocation at 50 outbound subrequests total, so the goal
// here is few, wide queries rather than many narrow ones. 120 tails/clause
// keeps the generated filter string comfortably short while still needing
// only a handful of chunks even for a many-thousand-tail file.
const AIRCRAFT_LOOKUP_CHUNK_SIZE = 120

/**
 * Resolves many tail numbers to their `aircraft` record in as few queries as
 * possible: one `getFullList` per chunk of tails, OR-chaining `tail_number =
 * {:tN}` clauses, instead of one `getFirstListItem` per tail. A file with
 * hundreds of distinct tails costs a handful of subrequests here, not
 * hundreds — see CLAUDE.md/the import brief's note on the Workers
 * subrequest ceiling.
 *
 * Exported for reuse by the aircraft-only importer (`aircraft-import.ts`),
 * which needs the exact same batched tail lookup for its own preview step.
 */
export async function lookupAircraftByTails(
  pb: ReturnType<typeof createRequestPocketBase>,
  tails: Iterable<string>,
): Promise<Map<string, AircraftWithModel>> {
  const distinctTails = [...new Set(tails)].filter(Boolean)
  const byTail = new Map<string, AircraftWithModel>()

  for (let i = 0; i < distinctTails.length; i += AIRCRAFT_LOOKUP_CHUNK_SIZE) {
    const chunk = distinctTails.slice(i, i + AIRCRAFT_LOOKUP_CHUNK_SIZE)
    const params: Record<string, string> = {}
    const clause = chunk
      .map((tail, idx) => {
        const key = `t${idx}`
        params[key] = tail
        return `tail_number = {:${key}}`
      })
      .join(' || ')

    const results = await pb.collection('aircraft').getFullList<AircraftWithModel>({
      filter: pb.filter(clause, params),
      expand: 'model.manufacturer',
    })
    for (const aircraft of results) {
      byTail.set(aircraft.tail_number.toUpperCase(), aircraft)
    }
  }

  return byTail
}

/**
 * Fetches the whole `aircraft_models` catalog once, reduced to what
 * `findConfidentModelMatch` needs — one wide query rather than one per
 * distinct unresolved model text (same "few, wide queries" reasoning as
 * `lookupAircraftByTails`), since the catalog is shared and bounded (a few
 * hundred rows) regardless of how many tails a single import needs to
 * resolve.
 *
 * Exported for reuse by the aircraft-only importer (`aircraft-import.ts`) —
 * same catalog, same classification need.
 */
export async function loadModelMatchCandidates(
  pb: ReturnType<typeof createRequestPocketBase>,
): Promise<Array<ModelMatchCandidate>> {
  const models = await pb
    .collection('aircraft_models')
    .getFullList<ModelWithManufacturer>({ expand: 'manufacturer' })
  return models.map((m) => ({
    id: m.id,
    manufacturerName: m.expand.manufacturer.name,
    model: m.model,
    commonName: m.common_name,
    icao: m.icao,
    typeDesignDesignator: m.type_design_designator,
  }))
}

/**
 * Whether a CSV row's free-text model description is close enough to a
 * resolved aircraft's actual model to not be worth flagging as a
 * `ModelMismatchWarning` — accepted against either the model's display
 * description (`describeModel`) or its type design designator (bare, or
 * manufacturer-prefixed, since ForeFlight's Aircraft Table concatenates
 * Make+Model into one free-text column — see `csv-foreflight.ts`). A model
 * with no `type_design_designator` on file just falls through to the plain
 * `describeModel` comparison. Shared by `previewImport` and
 * `aircraft-import.ts`'s `previewAircraftImport`, which both need this same
 * "worth a second look" decision for a tail already resolved to a known
 * aircraft.
 */
export function matchesResolvedModel(csvModel: string, model: ModelWithManufacturer): boolean {
  const manufacturerName = model.expand.manufacturer.name
  if (modelTextMatches(csvModel, describeModel(manufacturerName, model.model, model.common_name))) {
    return true
  }
  const tcds = model.type_design_designator
  if (!tcds) return false
  return (
    modelTextMatches(csvModel, tcds) || modelTextMatches(csvModel, `${manufacturerName} ${tcds}`)
  )
}

export type ImportRowPreview = {
  row: number
  values: CsvRowValues
  tailKey: string
}

/** A tail (or anonymous model group) with no automatic resolution — the
 * pilot must point it at a model (existing or new) before commit. */
export type UnresolvedTail = {
  tailKey: string
  tailNumber: string
  csvModel: string
  isAnonymous: boolean
  /** A pre-selected `AircraftInstanceType` guess, surfaced (not silently
   * applied) when the source format hints at what kind of device this is —
   * e.g. ForeFlight's `EquipmentType` column. The pilot can always change it;
   * this only sets the resolution UI's default. */
  suggestedInstanceType?: AircraftInstanceType
  /** A known translation of the CSV's free-text model into a real
   * manufacturer/model/common name, when that text is an opaque type-design
   * designator (e.g. "CL-600-2C10") rather than something a pilot would
   * recognize — see `findAircraftModelAlias`. Pre-fills the resolution UI's
   * "add a new model" form; the pilot can still change any of it. */
  suggestedModel?: AircraftModelAlias
}

/**
 * A tail (or anonymous model group) that wasn't already a known aircraft,
 * but whose CSV model text confidently and unambiguously matched an
 * existing `aircraft_models` catalog row (see `findConfidentModelMatch`) —
 * so it's queued to be created and added to the fleet automatically at
 * commit, the same as an `UnresolvedTail` the pilot resolved by hand.
 * Surfaced (not silently hidden) so the pilot can review or override the
 * match before importing; never a brand-new model, only an existing one.
 */
export type AutoResolvedTail = {
  tailKey: string
  tailNumber: string
  csvModel: string
  isAnonymous: boolean
  modelId: string
  modelDescription: string
  suggestedInstanceType?: AircraftInstanceType
}

/** Non-blocking: the tail already resolves to a known aircraft (and gets
 * silently added to the fleet at commit), but the CSV's free-text model
 * doesn't obviously match what that aircraft is actually registered as —
 * worth a pilot's second look, not worth stopping the import for, since the
 * aircraft record's model is the authority here (it's locked once created —
 * see aircraft-form.tsx) and the CSV text is just descriptive. */
export type ModelMismatchWarning = {
  tailNumber: string
  csvModel: string
  actualModel: string
}

export type ImportPreviewResult = {
  rows: Array<ImportRowPreview>
  rowErrors: Array<{ row: number; message: string }>
  unresolvedTails: Array<UnresolvedTail>
  autoResolvedTails: Array<AutoResolvedTail>
  modelMismatchWarnings: Array<ModelMismatchWarning>
}

/**
 * Parses the CSV and classifies every distinct tail number (see
 * CLAUDE.md/the brief's schema decision #3) without writing anything: rows
 * whose tail already resolves unambiguously are left to be committed
 * as-is, rows whose tail can't be resolved are surfaced for the pilot to
 * point at a model, and rows that failed row-level validation are reported
 * back as errors rather than silently dropped.
 */
export const previewImport = createServerFn({ method: 'POST' })
  .validator((data: { pilotId: string; csvText: string }) => data)
  .handler(async ({ data }): Promise<ImportPreviewResult> => {
    const pb = createRequestPocketBase()
    // ForeFlight's export is two tables in one file (an Aircraft Table and
    // a Flights Table) rather than our own single-table shape — reshape it
    // first so the rest of this pipeline never has to know the difference.
    // The conversion also surfaces a per-tail instance-type hint (from
    // ForeFlight's EquipmentType column) as a side channel, since instance
    // type is a per-aircraft property with no column of its own in the
    // native CSV shape.
    let csvText = data.csvText
    let instanceTypeHintByTail = new Map<string, AircraftInstanceType>()
    if (isForeFlightCsv(data.csvText)) {
      const converted = convertForeFlightCsv(data.csvText)
      csvText = converted.csvText
      instanceTypeHintByTail = converted.instanceTypeHintByTail
    }
    const { rows, errors } = parseFlightsCsv(csvText)

    const fleetJoins = await pb
      .collection('pilot_aircraft')
      .getFullList<PilotAircraftResponse<{ aircraft: AircraftResponse }>>({
        filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
        expand: 'aircraft',
      })
    const fleetTails = new Set(fleetJoins.map((j) => j.expand.aircraft.tail_number.toUpperCase()))

    const distinctTails = new Set<string>()
    for (const r of rows) {
      const tail = r.values.tailNumber.trim().toUpperCase()
      if (tail) distinctTails.add(tail)
    }

    const aircraftByTail = await lookupAircraftByTails(pb, distinctTails)
    const modelMatchCandidates = await loadModelMatchCandidates(pb)

    const unresolvedByKey = new Map<string, UnresolvedTail>()
    const autoResolvedByKey = new Map<string, AutoResolvedTail>()
    const modelMismatchWarnings: Array<ModelMismatchWarning> = []
    const rowPreviews: Array<ImportRowPreview> = []

    // Unmatched tail (or anonymous group) whose CSV model text confidently
    // resolves to exactly one existing catalog row is queued for automatic
    // creation instead of being pushed to the pilot for manual resolution —
    // see `AutoResolvedTail`. A tail with no confident match still falls
    // through to `unresolvedByKey`, same as before this existed.
    function classifyUnresolved(
      tailKey: string,
      tailNumber: string,
      csvModel: string,
      isAnonymous: boolean,
      suggestedInstanceType: AircraftInstanceType | undefined,
    ) {
      if (unresolvedByKey.has(tailKey) || autoResolvedByKey.has(tailKey)) return

      const match = findConfidentModelMatch(csvModel, modelMatchCandidates)
      if (match) {
        autoResolvedByKey.set(tailKey, {
          tailKey,
          tailNumber,
          csvModel,
          isAnonymous,
          modelId: match.id,
          modelDescription: describeModel(match.manufacturerName, match.model, match.commonName),
          suggestedInstanceType,
        })
        return
      }

      unresolvedByKey.set(tailKey, {
        tailKey,
        tailNumber,
        csvModel,
        isAnonymous,
        suggestedInstanceType,
        suggestedModel: findAircraftModelAlias(csvModel) ?? undefined,
      })
    }

    for (const r of rows) {
      const tailKey = tailKeyFor(r.values)
      const tail = r.values.tailNumber.trim().toUpperCase()

      if (tail) {
        const aircraft = aircraftByTail.get(tail)
        if (aircraft) {
          if (!fleetTails.has(tail)) {
            const model = aircraft.expand.model
            const manufacturer = model.expand.manufacturer
            const description = describeModel(manufacturer.name, model.model, model.common_name)
            if (!matchesResolvedModel(r.values.model, model)) {
              modelMismatchWarnings.push({
                tailNumber: tail,
                csvModel: r.values.model,
                actualModel: description,
              })
            }
          }
        } else {
          classifyUnresolved(
            tailKey,
            tail,
            r.values.model,
            false,
            instanceTypeHintByTail.get(tail),
          )
        }
      } else {
        classifyUnresolved(tailKey, '', r.values.model, true, undefined)
      }

      rowPreviews.push({ row: r.row, values: r.values, tailKey })
    }

    return {
      rows: rowPreviews,
      rowErrors: errors,
      unresolvedTails: [...unresolvedByKey.values()],
      autoResolvedTails: [...autoResolvedByKey.values()],
      modelMismatchWarnings,
    }
  })

export type ImportResolution = { modelId: string; instanceType?: string }

/** What `resolveImportAircraft` actually needs per row — just enough to
 * group rows by tail and look up/create the right `aircraft` record. Kept
 * narrower than `ImportRowPreview` (which carries a full flight row's
 * worth of fields) so a caller with no flight data at all — the
 * aircraft-only importer (`aircraft-import.ts`) — can reuse this function
 * without synthesizing fake flight fields just to satisfy the type. */
export type ResolveImportAircraftRow = { row: number; tailKey: string; tailNumber: string }

export type ResolveImportAircraftInput = {
  pilotId: string
  rows: Array<ResolveImportAircraftRow>
  /** Keyed by `ImportRowPreview.tailKey` — one entry per `UnresolvedTail`
   * the pilot resolved in the UI. Rows whose tail didn't need resolution
   * don't need an entry here, and a tail the client forgot to resolve is a
   * real possibility (not just a type-checker formality) since this is
   * client-supplied input — hence `| undefined` rather than assuming every
   * key is present. */
  resolutions: Record<string, ImportResolution | undefined>
}

export type ResolveImportAircraftResult = {
  /** `ImportRowPreview.tailKey` -> resolved `aircraft` record id, for every
   * tailKey that resolved to (or now has) a real aircraft. A tailKey missing
   * from this map either had no resolution provided, or failed to create —
   * see `tailKeyErrors`. */
  aircraftIdByTailKey: Record<string, string>
  tailKeyErrors: Record<string, string>
  aircraftCreated: number
  aircraftMatched: number
}

// PocketBase's batch endpoint caps the number of *operations* accepted per
// call (defaults to 50, independent of Cloudflare's 50-subrequest-per-
// invocation ceiling — the two limits are unrelated, they just share a
// number) — chunk write batches to stay under it.
const BATCH_OP_CHUNK_SIZE = 50

type PendingAircraftCreate = {
  tailKey: string
  tailNumber: string
  modelId: string
  instanceType: string
}

/**
 * Creates many new `aircraft` rows in a handful of `pb.createBatch()` calls
 * instead of one create per tail. A tail can still individually fail (e.g.
 * a genuine unique-index race with another pilot importing the same tail
 * concurrently) — those fall back to `findOrCreateAircraftByTail`'s
 * find-or-create, same as the old per-row path, just for the much smaller
 * set of items a batch call didn't cleanly create.
 */
async function createAircraftBatch(
  pb: ReturnType<typeof createRequestPocketBase>,
  candidates: Array<PendingAircraftCreate>,
): Promise<{ idByTailKey: Map<string, string>; errors: Map<string, string>; created: number }> {
  const idByTailKey = new Map<string, string>()
  const errors = new Map<string, string>()
  let created = 0

  for (let i = 0; i < candidates.length; i += BATCH_OP_CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + BATCH_OP_CHUNK_SIZE)
    let unresolved = chunk

    try {
      const batch = pb.createBatch()
      for (const c of chunk) {
        batch.collection('aircraft').create({
          tail_number: c.tailNumber,
          model: c.modelId,
          instance_type: c.instanceType,
        })
      }
      const results = await batch.send()

      unresolved = []
      results.forEach((result, idx) => {
        const c = chunk[idx]
        const body = result.body as { id?: string } | undefined
        if (result.status >= 200 && result.status < 300 && body?.id) {
          idByTailKey.set(c.tailKey, body.id)
          created++
        } else {
          unresolved.push(c)
        }
      })
    } catch {
      // Batch endpoint itself unavailable — fall back to find-or-create for
      // the whole chunk, same as `createFlightChunk`'s fallback.
      unresolved = chunk
    }

    for (const c of unresolved) {
      try {
        const aircraft = await findOrCreateAircraftByTail(pb, {
          tailNumber: c.tailNumber,
          modelId: c.modelId,
          instanceType: c.instanceType,
        })
        idByTailKey.set(c.tailKey, aircraft.id)
        created++
      } catch (err) {
        errors.set(c.tailKey, err instanceof Error ? err.message : 'Could not create this aircraft')
      }
    }
  }

  return { idByTailKey, errors, created }
}

type FleetMembershipOp =
  | { kind: 'create'; aircraftId: string }
  | { kind: 'undelete'; membershipId: string }

/**
 * Adds every given aircraft id to the pilot's fleet, batching the writes
 * instead of one `findOrCreatePilotAircraft` call per aircraft — these have
 * no create-order dependency on each other, so they're a good fit for
 * `pb.createBatch()`. Falls back to the individual find-or-create path
 * (which also handles the soft-deleted-membership case) for anything a
 * batch call didn't cleanly resolve.
 */
async function ensureFleetMemberships(
  pb: ReturnType<typeof createRequestPocketBase>,
  pilotId: string,
  aircraftIds: Iterable<string>,
): Promise<void> {
  const distinctIds = [...new Set(aircraftIds)]
  if (distinctIds.length === 0) return

  // Includes soft-deleted rows too, so a previously-removed-then-reimported
  // aircraft is un-deleted rather than blindly re-created (which would trip
  // the pilot/aircraft unique index).
  const existing = await pb.collection('pilot_aircraft').getFullList<PilotAircraftResponse>({
    filter: pb.filter('pilot = {:pilotId}', { pilotId }),
  })
  const membershipByAircraftId = new Map(existing.map((m) => [m.aircraft, m]))

  const ops: Array<FleetMembershipOp> = []
  for (const aircraftId of distinctIds) {
    const membership = membershipByAircraftId.get(aircraftId)
    if (!membership) ops.push({ kind: 'create', aircraftId })
    else if (membership.deleted) ops.push({ kind: 'undelete', membershipId: membership.id })
  }
  if (ops.length === 0) return

  for (let i = 0; i < ops.length; i += BATCH_OP_CHUNK_SIZE) {
    const chunk = ops.slice(i, i + BATCH_OP_CHUNK_SIZE)
    let unresolved = chunk

    try {
      const batch = pb.createBatch()
      for (const op of chunk) {
        if (op.kind === 'create') {
          batch.collection('pilot_aircraft').create({ pilot: pilotId, aircraft: op.aircraftId })
        } else {
          batch.collection('pilot_aircraft').update(op.membershipId, { deleted: false })
        }
      }
      const results = await batch.send()
      unresolved = chunk.filter((_, idx) => {
        const result = results[idx]
        return !(result.status >= 200 && result.status < 300)
      })
    } catch {
      unresolved = chunk
    }

    for (const op of unresolved) {
      if (op.kind === 'create') {
        await findOrCreatePilotAircraft(pb, pilotId, op.aircraftId)
      } else {
        await pb.collection('pilot_aircraft').update(op.membershipId, { deleted: false })
      }
    }
  }
}

/**
 * Resolves (creating where needed) every row's aircraft in as few
 * PocketBase subrequests as possible — the batched-lookup counterpart to
 * `previewImport`'s, but also creating genuinely-new aircraft and adding
 * everything to the pilot's fleet, both in batches rather than per tail.
 * Split out from flight creation (`commitImportFlights`) so a many-
 * thousand-row file's flight-batch chunking (bounded by PocketBase's own
 * batch size, not tail count) doesn't also have to redo this resolution
 * work on every chunk.
 */
export const resolveImportAircraft = createServerFn({ method: 'POST' })
  .validator((data: ResolveImportAircraftInput) => data)
  .handler(async ({ data }): Promise<ResolveImportAircraftResult> => {
    const pb = createRequestPocketBase()

    const distinctTails = new Set<string>()
    for (const row of data.rows) {
      const tail = row.tailNumber.trim().toUpperCase()
      if (tail) distinctTails.add(tail)
    }
    const aircraftByTail = await lookupAircraftByTails(pb, distinctTails)

    const aircraftIdByTailKey = new Map<string, string>()
    const toCreate = new Map<string, PendingAircraftCreate>()

    for (const row of data.rows) {
      const tailKey = row.tailKey
      if (aircraftIdByTailKey.has(tailKey) || toCreate.has(tailKey)) continue

      const tail = row.tailNumber.trim().toUpperCase()
      const existing = tail ? aircraftByTail.get(tail) : undefined
      if (existing) {
        aircraftIdByTailKey.set(tailKey, existing.id)
        continue
      }

      const resolution = data.resolutions[tailKey]
      if (!resolution) continue

      const instanceType =
        resolution.instanceType && isAircraftInstanceType(resolution.instanceType)
          ? resolution.instanceType
          : 'real'
      toCreate.set(tailKey, {
        tailKey,
        tailNumber: tail || anonymousTailNumberForModel(resolution.modelId),
        modelId: resolution.modelId,
        instanceType,
      })
    }

    const aircraftMatched = aircraftIdByTailKey.size

    let aircraftCreated = 0
    let tailKeyErrors = new Map<string, string>()
    if (toCreate.size > 0) {
      const result = await createAircraftBatch(pb, [...toCreate.values()])
      for (const [tailKey, id] of result.idByTailKey) aircraftIdByTailKey.set(tailKey, id)
      aircraftCreated = result.created
      tailKeyErrors = result.errors
    }

    await ensureFleetMemberships(pb, data.pilotId, aircraftIdByTailKey.values())

    return {
      aircraftIdByTailKey: Object.fromEntries(aircraftIdByTailKey),
      tailKeyErrors: Object.fromEntries(tailKeyErrors),
      aircraftCreated,
      aircraftMatched,
    }
  })

// PocketBase's batch endpoint caps the number of requests per batch
// (defaults to 50, see `BATCH_OP_CHUNK_SIZE` above) — chunk rather than
// sending everything in one call.
const FLIGHT_BATCH_SIZE = 50

type PendingFlight = {
  row: number
  fields: ReturnType<typeof toFlightFields> & FlightAircraftSnapshotFields
}

/**
 * Creates one chunk of flights via `pb.createBatch()` for atomicity across
 * the chunk (all-or-nothing per PocketBase transaction semantics isn't
 * guaranteed across chunks, only within one batch call) — see CLAUDE.md's
 * import brief on why batch is "worth considering, not required". Falls
 * back to sequential per-row creates if the batch endpoint itself is
 * unavailable (e.g. disabled server-side), so a PocketBase instance without
 * batch enabled still gets a working import, just without the atomicity.
 */
async function createFlightChunk(
  pb: ReturnType<typeof createRequestPocketBase>,
  pilotId: string,
  chunk: Array<PendingFlight>,
): Promise<{ created: number; failed: Array<{ row: number; reason: string }> }> {
  try {
    const batch = pb.createBatch()
    for (const item of chunk) {
      batch.collection('flights').create({ pilot: pilotId, ...item.fields })
    }
    const results = await batch.send()

    let created = 0
    const failed: Array<{ row: number; reason: string }> = []
    results.forEach((result, i) => {
      const row = chunk[i]?.row ?? -1
      if (result.status >= 200 && result.status < 300) {
        created++
      } else {
        const body = result.body as { message?: unknown } | undefined
        const message = typeof body?.message === 'string' ? body.message : `Failed (status ${result.status})`
        failed.push({ row, reason: message })
      }
    })
    return { created, failed }
  } catch {
    let created = 0
    const failed: Array<{ row: number; reason: string }> = []
    for (const item of chunk) {
      try {
        await pb.collection('flights').create({ pilot: pilotId, ...item.fields })
        created++
      } catch (err) {
        failed.push({ row: item.row, reason: err instanceof Error ? err.message : 'Could not create flight' })
      }
    }
    return { created, failed }
  }
}

export type CommitImportFlightsInput = {
  pilotId: string
  rows: Array<ImportRowPreview>
  /** From `resolveImportAircraft` — the client passes it through unchanged
   * on every chunked call rather than this function re-resolving aircraft
   * itself, so a many-thousand-row file's worth of flight-batch calls never
   * repeats the (already batched, but still non-trivial) resolution work. */
  aircraftIdByTailKey: Record<string, string>
  tailKeyErrors: Record<string, string>
}

export type CommitImportFlightsResult = {
  flightsImported: number
  skipped: Array<{ row: number; reason: string }>
}

/**
 * Creates flights for a chunk of previously-resolved rows. Called once per
 * chunk by the client for a large file — see CLAUDE.md/the import brief:
 * PocketBase's batch endpoint caps operations per call, so a big enough
 * file needs enough `createFlightChunk` calls that a single Cloudflare
 * Workers invocation can't make them all and stay under the free tier's
 * 50-subrequest ceiling. Chunking at the *call* level (client decides how
 * many rows per `commitImportFlights` invocation) rather than only at the
 * `createFlightChunk` level keeps each invocation's own subrequest count
 * bounded regardless of total file size.
 */
export const commitImportFlights = createServerFn({ method: 'POST' })
  .validator((data: CommitImportFlightsInput) => data)
  .handler(async ({ data }): Promise<CommitImportFlightsResult> => {
    const pb = createRequestPocketBase()

    // Snapshots each imported flight's aircraft type at commit time (issue
    // #71), same as createFlight/updateFlight — one batched lookup per
    // chunk rather than per row, same "few, wide queries" reasoning as
    // `lookupAircraftByTails`.
    const aircraftById = await lookupAircraftByIds(pb, Object.values(data.aircraftIdByTailKey))

    const skipped: Array<{ row: number; reason: string }> = []
    const pending: Array<PendingFlight> = []

    for (const row of data.rows) {
      const aircraftId = data.aircraftIdByTailKey[row.tailKey]
      if (!aircraftId) {
        skipped.push({
          row: row.row,
          reason: data.tailKeyErrors[row.tailKey] ?? 'No aircraft resolution provided',
        })
        continue
      }
      const aircraft = aircraftById.get(aircraftId)
      const snapshot = aircraft
        ? snapshotFieldsForAircraft(aircraft)
        : buildFlightAircraftSnapshotFields(null)
      pending.push({ row: row.row, fields: { ...toFlightFields(aircraftId, row.values), ...snapshot } })
    }

    let flightsImported = 0
    for (let i = 0; i < pending.length; i += FLIGHT_BATCH_SIZE) {
      const chunk = pending.slice(i, i + FLIGHT_BATCH_SIZE)
      const result = await createFlightChunk(pb, data.pilotId, chunk)
      flightsImported += result.created
      skipped.push(...result.failed)
    }

    return { flightsImported, skipped }
  })
