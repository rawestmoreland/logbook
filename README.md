# Logbook

An offline-friendly flight logbook: a TanStack Start web client backed by a
PocketBase server, with shared domain logic (FAA constants, currency rules,
form schemas) factored out into its own package.

## Layout

```
apps/web/         TanStack Start web client
packages/core/     @logbook/core — framework-free domain logic, shared
pocketbase/        PocketBase backend (Go)
.design/           design canvas source (.dc.html artboards + canvas.json)
```

See `CLAUDE.md` for commands and architecture details.

## Getting started

```bash
npm install
npm run typecheck
npm test
```

Then see `apps/web/README.md` (if present) and `pocketbase/base`'s `make run`
for running each piece locally.
