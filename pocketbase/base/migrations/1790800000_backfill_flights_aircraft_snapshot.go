package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Backfills the logged_aircraft_type/logged_category_class/logged_complex/
// logged_high_performance/logged_tailwheel/logged_engine_type fields added
// by 1790700000_updated_flights.go onto every existing flight, from each
// flight's aircraft's *current* live model data ("as best we know today") —
// see issue #71. Without this, every flight logged before this feature
// shipped would keep reading the live aircraft_models row forever (the
// fallback resolveAircraftType, packages/core/src/aircraft.ts, only kicks
// in when a flight has no snapshot), so a future correction to a shared
// model would still retroactively change their displayed type and
// currency — exactly what this feature exists to prevent. Loads
// manufacturers/aircraft_models/aircraft into memory once rather than
// querying per flight, since a logbook can run to several thousand rows.
func init() {
	m.Register(func(app core.App) error {
		manufacturerNames := map[string]string{}
		manufacturers, err := app.FindAllRecords("manufacturers")
		if err != nil {
			return err
		}
		for _, r := range manufacturers {
			manufacturerNames[r.Id] = r.GetString("name")
		}

		type modelInfo struct {
			description     string
			categoryClass   string
			complex         bool
			highPerformance bool
			tailwheel       bool
			engineType      string
		}
		models := map[string]modelInfo{}
		modelRecords, err := app.FindAllRecords("aircraft_models")
		if err != nil {
			return err
		}
		for _, r := range modelRecords {
			// Mirrors describeModel in apps/web/src/lib/server/models.ts:
			// common_name wins when set, otherwise "<manufacturer> <model>".
			description := r.GetString("common_name")
			if description == "" {
				description = manufacturerNames[r.GetString("manufacturer")] + " " + r.GetString("model")
			}
			models[r.Id] = modelInfo{
				description:     description,
				categoryClass:   r.GetString("category_class"),
				complex:         r.GetBool("complex"),
				highPerformance: r.GetBool("high_performance"),
				tailwheel:       r.GetBool("tailwheel"),
				engineType:      r.GetString("engine_type"),
			}
		}

		aircraftModelId := map[string]string{}
		aircraftRecords, err := app.FindAllRecords("aircraft")
		if err != nil {
			return err
		}
		for _, r := range aircraftRecords {
			aircraftModelId[r.Id] = r.GetString("model")
		}

		flights, err := app.FindAllRecords("flights")
		if err != nil {
			return err
		}
		for _, flight := range flights {
			aircraftId := flight.GetString("aircraft")
			if aircraftId == "" {
				// Starting-totals rows have no aircraft (see saveStartingTotals
				// in flights.ts) — nothing to snapshot.
				continue
			}
			modelId, ok := aircraftModelId[aircraftId]
			if !ok {
				continue
			}
			info, ok := models[modelId]
			if !ok {
				continue
			}

			flight.Set("logged_aircraft_type", info.description)
			flight.Set("logged_category_class", info.categoryClass)
			flight.Set("logged_complex", info.complex)
			flight.Set("logged_high_performance", info.highPerformance)
			flight.Set("logged_tailwheel", info.tailwheel)
			flight.Set("logged_engine_type", info.engineType)
			if err := app.SaveNoValidate(flight); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		flights, err := app.FindAllRecords("flights")
		if err != nil {
			return err
		}
		for _, flight := range flights {
			flight.Set("logged_aircraft_type", "")
			flight.Set("logged_category_class", "")
			flight.Set("logged_complex", false)
			flight.Set("logged_high_performance", false)
			flight.Set("logged_tailwheel", false)
			flight.Set("logged_engine_type", "")
			if err := app.SaveNoValidate(flight); err != nil {
				return err
			}
		}
		return nil
	})
}
