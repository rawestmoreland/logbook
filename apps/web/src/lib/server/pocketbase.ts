import { getRequestHeader } from '@tanstack/react-start/server'

import { createPocketBase, POCKETBASE_URL } from '#/lib/pocketbase'

import type { TypedPocketBase } from '@logbook/core'

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

const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD

/**
 * A fresh PocketBase client authenticated as the configured superuser.
 * This codebase's only privileged/service-role credential — everything else
 * runs as the requesting user's own cookie-derived session and leans on
 * PocketBase's collection rules as the real authority (see
 * `createRequestPocketBase` above). This bypasses those rules entirely, so
 * it exists only for the endorsement e-signature sign flow
 * (`endorsement-signatures.ts`), where a CFI opening a single-use sign link
 * has no PocketBase session — and by design never gets one (see issue #68:
 * no CFI accounts). Callers using this client are responsible for
 * re-deriving the equivalent authorization checks themselves (token
 * matches, not expired, not already signed) before touching a record.
 *
 * Server-only: this file is under lib/server/ and PB_ADMIN_EMAIL/PASSWORD
 * are read from `process.env`, never `import.meta.env`, so nothing here can
 * end up in the browser bundle. Never log the client or its credentials.
 *
 * Like `createRequestPocketBase`, never cache the authenticated client at
 * module scope — a shared instance could leak across concurrent requests in
 * the same Workers isolate, and here that would hand another request a
 * superuser session instead of just another user's.
 */
export async function createAdminPocketBase() {
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    throw new Error('PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD are not configured')
  }

  const pb = createPocketBase()
  if (SERVER_POCKETBASE_URL) {
    pb.baseURL = SERVER_POCKETBASE_URL
  }

  await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
  return pb
}

/**
 * A short-lived, token-scoped URL for a private file field, safe to hand
 * straight to the browser as an `<img src>` — used for the endorsement
 * `signature` field, whose `viewRule` requires `@request.auth.id != ""` and
 * so can't be loaded as a bare cross-origin `<img>` (no PocketBase session
 * travels with that request). `pb.files.getToken()` mints the token for
 * whichever identity `pb` is currently authenticated as (the pilot's own
 * session via `createRequestPocketBase()`, or the superuser via
 * `createAdminPocketBase()` on the no-session CFI sign flow), so this only
 * works after one of those two has already run.
 *
 * Built against `POCKETBASE_URL` (the browser-reachable origin) rather than
 * `pb.baseURL`, since `pb.baseURL` may have been overridden to a
 * server-only `POCKETBASE_URL` env var the browser can't reach (see
 * `createRequestPocketBase` above) — the token itself is fine to reuse
 * across origins, only the host serving it needs to be the public one.
 */
export async function buildFileUrl(
  pb: TypedPocketBase,
  record: { id: string; collectionId: string },
  filename: string,
): Promise<string> {
  const token = await pb.files.getToken()
  return `${POCKETBASE_URL}/api/files/${record.collectionId}/${record.id}/${filename}?token=${encodeURIComponent(token)}`
}
