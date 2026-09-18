import { createServerFn } from '@tanstack/react-start'

import type { Coordinates, TypedPocketBase } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

/**
 * How many idents' worth of `(ident = … || icao = … || iata = …)` clauses go
 * into one request's filter string. A pilot with a few hundred distinct
 * airports across their logbook would otherwise build a single filter tens
 * of thousands of characters long — comfortably past the URL length limit
 * PocketBase (and anything proxying in front of it) enforces on a GET
 * request. Batching keeps each request's filter small regardless of how
 * many distinct airports the logbook as a whole touches.
 */
const IDENT_BATCH_SIZE = 20

async function fetchAirportBatch(
  pb: TypedPocketBase,
  idents: ReadonlyArray<string>,
): Promise<Partial<Record<string, Coordinates>>> {
  const params: Record<string, string> = {}
  const clauses = idents.map((ident, i) => {
    const key = `v${i}`
    params[key] = ident
    return `(ident = {:${key}} || icao = {:${key}} || iata = {:${key}})`
  })

  const records = await pb.collection('airports').getFullList({
    filter: pb.filter(clauses.join(' || '), params),
    fields: 'ident,icao,iata,lat,lon',
  })

  const byIdent: Partial<Record<string, Coordinates>> = {}
  for (const record of records) {
    const coordinates: Coordinates = { lat: record.lat, lon: record.lon }
    for (const key of [record.ident, record.icao, record.iata]) {
      if (key) byIdent[key.toUpperCase()] = coordinates
    }
  }
  return byIdent
}

/**
 * Resolves a set of route idents (however a pilot or CSV export spelled
 * them — ICAO "KPAO", FAA local "PAO", IATA "SFO") to coordinates from the
 * `airports` collection. Matches on `ident`, `icao`, or `iata` so any of the
 * three spellings hits, and returns a map keyed by every spelling each
 * matched record carries — the caller looks up whatever ident it parsed out
 * of the route without needing to know which column it was.
 *
 * An unresolvable ident (unknown, private strip not in the OurAirports
 * dataset, typo) is simply missing from the result rather than an error —
 * `checkCrossCountryDistance` in `flight-checker.ts` already treats a
 * partially-resolved route as "run on what's known", not a reason to skip
 * the flight entirely.
 */
export const getAirportsByIdents = createServerFn({ method: 'GET' })
  .validator((data: { idents: Array<string> }) => data)
  .handler(async ({ data }): Promise<Partial<Record<string, Coordinates>>> => {
    const uniqueIdents = [...new Set(data.idents.map((ident) => ident.trim().toUpperCase()).filter(Boolean))]
    if (uniqueIdents.length === 0) return {}

    const pb = createRequestPocketBase()
    const batches: Array<Array<string>> = []
    for (let i = 0; i < uniqueIdents.length; i += IDENT_BATCH_SIZE) {
      batches.push(uniqueIdents.slice(i, i + IDENT_BATCH_SIZE))
    }

    const results = await Promise.all(batches.map((batch) => fetchAirportBatch(pb, batch)))

    const merged: Partial<Record<string, Coordinates>> = {}
    for (const result of results) {
      Object.assign(merged, result)
    }
    return merged
  })
