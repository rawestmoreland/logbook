import { queryOptions } from '@tanstack/react-query'

import { getCurrencyData } from '#/lib/server/currency'

export function currencyQueryOptions(pilotId: string) {
  return queryOptions({
    queryKey: ['currency', pilotId],
    queryFn: () => getCurrencyData({ data: { pilotId } }),
  })
}
