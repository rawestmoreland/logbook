import { queryOptions } from '@tanstack/react-query'

import { getAirlineInsights } from '#/lib/server/airline-insights'

export function airlineInsightsQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['airline-insights', pilotId],
    queryFn: () => getAirlineInsights({ data: { pilotId } }),
  })
}
