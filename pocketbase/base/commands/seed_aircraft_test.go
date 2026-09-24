package commands

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "logbook/migrations"
)

// The seed list is hand-curated, not derived — these checks catch the
// mistakes that come from hand-editing a growing table: a copy-pasted
// duplicate row, a typo'd category/class, or a blank required field.
func TestAircraftModelSeeds_areWellFormed(t *testing.T) {
	seen := make(map[string]bool, len(aircraftModelSeeds))
	seenIcao := make(map[string]string, len(aircraftModelSeeds))

	for _, s := range aircraftModelSeeds {
		if s.manufacturer == "" {
			t.Errorf("seed %+v has an empty manufacturer", s)
		}
		if s.model == "" {
			t.Errorf("seed %+v has an empty model", s)
		}
		if !validAircraftCategoryClasses[s.categoryClass] {
			t.Errorf("seed %q %q has an unrecognized category_class %q", s.manufacturer, s.model, s.categoryClass)
		}
		if s.engineType != "" && !validAircraftEngineTypes[s.engineType] {
			t.Errorf("seed %q %q has an unrecognized engine_type %q", s.manufacturer, s.model, s.engineType)
		}

		// Mirrors the aircraft_models validation hook (hooks/aircraft_models.go):
		// complex requires flaps and a controllable pitch prop always, plus
		// retractable gear except for seaplanes. Checked here too so a bad seed
		// row fails fast in `go test` instead of only against a live app.
		if s.complex {
			isSeaplane := s.categoryClass == "airplane_single_engine_sea" || s.categoryClass == "airplane_multi_engine_sea"
			if !s.flaps {
				t.Errorf("seed %q %q is complex but has flaps=false", s.manufacturer, s.model)
			}
			if !s.controllablePitchProp {
				t.Errorf("seed %q %q is complex but has controllablePitchProp=false", s.manufacturer, s.model)
			}
			if !s.retractableGear && !isSeaplane {
				t.Errorf("seed %q %q is complex but has retractableGear=false and isn't a seaplane", s.manufacturer, s.model)
			}
		}

		key := s.manufacturer + "|" + s.model
		if seen[key] {
			t.Errorf("duplicate seed for manufacturer %q model %q", s.manufacturer, s.model)
		}
		seen[key] = true

		// icao is the actual dedup key findOrCreateModel checks first (see
		// the field's doc comment) — two seed rows sharing one by mistake
		// would silently collapse into whichever gets upserted second.
		if s.icao != "" {
			if other, ok := seenIcao[s.icao]; ok {
				t.Errorf("seed %q %q shares icao %q with %q", s.manufacturer, s.model, s.icao, other)
			}
			seenIcao[s.icao] = s.manufacturer + " " + s.model
		}
	}

	if len(aircraftModelSeeds) == 0 {
		t.Error("aircraftModelSeeds is empty")
	}
}

func newTestApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestAppWithConfig(core.BaseAppConfig{
		DataDir:       t.TempDir(),
		EncryptionEnv: "pb_test_env",
	})
	if err != nil {
		t.Fatalf("failed to create test app: %v", err)
	}
	t.Cleanup(app.Cleanup)
	return app
}

// On a fresh catalog, seeding should populate type_design_designator for the
// CRJ family (see aircraft-model-aliases.ts for the matching TypeScript-side
// values) so a fresh install doesn't need a pilot's CSV import to ever
// supply it first.
func TestSeedAircraftModels_setsTypeDesignDesignatorForCrjFamily(t *testing.T) {
	app := newTestApp(t)

	if _, _, err := SeedAircraftModels(app, aircraftModelSeeds); err != nil {
		t.Fatalf("SeedAircraftModels: %v", err)
	}

	wantByIcao := map[string]string{
		"CRJ2": "CL-600-2B19",
		"CRJ7": "CL-600-2C10",
		"CRJ9": "CL-600-2D24",
	}
	for icao, want := range wantByIcao {
		rec, err := app.FindFirstRecordByFilter("aircraft_models", "icao = {:icao}", map[string]any{"icao": icao})
		if err != nil {
			t.Fatalf("find seeded model for icao %q: %v", icao, err)
		}
		if got := rec.GetString("type_design_designator"); got != want {
			t.Errorf("icao %q: expected type_design_designator %q, got %q", icao, want, got)
		}
	}
}
