// Package hooks holds custom PocketBase record hooks for this backend.
package hooks

import (
	"github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterFlightHooks enforces cross-field invariants on the flights
// collection that a single field's `required`/`min`/`max` constraints can't
// express: day_landings_full_stop can't exceed day_landings. The web
// client's zod schema (flight-form.ts) already checks this, but a CSV import
// or a direct API call bypasses it entirely — this closes that gap
// server-side, the same way RegisterAircraftModelHooks does for
// aircraft_models' "complex" definition.
func RegisterFlightHooks(app core.App) {
	app.OnRecordValidate("flights").BindFunc(func(e *core.RecordEvent) error {
		dayLandings := e.Record.GetFloat("day_landings")
		dayLandingsFullStop := e.Record.GetFloat("day_landings_full_stop")

		if dayLandingsFullStop > dayLandings {
			return validation.Errors{
				"day_landings_full_stop": validation.NewError(
					"validation_day_landings_full_stop_exceeds_day_landings",
					"Day landings full stop cannot exceed day landings.",
				),
			}
		}

		return e.Next()
	})
}
