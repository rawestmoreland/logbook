import PocketBase from 'pocketbase'

import type { TypedPocketBase } from '@logbook/core'

// EXPO_PUBLIC_POCKETBASE_URL is mobile's env var name — web uses Vite's own
// convention instead. The Docker/local run scripts serve PocketBase on
// :8080; code defaults to :8090 (a bare `go run . serve`) — confirm which
// one is actually running before debugging a connection issue.
export const POCKETBASE_URL: string =
  import.meta.env.VITE_POCKETBASE_URL ?? 'http://127.0.0.1:8090'

export function createPocketBase(): TypedPocketBase {
  return new PocketBase(POCKETBASE_URL)
}

// Browser singleton. PocketBase's default LocalAuthStore persists to
// localStorage and is a no-op (in-memory fallback) when window/localStorage
// aren't available, so constructing this at module scope is safe during SSR
// too — it just never gets populated there.
export const pb = createPocketBase()

if (typeof document !== 'undefined') {
  // Mirror auth state into a cookie so SSR route loaders (which run with no
  // access to localStorage) can read the current session — see
  // `src/lib/server/pocketbase.ts`. `fireImmediately: true` seeds the
  // cookie from whatever localStorage already holds on page load.
  pb.authStore.onChange(() => {
    document.cookie = pb.authStore.exportToCookie({
      httpOnly: false,
      secure: window.location.protocol === 'https:',
    })
  }, true)
}
