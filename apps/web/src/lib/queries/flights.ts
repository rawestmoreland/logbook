import { queryOptions } from '@tanstack/react-query'

import { getFlights } from '@/lib/server/flights'

export function flightsQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['flights', pilotId],
    queryFn: () => getFlights({ data: { pilotId } }),
  })
}
