import { queryOptions } from '@tanstack/react-query'

import { getEndorsementForSigning } from '#/lib/server/endorsement-signatures'

export function endorsementSigningQueryOptions(token: string) {
  return queryOptions({
    queryKey: ['endorsement-signing', token],
    queryFn: () => getEndorsementForSigning({ data: { token } }),
  })
}
