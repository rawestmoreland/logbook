import { queryOptions } from '@tanstack/react-query'

import { getFlight, getFlights } from '#/lib/server/flights'

export type FlightsFilters = {
  page?: number
  search?: string
  aircraftId?: string
}

export function flightsQueryOptions(pilotId: string, filters: FlightsFilters = {}) {
  const page = filters.page ?? 1
  const search = filters.search?.trim() || undefined
  const aircraftId = filters.aircraftId || undefined
  return queryOptions({
    queryKey: ['flights', pilotId, { page, search, aircraftId }],
    queryFn: () => getFlights({ data: { pilotId, page, search, aircraftId } }),
  })
}

export function flightQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['flight', id],
    queryFn: () => getFlight({ data: { id } }),
  })
}
