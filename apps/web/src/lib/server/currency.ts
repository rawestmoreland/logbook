import { createServerFn } from '@tanstack/react-start'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

import type { Category, CategoryClass } from '@logbook/core'

/** Wire shape of a computed `CurrencyResult` — dates travel as `YYYY-MM-DD`
 * strings (parsed with `parseDateValue` on the page), matching
 * `pocketbase/base/api/currency.go`'s `currencyResultDTO`. The currency
 * rules themselves run server-side now (`pocketbase/base/currency`); this
 * page only renders what the endpoint already computed. */
export type CurrencyResultData = {
  rule: string
  label: string
  state: 'current' | 'expiring' | 'expired'
  have: number
  need: number
  expiresOn: string | null
  daysRemaining: number | null
  qualifying: Array<{ flightId: string; date: string; counts: number; agesOutOn: string }>
  action: string | null
}

export type CurrencyPassengerGroup = {
  categoryClass: CategoryClass
  results: Array<CurrencyResultData>
}

export type CurrencyInstrumentGroup = {
  category: Category
  result: CurrencyResultData
}

/** Ledger-table metadata for one flight — just enough to resolve a
 * `qualifying` event's `flightId` to a tail number/airport for display. */
export type CurrencyFlightData = {
  id: string
  date: string
  tailNumber: string
  routeFrom: string | null
  routeTo: string | null
}

export type CurrencyData = {
  isEasa: boolean
  passenger: Array<CurrencyPassengerGroup>
  instrument: Array<CurrencyInstrumentGroup>
  review: CurrencyResultData
  medical: CurrencyResultData | null
  /** Set only when `medical` is null — which empty-state copy to show on
   * the page (currently the only reachable case: the FAA certificate
   * pathway missing a required medical field; BasicMed/EASA always compute
   * a result, even an expired one, from whatever fields are on record). */
  medicalReason?: 'missing_faa_medical_fields'
  /** e.g. "Second class certificate issued" — precomputed server-side so
   * the page doesn't need its own copy of the medical-class label maps. */
  medicalSublabel?: string
  flights: Array<CurrencyFlightData>
}

/**
 * Everything the Currency page needs in one round trip, computed by
 * `pocketbase/base/api/currency.go` — the pilot is resolved from the
 * request's own auth token there, not from `pilotId` (kept here only as the
 * query cache key, matching this app's other per-pilot queries).
 */
export const getCurrencyData = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async (): Promise<CurrencyData> => {
    const pb = createRequestPocketBase()
    return pb.send<CurrencyData>('/api/currency', { method: 'GET' })
  })
