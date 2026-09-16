# Logbook

An open source pilot logbook: a [TanStack Start](https://tanstack.com/start) web
client backed by a [PocketBase](https://pocketbase.io/) server, with shared
domain logic (FAA constants, part 61 currency rules, form schemas, CSV import)
factored out into its own package.

The project is focused on the web app — a previous mobile app is no longer
maintained.

## Layout

```
apps/web/         TanStack Start web client
packages/core/     @logbook/core — framework-free domain logic, shared
pocketbase/        PocketBase backend (Go)
.design/           design canvas source (.dc.html artboards + canvas.json)
```

See `CLAUDE.md` for full commands and architecture details.

## Getting started

Install dependencies and run the shared package's checks:

```bash
npm install
npm run typecheck
npm test
```

### Run the backend (PocketBase)

```bash
cd pocketbase/base && go run . serve --http="127.0.0.1:8080"
```

or, from the `pocketbase/` directory:

```bash
make run
```

Alternatively, run PocketBase in Docker (this also applies migrations before
serving):

```bash
docker compose up
```

Either way, PocketBase serves on `http://127.0.0.1:8080`.

### Run the web client

```bash
npm run dev -w web
```

See `apps/web/package.json` for the full list of scripts (build, lint,
deploy, etc).
