package commands

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
)

// validAircraftEngineTypes mirrors ENGINE_TYPES in
// packages/core/src/aircraft.ts — kept in lockstep by hand, the same as the
// aircraft_models collection's own engine_type select values. Not every seed
// has one: gliders and training devices have no engine, so they're left
// unset (the field isn't required).
var validAircraftEngineTypes = map[string]bool{
	"piston":        true,
	"turboprop":     true,
	"jet":           true,
	"turbine_other": true,
	"electric":      true,
}

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
//
// retractableGear/controllablePitchProp/flaps describe the model's actual
// equipment independent of complex (e.g. a Cessna 182T has a constant-speed
// prop and flaps but fixed gear, so it isn't complex) — they aren't only set
// for complex==true rows. The aircraft_models validation hook
// (hooks/aircraft_models.go) enforces the FAA's definition of "complex"
// (14 CFR 61.31(e)) from them whenever complex is true: flaps and a
// controllable pitch propeller always, retractable gear except for
// seaplanes.
type aircraftModelSeed struct {
	manufacturer          string
	model                 string
	commonName            string
	categoryClass         string
	complex               bool
	highPerformance       bool
	tailwheel             bool
	retractableGear       bool
	controllablePitchProp bool
	flaps                 bool
	// engineType is one of validAircraftEngineTypes, or "" for engineless
	// entries (gliders, training devices).
	engineType string
	// icao is the ICAO Doc 8643 type designator, or "" where not filled in
	// yet. This is the actual identity key `findOrCreateModel` (apps/web/src/
	// lib/server/models.ts) looks up first, across every manufacturer, before
	// falling back to (manufacturer, model) — so a seed row here and a
	// CSV-imported row attributing the same airframe to a different
	// manufacturer name (e.g. Canadair vs Bombardier for the CRJ program)
	// only end up as one catalog row if both carry the same icao. Left blank
	// on most rows below rather than guessed at in bulk; fill in as specific
	// aircraft actually need the dedup guarantee.
	icao string
}

// aircraftModelSeeds is a small, hand-curated list of common training,
// general-aviation, and transport-category aircraft — not an attempt at
// MyFlightbook's exhaustive make/model table (see the
// aircraft-database-restructure brief's Deferred section, which explicitly
// scopes this catalog down to category/class plus
// complex/high-performance/tailwheel). Anything missing here is
// found-or-created the first time a pilot logs it, the same way every one
// of these rows would be if this command didn't exist.
//
// Part 61 category/class (61.5(b)) has no separate "transport" category —
// an airliner logs under the same airplane_multi_engine_land class as a
// Baron or Seminole — so every transport entry below uses that class, with
// high_performance true (well past the 200hp/turbine threshold) and
// tailwheel false. complex is false for all of them: 14 CFR 61.31(e) defines
// "complex" as requiring a controllable pitch *propeller*, which a turbojet/
// turbofan airliner doesn't have — retractable gear and flaps alone aren't
// enough, and these types require a type rating instead of the complex
// endorsement anyway.
var aircraftModelSeeds = []aircraftModelSeed{
	{"Cessna", "150", "Commuter", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Cessna", "152", "", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Cessna", "172N", "Skyhawk", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Cessna", "172S", "Skyhawk SP", "airplane_single_engine_land", false, false, false, false, true, true, "piston", ""},
	{"Cessna", "172RG", "Cutlass RG", "airplane_single_engine_land", true, false, false, true, true, true, "piston", ""},
	{"Cessna", "182T", "Skylane", "airplane_single_engine_land", false, true, false, false, true, true, "piston", ""},
	{"Cessna", "206H", "Stationair", "airplane_single_engine_land", false, true, false, false, true, true, "piston", ""},
	{"Cessna", "210N", "Centurion", "airplane_single_engine_land", true, true, false, true, true, true, "piston", ""},
	{"Piper", "PA-28-140", "Cherokee", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Piper", "PA-28-161", "Warrior II", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Piper", "PA-28-181", "Archer III", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Piper", "PA-32R", "Lance", "airplane_single_engine_land", true, true, false, true, true, true, "piston", ""},
	{"Piper", "PA-28R-200", "Arrow", "airplane_single_engine_land", true, false, false, true, true, true, "piston", ""},
	{"Piper", "PA-18", "Super Cub", "airplane_single_engine_land", false, false, true, false, false, true, "piston", ""},
	{"Piper", "PA-44-180", "Seminole", "airplane_multi_engine_land", true, false, false, true, true, true, "piston", ""},
	{"Piper", "PA-34-220T", "Seneca", "airplane_multi_engine_land", true, true, false, true, true, true, "piston", ""},
	{"Cirrus", "SR20", "", "airplane_single_engine_land", false, false, false, false, true, true, "piston", ""},
	{"Cirrus", "SR22", "", "airplane_single_engine_land", false, true, false, false, true, true, "piston", ""},
	{"Diamond", "DA40", "Diamond Star", "airplane_single_engine_land", false, false, false, false, true, true, "piston", ""},
	{"Diamond", "DA42", "Twin Star", "airplane_multi_engine_land", true, false, false, true, true, true, "piston", ""},
	{"Beechcraft", "A36", "Bonanza", "airplane_single_engine_land", true, true, false, true, true, true, "piston", ""},
	{"Beechcraft", "58", "Baron", "airplane_multi_engine_land", true, true, false, true, true, true, "piston", ""},
	{"Mooney", "M20J", "201", "airplane_single_engine_land", true, true, false, true, true, true, "piston", ""},
	{"American Champion", "7GCBC", "Citabria", "airplane_single_engine_land", false, false, true, false, false, false, "piston", ""},
	{"Aviat", "A-1", "Husky", "airplane_single_engine_land", false, false, true, false, false, false, "piston", ""},
	{"Robinson", "R22", "Beta", "rotorcraft_helicopter", false, false, false, false, false, false, "piston", ""},
	{"Robinson", "R44", "Raven II", "rotorcraft_helicopter", false, false, false, false, false, false, "piston", ""},
	{"Bell", "206B", "JetRanger", "rotorcraft_helicopter", false, false, false, false, false, false, "turbine_other", ""},
	{"Schweizer", "SGS 2-33A", "", "glider", false, false, false, false, false, false, "", ""},
	{"Schleicher", "ASK 21", "", "glider", false, false, false, false, false, false, "", ""},
	{"Redbird", "AATD", "Redbird AATD", "airplane_single_engine_land", false, false, false, false, false, false, "", ""},
	{"Frasca", "141", "Frasca 141", "airplane_single_engine_land", false, false, false, false, false, false, "", ""},

	// Transport category — see the comment above on category/class and flags.
	{"Boeing", "737-800", "737NG", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Boeing", "737 MAX 8", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Boeing", "747-400", "Jumbo Jet", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Boeing", "757-200", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Boeing", "767-300", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Boeing", "777-200ER", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Boeing", "777-300ER", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Boeing", "787-8", "Dreamliner", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Boeing", "787-9", "Dreamliner", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Airbus", "A319", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Airbus", "A320", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Airbus", "A320neo", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Airbus", "A321", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Airbus", "A321neo", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Airbus", "A330-300", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Airbus", "A350-900", "A350 XWB", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Airbus", "A380-800", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Embraer", "E175", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Embraer", "E190", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Bombardier", "CRJ-200", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "CRJ2"},
	{"Bombardier", "CRJ-700", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "CRJ7"},
	{"Bombardier", "CRJ-900", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "CRJ9"},
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
		Short: "Seed the manufacturers and aircraft_models collections with common training/GA/transport aircraft",
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
			record.Set("retractable_gear", s.retractableGear)
			record.Set("controllable_pitch_prop", s.controllablePitchProp)
			record.Set("flaps", s.flaps)
			record.Set("engine_type", s.engineType)
			record.Set("icao", s.icao)

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
