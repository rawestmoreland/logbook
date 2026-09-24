import { queryOptions } from '@tanstack/react-query'

import { listManufacturers } from '#/lib/server/manufacturers'
import { listModels } from '#/lib/server/models'

import type { ListModelsInput } from '#/lib/server/models'

export function manufacturersQueryOptions() {
  return queryOptions({
    queryKey: ['manufacturers'],
    queryFn: () => listManufacturers(),
  })
}

export function modelsQueryOptions(filters: ListModelsInput) {
  return queryOptions({
    queryKey: ['aircraft-models', filters],
    queryFn: () => listModels({ data: filters }),
  })
}
