import { queryOptions } from '@tanstack/react-query'

import { getCheckFlightsData, getEndorsementHistoryForChecks } from '#/lib/server/check-flights'

export function checkFlightsQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['check-flights', pilotId],
    queryFn: () => getCheckFlightsData({ data: { pilotId } }),
  })
}

export function endorsementHistoryQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['endorsement-history', pilotId],
    queryFn: () => getEndorsementHistoryForChecks({ data: { pilotId } }),
  })
}
