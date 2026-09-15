package hooks

import "github.com/pocketbase/pocketbase/core"

// EnsureBatchEnabled turns on PocketBase's /api/batch endpoint on startup if
// it isn't already. It ships disabled by default on a fresh instance (and
// PocketBase settings aren't tracked by our migrations, unlike collection
// schema), so without this, a fresh deploy silently falls back to one
// PocketBase request per record everywhere batch is used — see
// createFlightChunk and the aircraft/fleet-membership batching in the web
// app's CSV importer (apps/web/src/lib/server/import.ts), all sized around
// PocketBase's batch endpoint actually being reachable. Idempotent and
// leaves any other batch setting (MaxRequests, Timeout) an admin has
// configured untouched.
func EnsureBatchEnabled(app core.App) {
	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		if app.Settings().Batch.Enabled {
			return nil
		}

		settings, err := app.Settings().Clone()
		if err != nil {
			return err
		}
		settings.Batch.Enabled = true
		return app.Save(settings)
	})
}
