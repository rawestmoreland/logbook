# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Expo version note

This project is on Expo SDK 57, which changed significantly from prior versions. Before writing any Expo-related code, read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ rather than relying on pretrained knowledge of older Expo APIs.

## Repository layout

npm workspaces. The Expo app is the root package (it predates the workspace and
stays put for now); everything else is a workspace under it.

```
/                 Expo app — iOS/Android (src/, app.json, metro.config.js)
packages/core/    @logbook/core — framework-free domain logic, shared
apps/web/         TanStack Start web client (scaffolded separately)
pocketbase/       PocketBase backend (Go)
.design/          design canvas source (.dc.html artboards + canvas.json)
```

Keeping the Expo app at the root has one concrete benefit: `packages/core` sits
inside Metro's existing project root, so it resolves with no monorepo resolver
config. Moving the app to `apps/mobile/` is deferred until mobile work resumes,
and will need Metro `watchFolders`/`nodeModulesPaths` setup at that point.

**`@logbook/core` holds anything both clients need** — FAA constants, the flight
form zod schema, generated PocketBase types, and the part 61 currency rules. It
must stay free of React, React Native, and Expo imports. New domain logic
(currency, totals, regulatory rules) belongs there rather than in either app, and
it is the only workspace with tests today.

## Commands

Root scripts fan out across workspaces; per-workspace scripts run with `-w`.

- `npm run start` (or `npx expo start`) — start the Expo dev server
- `npm run ios` / `npm run android` — start for a specific platform
- `npm run lint` — `expo lint`; lints the Expo app only (`apps/**` and
  `packages/**` are ignored, since each workspace lints itself)
- `npm test` — runs every workspace's tests (`@logbook/core` today)
- `npm run typecheck` — the Expo app's `tsc`, then each workspace's
- `npm test -w @logbook/core` / `npm run typecheck -w @logbook/core`
- `npm run reset-project` — moves starter code to `app-example` and creates a blank `app` dir (one-time, destructive)

The Expo app's `tsconfig.json` excludes `apps` and `packages`; those ship their
own. Root `tsc` covers the Expo app only.

### PocketBase backend

The backend is a local PocketBase instance (Go), in `pocketbase/`.

- `cd pocketbase/base && go run . serve --http="127.0.0.1:8080"` (or `make run` from `pocketbase/`) — run PocketBase directly
- `docker compose up` — build and run PocketBase in Docker (runs migrations, then serves on port 8080)
- Collection schema lives in `pocketbase/base/migrations/*.go` as PocketBase migration snapshots (edit collections via the PocketBase admin UI, then export/snapshot a new migration — don't hand-edit the JSON in existing migration files)
- Set `EXPO_PUBLIC_POCKETBASE_URL` in `.env.local` to point the app at a non-default PocketBase instance (defaults to `http://127.0.0.1:8090` in code, but the Docker/local run scripts serve on `8080` — check which one is actually running before debugging connection issues)

## Architecture

This is an offline-first flight logbook app: Expo Router + WatermelonDB (local SQLite) as the source of truth on-device, synced bidirectionally with a PocketBase backend.

### Data flow

1. **Schema** (`src/lib/db/schema.ts`) defines WatermelonDB tables: `pilots`, `aircraft`, `flights`, `endorsements`, `regulatory_profiles`. Columns are snake_case to keep a 1:1 mental map with PocketBase collection fields. Every table carries `pb_id` (linked PocketBase record id) and `pb_updated_at` (last known server `updated` timestamp) for sync bookkeeping.
2. **Models** (`src/lib/db/models/*.ts`) are WatermelonDB `Model` subclasses using `@field`/`@date` decorators; property names are camelCase versions of the snake_case columns.
3. **Database instance** (`src/lib/db/index.ts`) wires the schema/models through `SQLiteAdapter` (native JSI bindings — **does not run in Expo Go**; needs a custom dev client via `expo prebuild` + `expo run:ios`/`expo run:android`, or bare workflow). Always import from `@/lib/db`.
4. **Sync** (`src/lib/sync/sync.ts`) uses WatermelonDB's `synchronize()` against PocketBase (client in `src/lib/sync/pocketbase.ts`). Key details:
   - `pbToWatermelon` / `watermelonToPb` are per-table mapper functions between PocketBase record shape and WatermelonDB raw row shape. **Only `flights` is fully implemented** as a worked example — `pilots`, `aircraft`, `endorsements`, `regulatory_profiles` are TODO and currently fall through to a no-op default. Extend each the same way when building out that entity's screens.
   - PocketBase has no built-in tombstones; deletion is modeled as a `deleted: boolean` field that must exist on every collection. Add it in the PocketBase admin UI when creating new collections.
   - Conflict resolution defaults to last-write-wins via `pb_updated_at`. `endorsements` is called out as the risky case (instructor signs offline while student edits the flight offline) — if you build that flow, consider flagging conflicts for manual review instead of silent overwrite.

### App structure

- File-based routing via `expo-router`, entry files in `src/app/`.
- Path aliases: `@/*` → `src/*`, `@/assets/*` → `assets/*` (see `tsconfig.json`).
- Components in `src/components/`.

### Scaffolding apps/web

`apps/web` is intentionally empty — run the TanStack Start CLI into it yourself.
(The current CLI invocation is not recorded here because `tanstack.com` is
blocked from the sandboxed dev environment and an unverified command is worse
than none; take it from the TanStack Start docs.)

The workspace plumbing around it is already in place: the `apps/*` glob in the
root `package.json`, `apps` excluded from the root `tsconfig.json` and from
`expo lint`, web build outputs gitignored, and `apps/` added to Metro's
`blockList` so the Expo app's bundler does not walk the web app or a nested
`node_modules` (npm will likely not hoist React, since the web app and React
Native want different versions).

After scaffolding:

1. Add `"@logbook/core": "*"` to `apps/web/package.json` dependencies.
2. Run `npm install` from the repo root so the workspace symlink is created.
3. Confirm the scaffolder's `package.json` exposes `typecheck` and `test`
   scripts if you want the root fan-out scripts to include them.
4. `@logbook/core` is published as TypeScript source (`main` points at
   `src/index.ts`), so Vite must transpile it rather than treat it as a
   prebuilt dep — add it to `ssr.noExternal` / `optimizeDeps.include` if
   imports fail at dev time.

### iOS/Android only

This app does **not** target web. `react-native-web`/`react-dom` are not installed, there is no `web` key in `app.json`, and there is no `npm run web` script. Don't add `.web.tsx`/`.web.ts` files, `Platform.select({ web: ... })` branches, or `process.env.EXPO_OS === 'web'` guards — use platform-native APIs (`NativeTabs`, `expo-symbols`, `expo-sqlite`, Reanimated) freely. If a web client is wanted later, the plan is a separate app against the PocketBase API, not a React Native for Web build of this one.
