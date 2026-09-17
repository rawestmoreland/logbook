import { queryOptions } from '@tanstack/react-query'

import { getAnalysisData } from '#/lib/server/analysis'

export function analysisQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['analysis', pilotId],
    queryFn: () => getAnalysisData({ data: { pilotId } }),
  })
}
