package currency

import "github.com/pocketbase/pocketbase/core"

// AircraftTypeInfo mirrors AircraftTypeInfo in packages/core/src/aircraft.ts
// — the currency/analysis/display-relevant slice of an aircraft_models row,
// resolved either from a flight's frozen logged_* snapshot or from the live
// catalog. Shared by the aircraft-reclassification notification hook
// (hooks/aircraft_notifications.go) and the currency API endpoint
// (api/currency.go), which both need to resolve a flight's aircraft type
// the same way.
type AircraftTypeInfo struct {
	Description     string
	CategoryClass   string
	Complex         bool
	HighPerformance bool
	Tailwheel       bool
	EngineType      string
}

// FlightAircraftSnapshot mirrors FlightAircraftSnapshot in
// packages/core/src/aircraft.ts — the subset of a flights row's logged_*
// fields ResolveAircraftType needs.
type FlightAircraftSnapshot struct {
	AircraftType    string
	CategoryClass   string
	Complex         bool
	HighPerformance bool
	Tailwheel       bool
	EngineType      string
}

func SnapshotFromFlight(f *core.Record) FlightAircraftSnapshot {
	return FlightAircraftSnapshot{
		AircraftType:    f.GetString("logged_aircraft_type"),
		CategoryClass:   f.GetString("logged_category_class"),
		Complex:         f.GetBool("logged_complex"),
		HighPerformance: f.GetBool("logged_high_performance"),
		Tailwheel:       f.GetBool("logged_tailwheel"),
		EngineType:      f.GetString("logged_engine_type"),
	}
}

// ResolveAircraftType mirrors resolveAircraftType in
// packages/core/src/aircraft.ts: a flight's frozen snapshot wins over the
// aircraft's current live model data, falling back to live only when the
// flight predates the snapshot (an empty logged_category_class). Unlike the
// TS version, this never validates categoryClass against the closed
// CATEGORY_CLASSES set — every value read here came from a PocketBase select
// field already constrained to it, so "non-empty" and "recognized" coincide.
func ResolveAircraftType(snapshot FlightAircraftSnapshot, live *AircraftTypeInfo) *AircraftTypeInfo {
	if snapshot.CategoryClass == "" {
		return live
	}
	return &AircraftTypeInfo{
		Description:     snapshot.AircraftType,
		CategoryClass:   snapshot.CategoryClass,
		Complex:         snapshot.Complex,
		HighPerformance: snapshot.HighPerformance,
		Tailwheel:       snapshot.Tailwheel,
		EngineType:      snapshot.EngineType,
	}
}

// HasAircraftTypeDrift mirrors hasAircraftTypeDrift in
// packages/core/src/aircraft.ts.
func HasAircraftTypeDrift(snapshot FlightAircraftSnapshot, live *AircraftTypeInfo) bool {
	if live == nil {
		return false
	}
	logged := ResolveAircraftType(snapshot, live)
	return logged != nil && *logged != *live
}

// DescribeModel mirrors describeModel in apps/web/src/lib/server/models.ts.
func DescribeModel(manufacturerName, model, commonName string) string {
	if commonName != "" {
		return commonName
	}
	return manufacturerName + " " + model
}

// AircraftTypeInfoFromModel mirrors the "live" half of toAircraftTypeInfo in
// apps/web/src/lib/server/models.ts, reading straight off an aircraft_models
// row's current catalog data. Returns nil when category_class is unset —
// there's no current classification to compare flights against.
func AircraftTypeInfoFromModel(model *core.Record, manufacturerName string) *AircraftTypeInfo {
	categoryClass := model.GetString("category_class")
	if categoryClass == "" {
		return nil
	}
	return &AircraftTypeInfo{
		Description:     DescribeModel(manufacturerName, model.GetString("model"), model.GetString("common_name")),
		CategoryClass:   categoryClass,
		Complex:         model.GetBool("complex"),
		HighPerformance: model.GetBool("high_performance"),
		Tailwheel:       model.GetBool("tailwheel"),
		EngineType:      model.GetString("engine_type"),
	}
}
