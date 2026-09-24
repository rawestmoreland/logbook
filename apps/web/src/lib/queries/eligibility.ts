import { queryOptions } from '@tanstack/react-query'

import { getEligibilityData } from '#/lib/server/eligibility'

export function eligibilityQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['eligibility', pilotId],
    queryFn: () => getEligibilityData({ data: { pilotId } }),
  })
}
