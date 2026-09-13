import { createServerFn } from '@tanstack/react-start'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type AuthUser = {
  id: string
  email: string
}

/**
 * The current request's signed-in user, from the `pb_auth` cookie — or
 * `null` if there isn't one. Trusts the JWT's own expiry (`isValid`) rather
 * than round-tripping to PocketBase on every route load; PocketBase itself
 * still enforces every collection rule server-side regardless.
 */
export const getAuthUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthUser | null> => {
    const pb = createRequestPocketBase()
    if (!pb.authStore.isValid || !pb.authStore.record) return null

    return {
      id: pb.authStore.record.id,
      email: pb.authStore.record.email,
    }
  },
)
