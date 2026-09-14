package commands

import "testing"

// The seed list is hand-curated, not derived — these checks catch the
// mistakes that come from hand-editing a growing table: a copy-pasted
// duplicate row, a typo'd category/class, or a blank required field.
func TestAircraftModelSeeds_areWellFormed(t *testing.T) {
	seen := make(map[string]bool, len(aircraftModelSeeds))

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

		key := s.manufacturer + "|" + s.model
		if seen[key] {
			t.Errorf("duplicate seed for manufacturer %q model %q", s.manufacturer, s.model)
		}
		seen[key] = true
	}

	if len(aircraftModelSeeds) == 0 {
		t.Error("aircraftModelSeeds is empty")
	}
}
