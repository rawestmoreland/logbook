import { queryOptions } from '@tanstack/react-query'

import { getAircraft } from '#/lib/server/aircraft'

export function aircraftQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['aircraft', pilotId],
    queryFn: () => getAircraft({ data: { pilotId } }),
  })
}
