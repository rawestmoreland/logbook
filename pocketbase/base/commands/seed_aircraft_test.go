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

func mustSave(t *testing.T, app core.App, collectionName string, data map[string]any) *core.Record {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		t.Fatalf("find collection %q: %v", collectionName, err)
	}
	record := core.NewRecord(collection)
	record.Load(data)
	if err := app.SaveNoValidate(record); err != nil {
		t.Fatalf("save %q: %v", collectionName, err)
	}
	return record
}

// Reproduces the duplicate-CRJ-model bug: a pilot's CSV import (via
// aircraft-model-aliases.ts's CL-600-2D24 -> "CRJ 900"/icao CRJ9
// translation, applied through findOrCreateModel's icao-first lookup) has
// already created an aircraft_models row for the type before `aircraft:seed`
// ever runs. Re-running the seed command must find that row by icao and
// leave it alone, not create a second "CRJ-900"/icao CRJ9 row alongside it —
// see CLAUDE.md's importer/catalog notes and the screenshot behind this fix.
func TestSeedAircraftModels_doesNotDuplicateAnIcaoAlreadyClaimedByAnImport(t *testing.T) {
	app := newTestApp(t)

	bombardier := mustSave(t, app, "manufacturers", map[string]any{"name": "Bombardier"})
	imported := mustSave(t, app, "aircraft_models", map[string]any{
		"manufacturer":   bombardier.Id,
		"model":          "CL-600-2D24",
		"common_name":    "CRJ 900",
		"category_class": "airplane_multi_engine_land",
		"engine_type":    "jet",
		"icao":           "CRJ9",
	})

	created, updated, err := SeedAircraftModels(app, aircraftModelSeeds)
	if err != nil {
		t.Fatalf("SeedAircraftModels: %v", err)
	}
	t.Logf("created=%d updated=%d", created, updated)

	models, err := app.FindAllRecords("aircraft_models", nil)
	if err != nil {
		t.Fatalf("find aircraft_models: %v", err)
	}

	var icaoMatches []*core.Record
	for _, m := range models {
		if m.GetString("icao") == "CRJ9" {
			icaoMatches = append(icaoMatches, m)
		}
	}
	if len(icaoMatches) != 1 {
		t.Fatalf("expected exactly one aircraft_models row with icao CRJ9 after seeding, got %d", len(icaoMatches))
	}
	if icaoMatches[0].Id != imported.Id {
		t.Fatalf("seeding replaced the import-created row (id %q) with a new one (id %q) instead of leaving it alone",
			imported.Id, icaoMatches[0].Id)
	}
	if icaoMatches[0].GetString("model") != "CL-600-2D24" || icaoMatches[0].GetString("common_name") != "CRJ 900" {
		t.Fatalf("seeding overwrote the import-created row's model/common_name with its own generic values: got model=%q common_name=%q",
			icaoMatches[0].GetString("model"), icaoMatches[0].GetString("common_name"))
	}
}
