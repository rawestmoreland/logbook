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
	// icao is the ICAO Doc 8643 type designator, or "" where none is known
	// (see the comment above aircraftModelSeeds for exactly which rows and
	// why). This is the actual identity key `findOrCreateModel`
	// (apps/web/src/lib/server/models.ts) looks up first, across every
	// manufacturer, before falling back to (manufacturer, model) — so a
	// seed row here and a CSV-imported row attributing the same airframe
	// to a different manufacturer name (e.g. Canadair vs Bombardier for
	// the CRJ program) only end up as one catalog row if both carry the
	// same icao.
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
// icao backfill below is verified against doc8643.com (the public mirror
// of ICAO Doc 8643) per model, not guessed in bulk. A handful stay blank on
// purpose rather than guessed at:
//   - Cessna 172N/172S and Piper PA-28-140/161/181: Doc 8643 doesn't
//     distinguish these sub-variants — every fixed-gear 172 is C172, every
//     fixed-gear Cherokee/Warrior/Archer is P28A — so giving them all the
//     same code would collide across rows that are deliberately kept
//     separate here (different avionics/complex-relevant equipment).
//     172RG and the PA-28R Arrow *do* have their own distinct codes
//     (C72R, P28R) since the retractable gear puts them in a different
//     Doc 8643 entry, so those two are filled in.
//   - Schweizer SGS 2-33A and the plain (non-motorized) Schleicher ASK 21:
//     no confirmed Doc 8643 entry found — only the motorized "ASK-21Mi"
//     has one (AS21), and pure sailplanes often aren't assigned a
//     designator at all since they don't file the flight plans Doc 8643
//     exists for.
//   - Embraer E175: Doc 8643 splits it into E75L (long wing) and E75S
//     (short wing) — there's no plain "E175" code, and nothing here says
//     which wing this seed row means.
//   - Redbird AATD / Frasca 141: training devices, not real aircraft: no
//     ICAO type designator exists for either.
var aircraftModelSeeds = []aircraftModelSeed{
	{"Cessna", "150", "Commuter", "airplane_single_engine_land", false, false, false, false, false, true, "piston", "C150"},
	{"Cessna", "152", "", "airplane_single_engine_land", false, false, false, false, false, true, "piston", "C152"},
	{"Cessna", "172N", "Skyhawk", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Cessna", "172S", "Skyhawk SP", "airplane_single_engine_land", false, false, false, false, true, true, "piston", ""},
	{"Cessna", "172RG", "Cutlass RG", "airplane_single_engine_land", true, false, false, true, true, true, "piston", "C72R"},
	{"Cessna", "182T", "Skylane", "airplane_single_engine_land", false, true, false, false, true, true, "piston", "C182"},
	{"Cessna", "206H", "Stationair", "airplane_single_engine_land", false, true, false, false, true, true, "piston", "C206"},
	{"Cessna", "210N", "Centurion", "airplane_single_engine_land", true, true, false, true, true, true, "piston", "C210"},
	{"Piper", "PA-28-140", "Cherokee", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Piper", "PA-28-161", "Warrior II", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Piper", "PA-28-181", "Archer III", "airplane_single_engine_land", false, false, false, false, false, true, "piston", ""},
	{"Piper", "PA-32R", "Lance", "airplane_single_engine_land", true, true, false, true, true, true, "piston", "P32R"},
	{"Piper", "PA-28R-200", "Arrow", "airplane_single_engine_land", true, false, false, true, true, true, "piston", "P28R"},
	{"Piper", "PA-18", "Super Cub", "airplane_single_engine_land", false, false, true, false, false, true, "piston", "PA18"},
	{"Piper", "PA-44-180", "Seminole", "airplane_multi_engine_land", true, false, false, true, true, true, "piston", "PA44"},
	{"Piper", "PA-34-220T", "Seneca", "airplane_multi_engine_land", true, true, false, true, true, true, "piston", "PA34"},
	{"Cirrus", "SR20", "", "airplane_single_engine_land", false, false, false, false, true, true, "piston", "SR20"},
	{"Cirrus", "SR22", "", "airplane_single_engine_land", false, true, false, false, true, true, "piston", "SR22"},
	{"Diamond", "DA40", "Diamond Star", "airplane_single_engine_land", false, false, false, false, true, true, "piston", "DA40"},
	{"Diamond", "DA42", "Twin Star", "airplane_multi_engine_land", true, false, false, true, true, true, "piston", "DA42"},
	{"Beechcraft", "A36", "Bonanza", "airplane_single_engine_land", true, true, false, true, true, true, "piston", "BE36"},
	{"Beechcraft", "58", "Baron", "airplane_multi_engine_land", true, true, false, true, true, true, "piston", "BE58"},
	{"Mooney", "M20J", "201", "airplane_single_engine_land", true, true, false, true, true, true, "piston", "M20P"},
	{"American Champion", "7GCBC", "Citabria", "airplane_single_engine_land", false, false, true, false, false, false, "piston", "CH7B"},
	{"Aviat", "A-1", "Husky", "airplane_single_engine_land", false, false, true, false, false, false, "piston", "HUSK"},
	{"Robinson", "R22", "Beta", "rotorcraft_helicopter", false, false, false, false, false, false, "piston", "R22"},
	{"Robinson", "R44", "Raven II", "rotorcraft_helicopter", false, false, false, false, false, false, "piston", "R44"},
	{"Bell", "206B", "JetRanger", "rotorcraft_helicopter", false, false, false, false, false, false, "turbine_other", "B06"},
	{"Schweizer", "SGS 2-33A", "", "glider", false, false, false, false, false, false, "", ""},
	{"Schleicher", "ASK 21", "", "glider", false, false, false, false, false, false, "", ""},
	{"Redbird", "AATD", "Redbird AATD", "airplane_single_engine_land", false, false, false, false, false, false, "", ""},
	{"Frasca", "141", "Frasca 141", "airplane_single_engine_land", false, false, false, false, false, false, "", ""},

	// Transport category — see the comment above on category/class and flags.
	{"Boeing", "737-800", "737NG", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B738"},
	{"Boeing", "737 MAX 8", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B38M"},
	{"Boeing", "747-400", "Jumbo Jet", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B744"},
	{"Boeing", "757-200", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B752"},
	{"Boeing", "767-300", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B763"},
	{"Boeing", "777-200ER", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B772"},
	{"Boeing", "777-300ER", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B77W"},
	{"Boeing", "787-8", "Dreamliner", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B788"},
	{"Boeing", "787-9", "Dreamliner", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "B789"},
	{"Airbus", "A319", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "A319"},
	{"Airbus", "A320", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "A320"},
	{"Airbus", "A320neo", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "A20N"},
	{"Airbus", "A321", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "A321"},
	{"Airbus", "A321neo", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "A21N"},
	{"Airbus", "A330-300", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "A333"},
	{"Airbus", "A350-900", "A350 XWB", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "A359"},
	{"Airbus", "A380-800", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "A388"},
	{"Embraer", "E175", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", ""},
	{"Embraer", "E190", "", "airplane_multi_engine_land", false, true, false, true, false, true, "jet", "E190"},
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
// collections. Manufacturers are keyed on name; models are keyed on icao
// first when the seed has one, falling back to (manufacturer, model)
// otherwise — the same lookup order findOrCreateModel
// (apps/web/src/lib/server/models.ts) uses, so re-running this command
// after a pilot's CSV import already created an icao-tagged row (e.g. via
// an aircraft-model-aliases.ts translation) updates that row in place
// instead of creating a second one that happens to share its icao but
// disagrees on manufacturer/model text — that mismatch is exactly how two
// rows for one CRJ type (a bare "CRJ-900" seed row and a "CL-600-2D24"
// import-created row, both icao CRJ9) end up in the catalog. Exported
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

			var record *core.Record
			var isNew bool
			var matchedByIcao bool
			var findErr error
			if s.icao != "" {
				record, isNew, findErr = findOrNewRecordByFilter(txApp, models,
					"icao = {:icao}", map[string]any{"icao": s.icao})
				matchedByIcao = true
			} else {
				record, isNew, findErr = findOrNewRecordByFilter(txApp, models,
					"manufacturer = {:manufacturer} && model = {:model}",
					map[string]any{"manufacturer": manufacturerID, "model": s.model})
			}
			if findErr != nil {
				return fmt.Errorf("looking up model %q %q: %w", s.manufacturer, s.model, findErr)
			}

			// An icao match against a row this exact seed entry didn't
			// create (different manufacturer or model text — e.g. a CSV
			// import's aircraft-model-aliases.ts translation, which carries
			// the actual type-design designator and common name rather than
			// this seed's generic marketing text) already satisfies "one
			// catalog row per icao". Leave it alone rather than overwrite
			// that more specific data with this seed's own placeholder
			// fields — same as findOrCreateModel (models.ts) returning an
			// icao match as-is instead of updating it.
			if matchedByIcao && !isNew &&
				(record.GetString("manufacturer") != manufacturerID || record.GetString("model") != s.model) {
				continue
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
