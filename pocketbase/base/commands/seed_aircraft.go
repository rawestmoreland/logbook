package commands

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
)

// validAircraftCategoryClasses mirrors CATEGORY_CLASSES in
// packages/core/src/aircraft.ts — kept in lockstep by hand, the same as the
// aircraft_models collection's own category_class select values.
var validAircraftCategoryClasses = map[string]bool{
	"airplane_single_engine_land": true,
	"airplane_multi_engine_land":  true,
	"airplane_single_engine_sea":  true,
	"airplane_multi_engine_sea":   true,
	"rotorcraft_helicopter":       true,
	"rotorcraft_gyroplane":        true,
	"glider":                      true,
	"lighter_than_air_airship":    true,
	"lighter_than_air_balloon":    true,
	"powered_lift":                true,
	"powered_parachute_land":      true,
	"powered_parachute_sea":       true,
	"weight_shift_control_land":   true,
	"weight_shift_control_sea":    true,
}

// aircraftModelSeed is one manufacturer/model pairing to seed into the
// shared `manufacturers`/`aircraft_models` catalog.
type aircraftModelSeed struct {
	manufacturer    string
	model           string
	commonName      string
	categoryClass   string
	complex         bool
	highPerformance bool
	tailwheel       bool
}

// aircraftModelSeeds is a small, hand-curated list of common training and
// general-aviation aircraft — not an attempt at MyFlightbook's exhaustive
// make/model table (see the aircraft-database-restructure brief's Deferred
// section, which explicitly scopes this catalog down to category/class plus
// complex/high-performance/tailwheel). Anything missing here is
// found-or-created the first time a pilot logs it, the same way every one
// of these rows would be if this command didn't exist.
var aircraftModelSeeds = []aircraftModelSeed{
	{"Cessna", "150", "Commuter", "airplane_single_engine_land", false, false, false},
	{"Cessna", "152", "", "airplane_single_engine_land", false, false, false},
	{"Cessna", "172N", "Skyhawk", "airplane_single_engine_land", false, false, false},
	{"Cessna", "172S", "Skyhawk SP", "airplane_single_engine_land", false, false, false},
	{"Cessna", "172RG", "Cutlass RG", "airplane_single_engine_land", true, false, false},
	{"Cessna", "182T", "Skylane", "airplane_single_engine_land", false, true, false},
	{"Cessna", "206H", "Stationair", "airplane_single_engine_land", false, true, false},
	{"Cessna", "210N", "Centurion", "airplane_single_engine_land", true, true, false},
	{"Piper", "PA-28-140", "Cherokee", "airplane_single_engine_land", false, false, false},
	{"Piper", "PA-28-161", "Warrior II", "airplane_single_engine_land", false, false, false},
	{"Piper", "PA-28-181", "Archer III", "airplane_single_engine_land", false, false, false},
	{"Piper", "PA-28R-200", "Arrow", "airplane_single_engine_land", true, false, false},
	{"Piper", "PA-18", "Super Cub", "airplane_single_engine_land", false, false, true},
	{"Piper", "PA-44-180", "Seminole", "airplane_multi_engine_land", true, false, false},
	{"Piper", "PA-34-220T", "Seneca", "airplane_multi_engine_land", true, true, false},
	{"Cirrus", "SR20", "", "airplane_single_engine_land", false, false, false},
	{"Cirrus", "SR22", "", "airplane_single_engine_land", false, true, false},
	{"Diamond", "DA40", "Diamond Star", "airplane_single_engine_land", false, false, false},
	{"Diamond", "DA42", "Twin Star", "airplane_multi_engine_land", true, false, false},
	{"Beechcraft", "A36", "Bonanza", "airplane_single_engine_land", true, true, false},
	{"Beechcraft", "58", "Baron", "airplane_multi_engine_land", true, true, false},
	{"Mooney", "M20J", "201", "airplane_single_engine_land", true, true, false},
	{"American Champion", "7GCBC", "Citabria", "airplane_single_engine_land", false, false, true},
	{"Aviat", "A-1", "Husky", "airplane_single_engine_land", false, false, true},
	{"Robinson", "R22", "Beta", "rotorcraft_helicopter", false, false, false},
	{"Robinson", "R44", "Raven II", "rotorcraft_helicopter", false, false, false},
	{"Bell", "206B", "JetRanger", "rotorcraft_helicopter", false, false, false},
	{"Schweizer", "SGS 2-33A", "", "glider", false, false, false},
	{"Schleicher", "ASK 21", "", "glider", false, false, false},
	{"Redbird", "AATD", "Redbird AATD", "airplane_single_engine_land", false, false, false},
	{"Frasca", "141", "Frasca 141", "airplane_single_engine_land", false, false, false},
}

// RegisterAircraftSeedCommand adds `aircraft:seed` to the PocketBase CLI.
// Unlike `airports:seed`, this seeds from the static list above rather than
// a remote dataset — there's no equivalent public-domain source for
// manufacturer/model data. Safe to re-run: manufacturers are matched by
// name and models by (manufacturer, model), both upserted in place rather
// than duplicated.
func RegisterAircraftSeedCommand(app core.App, rootCmd *cobra.Command) {
	rootCmd.AddCommand(&cobra.Command{
		Use:   "aircraft:seed",
		Short: "Seed the manufacturers and aircraft_models collections with common training/GA aircraft",
		RunE: func(cmd *cobra.Command, args []string) error {
			created, updated, err := SeedAircraftModels(app, aircraftModelSeeds)
			if err != nil {
				return err
			}
			app.Logger().Info("aircraft models seeded", "created", created, "updated", updated)
			return nil
		},
	})
}

// SeedAircraftModels upserts seeds into the manufacturers/aircraft_models
// collections, keyed on manufacturer name and (manufacturer, model)
// respectively — the same fields their unique indexes cover. Exported
// (rather than folded into the command closure) so it's testable against an
// in-memory app instance without going through the CLI.
func SeedAircraftModels(app core.App, seeds []aircraftModelSeed) (created, updated int, err error) {
	manufacturers, err := app.FindCollectionByNameOrId("manufacturers")
	if err != nil {
		return 0, 0, fmt.Errorf("manufacturers collection not found (run migrations first): %w", err)
	}
	models, err := app.FindCollectionByNameOrId("aircraft_models")
	if err != nil {
		return 0, 0, fmt.Errorf("aircraft_models collection not found (run migrations first): %w", err)
	}

	err = app.RunInTransaction(func(txApp core.App) error {
		// Several seeds share a manufacturer (e.g. every Cessna) — cache the
		// resolved id per run rather than re-querying for each one.
		manufacturerIDs := make(map[string]string, len(seeds))

		for _, s := range seeds {
			manufacturerID, ok := manufacturerIDs[s.manufacturer]
			if !ok {
				record, isNew, findErr := findOrNewRecordByFilter(txApp, manufacturers,
					"name = {:name}", map[string]any{"name": s.manufacturer})
				if findErr != nil {
					return fmt.Errorf("looking up manufacturer %q: %w", s.manufacturer, findErr)
				}
				record.Set("name", s.manufacturer)
				if saveErr := txApp.Save(record); saveErr != nil {
					return fmt.Errorf("saving manufacturer %q: %w", s.manufacturer, saveErr)
				}
				manufacturerID = record.Id
				manufacturerIDs[s.manufacturer] = manufacturerID
				if isNew {
					created++
				}
			}

			record, isNew, findErr := findOrNewRecordByFilter(txApp, models,
				"manufacturer = {:manufacturer} && model = {:model}",
				map[string]any{"manufacturer": manufacturerID, "model": s.model})
			if findErr != nil {
				return fmt.Errorf("looking up model %q %q: %w", s.manufacturer, s.model, findErr)
			}

			record.Set("manufacturer", manufacturerID)
			record.Set("model", s.model)
			record.Set("common_name", s.commonName)
			record.Set("category_class", s.categoryClass)
			record.Set("complex", s.complex)
			record.Set("high_performance", s.highPerformance)
			record.Set("tailwheel", s.tailwheel)

			if saveErr := txApp.Save(record); saveErr != nil {
				return fmt.Errorf("saving model %q %q: %w", s.manufacturer, s.model, saveErr)
			}
			if isNew {
				created++
			} else {
				updated++
			}
		}
		return nil
	})
	if err != nil {
		return 0, 0, err
	}

	return created, updated, nil
}

// findOrNewRecordByFilter mirrors findOrNewAirportRecord in
// seed_airports.go, generalized to an arbitrary filter/params pair since
// seeding aircraft_models matches on two fields (manufacturer + model), not
// one, and separately reports whether the record is new so the caller can
// keep created/updated counts.
func findOrNewRecordByFilter(
	app core.App, collection *core.Collection, filter string, params map[string]any,
) (record *core.Record, isNew bool, err error) {
	record, err = app.FindFirstRecordByFilter(collection, filter, params)
	if err == nil {
		return record, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	return core.NewRecord(collection), true, nil
}
