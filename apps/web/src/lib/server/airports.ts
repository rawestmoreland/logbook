import { createServerFn } from '@tanstack/react-start'

import type { Coordinates } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

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
    const params: Record<string, string> = {}
    const clauses = uniqueIdents.map((ident, i) => {
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
  })
