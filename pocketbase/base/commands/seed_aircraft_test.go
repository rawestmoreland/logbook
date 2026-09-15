package commands

import "testing"

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
