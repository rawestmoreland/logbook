import { queryOptions } from '@tanstack/react-query'

import { listPilotCertificates } from '#/lib/server/pilot-certificates'

export function pilotCertificatesQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['pilot-certificates', pilotId],
    queryFn: () => listPilotCertificates({ data: { pilotId } }),
  })
}
