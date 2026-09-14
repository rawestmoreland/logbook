import { queryOptions } from '@tanstack/react-query'

import { getFlight, getFlights } from '#/lib/server/flights'

export function flightsQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['flights', pilotId],
    queryFn: () => getFlights({ data: { pilotId } }),
  })
}

export function flightQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['flight', id],
    queryFn: () => getFlight({ data: { id } }),
  })
}
