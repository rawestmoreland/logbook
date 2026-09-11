# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Expo version note

This project is on Expo SDK 57, which changed significantly from prior versions. Before writing any Expo-related code, read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ rather than relying on pretrained knowledge of older Expo APIs.

## Commands

- `npm run start` (or `npx expo start`) — start the dev server
- `npm run ios` / `npm run android` / `npm run web` — start for a specific platform
- `npm run lint` — runs `expo lint`
- `npm run reset-project` — moves starter code to `app-example` and creates a blank `app` dir (one-time, destructive)

There is no test suite configured yet.

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
3. **Database instance** is split by platform: `src/lib/db/index.native.ts` wires the schema/models through `SQLiteAdapter` (native JSI bindings — **does not run in Expo Go**; needs a custom dev client via `expo prebuild` + `expo run:ios`/`expo run:android`, or bare workflow), while `src/lib/db/index.web.ts` uses `LokiJSAdapter` (IndexedDB-backed) for web, since `SQLiteAdapter` cannot run in a browser. Expo Router/Metro resolves the right file per platform automatically — always import from `@/lib/db`, never a platform-specific file directly.
4. **Sync** (`src/lib/sync/sync.ts`) uses WatermelonDB's `synchronize()` against PocketBase (client in `src/lib/sync/pocketbase.ts`). Key details:
   - `pbToWatermelon` / `watermelonToPb` are per-table mapper functions between PocketBase record shape and WatermelonDB raw row shape. **Only `flights` is fully implemented** as a worked example — `pilots`, `aircraft`, `endorsements`, `regulatory_profiles` are TODO and currently fall through to a no-op default. Extend each the same way when building out that entity's screens.
   - PocketBase has no built-in tombstones; deletion is modeled as a `deleted: boolean` field that must exist on every collection. Add it in the PocketBase admin UI when creating new collections.
   - Conflict resolution defaults to last-write-wins via `pb_updated_at`. `endorsements` is called out as the risky case (instructor signs offline while student edits the flight offline) — if you build that flow, consider flagging conflicts for manual review instead of silent overwrite.

### App structure

- File-based routing via `expo-router`, entry files in `src/app/` (`_layout.tsx`, `index.tsx`, `explore.tsx`).
- Path aliases: `@/*` → `src/*`, `@/assets/*` → `assets/*` (see `tsconfig.json`).
- Components in `src/components/`, some with `.web.tsx` platform-specific variants (Expo Router picks the right one per platform).
