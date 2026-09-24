package currency

import (
	"sort"

	"github.com/pocketbase/pocketbase/core"
)

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

// HasAircraftTypeDrift reports whether a flight's resolved type (see
// ResolveAircraftType) disagrees with the aircraft's current live
// classification. This, along with ComputeClassificationDrift below, used to
// be mirrored by hand in packages/core/src/aircraft.ts
// (hasAircraftTypeDrift/aircraftTypeDriftFields/computeClassificationDrift);
// issue #93 consolidated that TS copy away in favor of this single Go
// implementation, consumed by both the aircraft-reclassification
// notification hook (hooks/aircraft_notifications.go) and the
// GET /api/aircraft/drift endpoint (api/aircraft_drift.go) that the fleet
// page and pilot-initiated sync (apps/web/src/lib/server/aircraft.ts) call.
func HasAircraftTypeDrift(snapshot FlightAircraftSnapshot, live *AircraftTypeInfo) bool {
	if live == nil {
		return false
	}
	logged := ResolveAircraftType(snapshot, live)
	return logged != nil && *logged != *live
}

// AircraftClassificationDriftGroup is one distinct "as logged" type among a
// set of drifted flights, and how many of them were logged under it.
type AircraftClassificationDriftGroup struct {
	Type        AircraftTypeInfo
	FlightCount int
}

// AircraftClassificationDrift summarizes how a set of flights (all on one
// aircraft) has drifted from that aircraft's current live classification —
// see ComputeClassificationDrift.
type AircraftClassificationDrift struct {
	FlightCount int
	// From lists each distinct type the drifted flights were logged under,
	// most-flown first. Usually has exactly one entry; more than one means
	// the aircraft's model was corrected more than once.
	From []AircraftClassificationDriftGroup
	// To is the aircraft's current live type — what a sync writes onto every
	// drifted flight.
	To AircraftTypeInfo
	// FlightIDs is every drifted flight's id, across all groups, in no
	// particular order — what a pilot-initiated sync re-snapshots.
	FlightIDs []string
}

// ComputeClassificationDrift groups the flights (all logged on one aircraft)
// whose frozen logged_* snapshot disagrees with live by what they were
// logged as, or returns nil if none have drifted (including when live is
// nil — no current classification to compare against). Shared by
// hooks.computePilotDrift (grouping one aircraft's drift per pilot) and
// api's aircraftDriftHandler (grouping one pilot's drift per aircraft) — the
// same rule, just fed a different slice of flights.
func ComputeClassificationDrift(live *AircraftTypeInfo, flights []*core.Record) *AircraftClassificationDrift {
	if live == nil {
		return nil
	}

	type group struct {
		info      AircraftTypeInfo
		flightIDs []string
	}
	groups := map[AircraftTypeInfo]*group{}
	var order []AircraftTypeInfo
	total := 0

	for _, f := range flights {
		snapshot := SnapshotFromFlight(f)
		if !HasAircraftTypeDrift(snapshot, live) {
			continue
		}
		resolved := ResolveAircraftType(snapshot, live)
		if resolved == nil {
			continue
		}
		total++
		g, ok := groups[*resolved]
		if !ok {
			g = &group{info: *resolved}
			groups[*resolved] = g
			order = append(order, *resolved)
		}
		g.flightIDs = append(g.flightIDs, f.Id)
	}
	if total == 0 {
		return nil
	}

	sort.SliceStable(order, func(i, j int) bool {
		return len(groups[order[i]].flightIDs) > len(groups[order[j]].flightIDs)
	})
	from := make([]AircraftClassificationDriftGroup, len(order))
	flightIDs := make([]string, 0, total)
	for i, info := range order {
		g := groups[info]
		from[i] = AircraftClassificationDriftGroup{Type: info, FlightCount: len(g.flightIDs)}
		flightIDs = append(flightIDs, g.flightIDs...)
	}

	return &AircraftClassificationDrift{FlightCount: total, From: from, To: *live, FlightIDs: flightIDs}
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
