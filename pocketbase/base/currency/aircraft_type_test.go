package currency

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// newFlightRecord builds an in-memory flights-shaped record (no collection
// required, since ComputeClassificationDrift only reads a handful of raw
// fields off it) carrying the given frozen snapshot.
func newFlightRecord(id string, snapshot FlightAircraftSnapshot) *core.Record {
	collection := core.NewBaseCollection("flights")
	collection.Fields.Add(
		&core.TextField{Name: "logged_aircraft_type"},
		&core.TextField{Name: "logged_category_class"},
		&core.BoolField{Name: "logged_complex"},
		&core.BoolField{Name: "logged_high_performance"},
		&core.BoolField{Name: "logged_tailwheel"},
		&core.TextField{Name: "logged_engine_type"},
	)
	record := core.NewRecord(collection)
	record.Id = id
	record.Set("logged_aircraft_type", snapshot.AircraftType)
	record.Set("logged_category_class", snapshot.CategoryClass)
	record.Set("logged_complex", snapshot.Complex)
	record.Set("logged_high_performance", snapshot.HighPerformance)
	record.Set("logged_tailwheel", snapshot.Tailwheel)
	record.Set("logged_engine_type", snapshot.EngineType)
	return record
}

func TestComputeClassificationDrift(t *testing.T) {
	live := &AircraftTypeInfo{Description: "Skyhawk SP", CategoryClass: "airplane_single_engine_land", EngineType: "piston"}
	oldType := FlightAircraftSnapshot{AircraftType: "Skyhawk", CategoryClass: "airplane_single_engine_land", EngineType: "piston"}
	currentType := FlightAircraftSnapshot{AircraftType: "Skyhawk SP", CategoryClass: "airplane_single_engine_land", EngineType: "piston"}

	t.Run("nil when live is nil", func(t *testing.T) {
		flights := []*core.Record{newFlightRecord("f1", oldType)}
		if got := ComputeClassificationDrift(nil, flights); got != nil {
			t.Fatalf("expected nil, got %+v", got)
		}
	})

	t.Run("nil when nothing has drifted", func(t *testing.T) {
		flights := []*core.Record{newFlightRecord("f1", currentType), newFlightRecord("f2", currentType)}
		if got := ComputeClassificationDrift(live, flights); got != nil {
			t.Fatalf("expected nil, got %+v", got)
		}
	})

	t.Run("groups drifted flights by their logged type, most-flown first", func(t *testing.T) {
		veryOldType := FlightAircraftSnapshot{AircraftType: "Skyhawk (steam gauges)", CategoryClass: "airplane_single_engine_land", EngineType: "piston"}
		flights := []*core.Record{
			newFlightRecord("f1", oldType),
			newFlightRecord("f2", oldType),
			newFlightRecord("f3", currentType), // not drifted, shouldn't count
			newFlightRecord("f4", veryOldType),
		}

		got := ComputeClassificationDrift(live, flights)
		if got == nil {
			t.Fatal("expected drift, got nil")
		}
		if got.FlightCount != 3 {
			t.Fatalf("expected 3 drifted flights, got %d", got.FlightCount)
		}
		if got.To != *live {
			t.Fatalf("expected To to be live, got %+v", got.To)
		}
		if len(got.From) != 2 {
			t.Fatalf("expected 2 distinct from-groups, got %d: %+v", len(got.From), got.From)
		}
		if got.From[0].Type.Description != "Skyhawk" || got.From[0].FlightCount != 2 {
			t.Fatalf("expected the most-flown group first, got %+v", got.From[0])
		}
		if got.From[1].Type.Description != "Skyhawk (steam gauges)" || got.From[1].FlightCount != 1 {
			t.Fatalf("expected the less-flown group second, got %+v", got.From[1])
		}

		gotIDs := map[string]bool{}
		for _, id := range got.FlightIDs {
			gotIDs[id] = true
		}
		for _, id := range []string{"f1", "f2", "f4"} {
			if !gotIDs[id] {
				t.Errorf("expected FlightIDs to contain %q, got %v", id, got.FlightIDs)
			}
		}
		if gotIDs["f3"] {
			t.Errorf("expected FlightIDs to not contain the non-drifted flight, got %v", got.FlightIDs)
		}
	})
}
