import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type Pilot = { id: string; name: string }

/**
 * Mirrors mobile's `getOrCreateLocalPilot` (src/lib/api/pilots.ts), but
 * writes straight to PocketBase's `pilots` collection instead of
 * WatermelonDB — the web client has no local database.
 *
 * Returns only the fields callers actually need: `licenses` is a PocketBase
 * `json` column (typed `unknown`), which the server function serialization
 * checker rejects as a return value — narrowing here avoids exposing it to a
 * check it can never satisfy.
 */
export const getOrCreatePilot = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Pilot> => {
    const pb = createRequestPocketBase()
    const userId = pb.authStore.record?.id
    if (!userId) throw new Error('Not signed in')

    try {
      const existing = await pb
        .collection('pilots')
        .getFirstListItem(pb.filter('user = {:userId}', { userId }))
      return { id: existing.id, name: existing.name }
    } catch (err) {
      if (!(err instanceof ClientResponseError) || err.status !== 404) throw err
    }

    const created = await pb.collection('pilots').create({
      user: userId,
      name: pb.authStore.record?.email ?? '',
    })
    return { id: created.id, name: created.name }
  },
)
