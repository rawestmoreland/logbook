# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

npm workspaces.

```
packages/core/    @logbook/core — framework-free domain logic, shared
apps/web/         TanStack Start web client
pocketbase/       PocketBase backend (Go)
.design/          design canvas source (.dc.html artboards + canvas.json)
```

**`@logbook/core` holds anything the web client needs** — FAA constants, the flight
form zod schema, generated PocketBase types, and the part 61 currency rules. It
must stay free of React and browser-only imports. New domain logic
(currency, totals, regulatory rules) belongs there rather than in the app, and
it is the only workspace with tests today.

## Commands

Root scripts fan out across workspaces via `--workspaces --if-present`; per-workspace scripts run with `-w`.

- `npm test` — runs every workspace's tests (`@logbook/core` today)
- `npm run typecheck` — each workspace's `tsc`
- `npm run lint` — each workspace's own linter (currently `apps/web`; `@logbook/core` has none)
- `npm test -w @logbook/core` / `npm run typecheck -w @logbook/core`
- `npm run dev -w web` / `npm run build -w web` — see `apps/web/package.json` for the full script list

### PocketBase backend

The backend is a local PocketBase instance (Go), in `pocketbase/`.

- `cd pocketbase/base && go run . serve --http="127.0.0.1:8080"` (or `make run` from `pocketbase/`) — run PocketBase directly
- `docker compose up` — build and run PocketBase in Docker (runs migrations, then serves on port 8080)
- Collection schema lives in `pocketbase/base/migrations/*.go` as PocketBase migration snapshots (edit collections via the PocketBase admin UI, then export/snapshot a new migration — don't hand-edit the JSON in existing migration files)

## Architecture

Web client (`apps/web`, TanStack Start) talks to a PocketBase backend
(`pocketbase/`). Shared domain logic — FAA constants, the flight form zod
schema, generated PocketBase types, part 61 currency rules, aircraft
model/complex-aircraft rules — lives in `packages/core` so it isn't
duplicated if another client is added later.

PocketBase has no built-in tombstones; deletion is modeled as a `deleted: boolean`
field that exists on relevant collections (e.g. `pilot_aircraft`).

### Scaffolding apps/web

The workspace plumbing is already in place: the `apps/*` glob in the root
`package.json`, web build outputs gitignored.

1. `apps/web/package.json` depends on `"@logbook/core": "*"`.
2. `@logbook/core` is published as TypeScript source (`main` points at
   `src/index.ts`), so Vite must transpile it rather than treat it as a
   prebuilt dep — if imports fail at dev time, add it to `ssr.noExternal` /
   `optimizeDeps.include` in `apps/web/vite.config.ts` (empty today).
