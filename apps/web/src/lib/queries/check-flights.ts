import { queryOptions } from '@tanstack/react-query'

import { getCheckFlightsData } from '#/lib/server/check-flights'

export function checkFlightsQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['check-flights', pilotId],
    queryFn: () => getCheckFlightsData({ data: { pilotId } }),
  })
}
