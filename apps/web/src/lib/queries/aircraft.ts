import { queryOptions } from '@tanstack/react-query'

import { getAircraft } from '#/lib/server/aircraft'

export function aircraftQueryOptions() {
  return queryOptions({
    queryKey: ['aircraft'],
    queryFn: () => getAircraft(),
  })
}
