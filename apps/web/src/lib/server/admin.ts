import { createServerFn } from '@tanstack/react-start'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type MergeInput = { loserId: string; survivorId: string }

export type MergeManufacturersResult = { modelsRepointed: number }
export type MergeModelsResult = { aircraftRepointed: number; reportsRepointed: number }

/**
 * Calls pocketbase/base/api/admin.go's merge endpoints, which additionally
 * enforce pilots.is_admin server-side — the `/admin` route's own
 * `isAdmin` check (apps/web/src/routes/_authed.tsx) only hides the UI, it
 * isn't the access control.
 */
export const mergeManufacturers = createServerFn({ method: 'POST' })
  .validator((data: MergeInput) => data)
  .handler(async ({ data }): Promise<MergeManufacturersResult> => {
    const pb = createRequestPocketBase()
    return pb.send<MergeManufacturersResult>('/api/admin/merge-manufacturers', {
      method: 'POST',
      body: { loserId: data.loserId, survivorId: data.survivorId },
    })
  })

export const mergeModels = createServerFn({ method: 'POST' })
  .validator((data: MergeInput) => data)
  .handler(async ({ data }): Promise<MergeModelsResult> => {
    const pb = createRequestPocketBase()
    return pb.send<MergeModelsResult>('/api/admin/merge-models', {
      method: 'POST',
      body: { loserId: data.loserId, survivorId: data.survivorId },
    })
  })
