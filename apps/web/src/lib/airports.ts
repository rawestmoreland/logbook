import type { Coordinates } from '@logbook/core'

import { pb } from '#/lib/pocketbase'

/**
 * How many idents' worth of `(ident = … || icao = … || iata = …)` clauses go
 * into one request's filter string. A pilot with a few hundred distinct
 * airports across their logbook would otherwise build a single filter tens
 * of thousands of characters long — comfortably past the URL length limit
 * PocketBase enforces on a GET request. Batching keeps each request's
 * filter small regardless of how many distinct airports the logbook as a
 * whole touches.
 */
const IDENT_BATCH_SIZE = 20

async function fetchAirportBatch(
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
    requestKey: null,
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
 * Called straight from the browser's PocketBase client rather than through
 * a server function: `airports` has no auth requirement (public `listRule`),
 * and this only ever runs after the page is already interactive (see
 * check-flights.tsx, which resolves it in a `useEffect` rather than the
 * route's SSR loader) — going through our own server would add a hop for
 * no benefit, and would run this on the server during the initial page
 * load, which is why it wasn't done that way even before this moved off
 * the server function.
 *
 * An unresolvable ident (unknown, private strip not in the OurAirports
 * dataset, typo) is simply missing from the result rather than an error —
 * `checkCrossCountryDistance` in `flight-checker.ts` already treats a
 * partially-resolved route as "run on what's known", not a reason to skip
 * the flight entirely.
 */
export async function getAirportsByIdents(
  idents: ReadonlyArray<string>,
): Promise<Partial<Record<string, Coordinates>>> {
  const uniqueIdents = [
    ...new Set(
      idents.map((ident) => ident.trim().toUpperCase()).filter(Boolean),
    ),
  ]
  if (uniqueIdents.length === 0) return {}

  const batches: Array<Array<string>> = []
  for (let i = 0; i < uniqueIdents.length; i += IDENT_BATCH_SIZE) {
    batches.push(uniqueIdents.slice(i, i + IDENT_BATCH_SIZE))
  }

  const results = await Promise.all(
    batches.map((batch) => fetchAirportBatch(batch)),
  )

  const merged: Partial<Record<string, Coordinates>> = {}
  for (const result of results) {
    Object.assign(merged, result)
  }
  return merged
}
