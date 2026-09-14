import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { modelTextMatches, parseFlightsCsv } from '@logbook/core'

import type {
  AircraftModelsResponse,
  AircraftResponse,
  CsvRowValues,
  ManufacturersResponse,
  PilotAircraftResponse,
} from '@logbook/core'

import { createAircraft, findOrCreatePilotAircraft } from '#/lib/server/aircraft'
import { toFlightFields } from '#/lib/server/flights'
import { describeModel } from '#/lib/server/models'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

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

async function lookupAircraftByTail(
  pb: ReturnType<typeof createRequestPocketBase>,
  tail: string,
): Promise<AircraftWithModel | null> {
  try {
    return await pb.collection('aircraft').getFirstListItem<AircraftWithModel>(
      pb.filter('tail_number = {:tail}', { tail }),
      { expand: 'model.manufacturer' },
    )
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null
    throw err
  }
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
    const { rows, errors } = parseFlightsCsv(data.csvText)

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

    const aircraftByTail = new Map<string, AircraftWithModel | null>()
    await Promise.all(
      [...distinctTails].map(async (tail) => {
        aircraftByTail.set(tail, await lookupAircraftByTail(pb, tail))
      }),
    )

    const unresolvedByKey = new Map<string, UnresolvedTail>()
    const modelMismatchWarnings: Array<ModelMismatchWarning> = []
    const rowPreviews: Array<ImportRowPreview> = []

    for (const r of rows) {
      const tailKey = tailKeyFor(r.values)
      const tail = r.values.tailNumber.trim().toUpperCase()

      if (tail) {
        const aircraft = aircraftByTail.get(tail) ?? null
        if (aircraft) {
          if (!fleetTails.has(tail)) {
            const model = aircraft.expand.model
            const manufacturer = model.expand.manufacturer
            const description = describeModel(manufacturer.name, model.model, model.common_name)
            if (!modelTextMatches(r.values.model, description)) {
              modelMismatchWarnings.push({
                tailNumber: tail,
                csvModel: r.values.model,
                actualModel: description,
              })
            }
          }
        } else if (!unresolvedByKey.has(tailKey)) {
          unresolvedByKey.set(tailKey, {
            tailKey,
            tailNumber: tail,
            csvModel: r.values.model,
            isAnonymous: false,
          })
        }
      } else if (!unresolvedByKey.has(tailKey)) {
        unresolvedByKey.set(tailKey, {
          tailKey,
          tailNumber: '',
          csvModel: r.values.model,
          isAnonymous: true,
        })
      }

      rowPreviews.push({ row: r.row, values: r.values, tailKey })
    }

    return {
      rows: rowPreviews,
      rowErrors: errors,
      unresolvedTails: [...unresolvedByKey.values()],
      modelMismatchWarnings,
    }
  })

export type ImportResolution = { modelId: string; instanceType?: string }

export type CommitImportInput = {
  pilotId: string
  rows: Array<ImportRowPreview>
  /** Keyed by `ImportRowPreview.tailKey` — one entry per `UnresolvedTail`
   * the pilot resolved in the UI. Rows whose tail didn't need resolution
   * don't need an entry here, and a tail the client forgot to resolve is a
   * real possibility (not just a type-checker formality) since this is
   * client-supplied input — hence `| undefined` rather than assuming every
   * key is present. */
  resolutions: Record<string, ImportResolution | undefined>
}

export type CommitImportResult = {
  flightsImported: number
  aircraftCreated: number
  aircraftMatched: number
  skipped: Array<{ row: number; reason: string }>
}

type AircraftResolutionCounts = { created: number; matched: number }

/**
 * Resolves (or creates) the aircraft for one row, caching by `tailKey` so a
 * tail repeated across many rows only does the lookup/create once. Reuses
 * `createAircraft`'s own find-or-create-by-tail logic for a genuinely new
 * tail rather than duplicating it — this only adds the "tail already exists,
 * just add it to the fleet" short-circuit `createAircraft` doesn't need
 * (its caller already knows which case it's in; the importer doesn't until
 * it looks the tail up).
 */
async function resolveAircraftId(
  pb: ReturnType<typeof createRequestPocketBase>,
  pilotId: string,
  row: ImportRowPreview,
  resolutions: Record<string, ImportResolution | undefined>,
  cache: Map<string, string>,
  counts: AircraftResolutionCounts,
): Promise<string | null> {
  const cached = cache.get(row.tailKey)
  if (cached) return cached

  const tail = row.values.tailNumber.trim().toUpperCase()
  if (tail) {
    const existing = await lookupAircraftByTail(pb, tail)
    if (existing) {
      await findOrCreatePilotAircraft(pb, pilotId, existing.id)
      cache.set(row.tailKey, existing.id)
      counts.matched++
      return existing.id
    }
  }

  const resolution = resolutions[row.tailKey]
  if (!resolution) return null

  const aircraft = await createAircraft({
    data: {
      pilotId,
      modelId: resolution.modelId,
      instanceType: resolution.instanceType ?? 'real',
      isAnonymous: !tail,
      tailNumber: tail || undefined,
    },
  })
  cache.set(row.tailKey, aircraft.id)
  counts.created++
  return aircraft.id
}

// PocketBase's batch endpoint caps the number of requests per batch
// (defaults to 50) — chunk rather than sending everything in one call.
const FLIGHT_BATCH_SIZE = 50

type PendingFlight = { row: number; fields: ReturnType<typeof toFlightFields> }

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

/**
 * Commits a previously-previewed import: resolves/creates every row's
 * aircraft (creating new `aircraft`/`aircraft_models`/`manufacturers`/
 * `pilot_aircraft` rows exactly the way the aircraft-form already does),
 * then creates the flights. A row whose tail has no resolution entry and
 * doesn't already exist is skipped with a reason rather than guessed at or
 * left to throw and abort the whole import — same for a flight create that
 * fails for its own reasons (e.g. a rule rejection).
 */
export const commitImport = createServerFn({ method: 'POST' })
  .validator((data: CommitImportInput) => data)
  .handler(async ({ data }): Promise<CommitImportResult> => {
    const pb = createRequestPocketBase()

    const aircraftCache = new Map<string, string>()
    const counts: AircraftResolutionCounts = { created: 0, matched: 0 }
    const skipped: Array<{ row: number; reason: string }> = []
    const pending: Array<PendingFlight> = []

    for (const row of data.rows) {
      let aircraftId: string | null
      try {
        aircraftId = await resolveAircraftId(
          pb,
          data.pilotId,
          row,
          data.resolutions,
          aircraftCache,
          counts,
        )
      } catch (err) {
        skipped.push({
          row: row.row,
          reason: err instanceof Error ? err.message : 'Could not resolve aircraft',
        })
        continue
      }

      if (!aircraftId) {
        skipped.push({ row: row.row, reason: 'No aircraft resolution provided' })
        continue
      }

      pending.push({ row: row.row, fields: toFlightFields(aircraftId, row.values) })
    }

    let flightsImported = 0
    for (let i = 0; i < pending.length; i += FLIGHT_BATCH_SIZE) {
      const chunk = pending.slice(i, i + FLIGHT_BATCH_SIZE)
      const result = await createFlightChunk(pb, data.pilotId, chunk)
      flightsImported += result.created
      skipped.push(...result.failed)
    }

    return {
      flightsImported,
      aircraftCreated: counts.created,
      aircraftMatched: counts.matched,
      skipped,
    }
  })
