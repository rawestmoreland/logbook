import { queryOptions } from '@tanstack/react-query'

import { getPilotProfile } from '#/lib/server/pilots'

export function pilotProfileQueryOptions() {
  return queryOptions({
    queryKey: ['pilot-profile'],
    queryFn: () => getPilotProfile(),
  })
}
