import { queryOptions } from '@tanstack/react-query'

import { getFlight, getFlights, getFlightsSummary, getStartingTotals } from '#/lib/server/flights'

/**
 * Independent of page/search/aircraft filter — the Main screen's
 * header/stats strip (and the log-flight form's "how this changes your
 * totals" deltas) key off this instead of `flightsPageQueryOptions`, so
 * paging or filtering the table doesn't refetch or re-suspend them.
 */
export function flightsSummaryQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['flights-summary', pilotId],
    queryFn: () => getFlightsSummary({ data: { pilotId } }),
  })
}

export type FlightsFilters = {
  page?: number
  search?: string
  aircraftId?: string
}

export function flightsPageQueryOptions(pilotId: string, filters: FlightsFilters = {}) {
  const page = filters.page ?? 1
  const search = filters.search?.trim() || undefined
  const aircraftId = filters.aircraftId || undefined
  return queryOptions({
    queryKey: ['flights-page', pilotId, { page, search, aircraftId }],
    queryFn: () => getFlights({ data: { pilotId, page, search, aircraftId } }),
  })
}

export function flightQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['flight', id],
    queryFn: () => getFlight({ data: { id } }),
  })
}

export function startingTotalsQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['starting-totals', pilotId],
    queryFn: () => getStartingTotals({ data: { pilotId } }),
  })
}
