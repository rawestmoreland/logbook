// Package hooks holds custom PocketBase record hooks for this backend.
package hooks

import (
	"github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterFlightHooks enforces cross-field invariants on the flights
// collection that a single field's `required`/`min`/`max` constraints can't
// express: day_landings_full_stop + night_landings_full_stop can't exceed
// total_landings. The web client's zod schema (flight-form.ts) already
// checks this, but a CSV import or a direct API call bypasses it entirely —
// this closes that gap server-side, the same way RegisterAircraftModelHooks
// does for aircraft_models' "complex" definition.
func RegisterFlightHooks(app core.App) {
	app.OnRecordValidate("flights").BindFunc(func(e *core.RecordEvent) error {
		totalLandings := e.Record.GetFloat("total_landings")
		dayLandingsFullStop := e.Record.GetFloat("day_landings_full_stop")
		nightLandingsFullStop := e.Record.GetFloat("night_landings_full_stop")

		if dayLandingsFullStop+nightLandingsFullStop > totalLandings {
			return validation.Errors{
				"day_landings_full_stop": validation.NewError(
					"validation_full_stop_landings_exceed_total_landings",
					"Full-stop landings cannot exceed total landings.",
				),
			}
		}

		return e.Next()
	})
}
