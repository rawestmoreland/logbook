package api

import (
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"logbook/currency"
)

// aircraftTypeInfoDTO mirrors AircraftTypeInfo in packages/core/src/aircraft.ts.
type aircraftTypeInfoDTO struct {
	Description     string `json:"description"`
	CategoryClass   string `json:"categoryClass"`
	Complex         bool   `json:"complex"`
	HighPerformance bool   `json:"highPerformance"`
	Tailwheel       bool   `json:"tailwheel"`
	EngineType      string `json:"engineType"`
}

func toAircraftTypeInfoDTO(t currency.AircraftTypeInfo) aircraftTypeInfoDTO {
	return aircraftTypeInfoDTO{
		Description: t.Description, CategoryClass: t.CategoryClass, Complex: t.Complex,
		HighPerformance: t.HighPerformance, Tailwheel: t.Tailwheel, EngineType: t.EngineType,
	}
}

// classificationDriftGroupDTO mirrors AircraftClassificationDrift.from's
// entries in apps/web/src/lib/server/aircraft.ts.
type classificationDriftGroupDTO struct {
	Type        aircraftTypeInfoDTO `json:"type"`
	FlightCount int                 `json:"flightCount"`
}

// classificationDriftDTO mirrors AircraftClassificationDrift in
// apps/web/src/lib/server/aircraft.ts, plus FlightIds — not part of that
// display type, but what syncAircraftToCurrentClassification needs to
// re-snapshot the drifted flights without a second, id-carrying query.
type classificationDriftDTO struct {
	FlightCount int                           `json:"flightCount"`
	From        []classificationDriftGroupDTO `json:"from"`
	To          aircraftTypeInfoDTO           `json:"to"`
	FlightIds   []string                      `json:"flightIds"`
}

func toClassificationDriftDTO(d currency.AircraftClassificationDrift) classificationDriftDTO {
	from := make([]classificationDriftGroupDTO, len(d.From))
	for i, g := range d.From {
		from[i] = classificationDriftGroupDTO{Type: toAircraftTypeInfoDTO(g.Type), FlightCount: g.FlightCount}
	}
	return classificationDriftDTO{
		FlightCount: d.FlightCount, From: from, To: toAircraftTypeInfoDTO(d.To), FlightIds: d.FlightIDs,
	}
}

// aircraftDriftHandler computes, for every aircraft in the requesting
// pilot's fleet, whether any of the pilot's logged flights on it have
// drifted from the aircraft's current live classification (issue #71) — the
// server-side counterpart of apps/web/src/lib/server/aircraft.ts's
// (now-removed) computeClassificationDrift, and the single implementation
// issue #93 consolidates onto (shared with the notification hook's
// computePilotDrift via currency.ComputeClassificationDrift). Keyed by
// aircraft id; an aircraft with no drifted flights is simply absent from the
// response, matching the TS side's `classificationDrift: null`.
//
// Computed for the whole fleet in one request rather than per-aircraft, so
// the fleet page's list view doesn't pay a round trip per aircraft; the
// pilot-initiated sync action (syncAircraftToCurrentClassification) reuses
// this same endpoint for its one aircraft's FlightIds rather than a second,
// narrower endpoint.
func aircraftDriftHandler(e *core.RequestEvent) error {
	pilot, err := findPilotForUser(e.App, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("no pilot profile found for this account", err)
	}

	joins, err := e.App.FindRecordsByFilter(
		"pilot_aircraft",
		"pilot = {:pilotId} && deleted != true",
		"",
		0, 0,
		dbx.Params{"pilotId": pilot.Id},
	)
	if err != nil {
		return e.InternalServerError("failed to load fleet", err)
	}
	result := map[string]classificationDriftDTO{}
	if len(joins) == 0 {
		return e.JSON(http.StatusOK, result)
	}
	e.App.ExpandRecords(joins, []string{"aircraft.model.manufacturer"}, nil)

	// Same set of flights pilotAircraftFlightsFilter (formerly in
	// apps/web/src/lib/server/aircraft.ts) considered.
	flights, err := e.App.FindRecordsByFilter(
		"flights",
		"pilot = {:pilotId} && deleted != true && is_starting_totals != true",
		"",
		0, 0,
		dbx.Params{"pilotId": pilot.Id},
	)
	if err != nil {
		return e.InternalServerError("failed to load flights", err)
	}
	flightsByAircraft := map[string][]*core.Record{}
	for _, f := range flights {
		aircraftId := f.GetString("aircraft")
		flightsByAircraft[aircraftId] = append(flightsByAircraft[aircraftId], f)
	}

	for _, join := range joins {
		aircraft := join.ExpandedOne("aircraft")
		if aircraft == nil {
			continue
		}
		model := aircraft.ExpandedOne("model")
		if model == nil {
			continue
		}
		manufacturerName := ""
		if manufacturer := model.ExpandedOne("manufacturer"); manufacturer != nil {
			manufacturerName = manufacturer.GetString("name")
		}

		live := currency.AircraftTypeInfoFromModel(model, manufacturerName)
		drift := currency.ComputeClassificationDrift(live, flightsByAircraft[aircraft.Id])
		if drift == nil {
			continue
		}
		result[aircraft.Id] = toClassificationDriftDTO(*drift)
	}

	return e.JSON(http.StatusOK, result)
}
