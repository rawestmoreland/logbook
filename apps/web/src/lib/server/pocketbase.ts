import { getRequestHeader } from '@tanstack/react-start/server'

import { createPocketBase } from '#/lib/pocketbase'

// Falls back to the browser URL when unset — set POCKETBASE_URL separately
// only if the Worker needs to reach PocketBase somewhere the browser can't
// (a private hostname, a different port inside the deploy network).
const SERVER_POCKETBASE_URL =
  process.env.POCKETBASE_URL ?? import.meta.env.VITE_POCKETBASE_URL

/**
 * A fresh, request-scoped PocketBase client hydrated from the `pb_auth`
 * cookie. Never reuse a single instance across requests here: on Cloudflare
 * Workers, module-scope state can be shared across concurrent requests in
 * the same isolate, and an authenticated client shared that way would leak
 * one user's session into another user's request.
 */
export function createRequestPocketBase() {
  const pb = createPocketBase()
  if (SERVER_POCKETBASE_URL) {
    // createPocketBase() already read the client URL; only override when a
    // distinct server-side URL was actually configured.
    pb.baseURL = SERVER_POCKETBASE_URL
  }

  const cookie = getRequestHeader('Cookie')
  if (cookie) {
    pb.authStore.loadFromCookie(cookie)
  }

  return pb
}
