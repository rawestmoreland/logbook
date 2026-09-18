import { queryOptions } from '@tanstack/react-query'

import { getIgnoredChecks } from '#/lib/server/ignored-checks'

export function ignoredChecksQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['ignored-checks', pilotId],
    queryFn: () => getIgnoredChecks({ data: { pilotId } }),
  })
}
