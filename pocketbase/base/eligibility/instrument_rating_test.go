package eligibility

import "testing"

func TestInstrumentNoFlightsLogged(t *testing.T) {
	reqs := InstrumentAirplaneEligibility(nil, asof)
	for _, r := range reqs {
		if r.NeedsManualReview {
			wantBool(t, r.Label+" met", r.Met, false)
			continue
		}
		wantFloat(t, r.Label+" have", r.Have, 0)
		wantBool(t, r.Label+" met", r.Met, false)
	}
}

func TestInstrumentManualReviewItemsAlwaysFlagged(t *testing.T) {
	reqs := InstrumentAirplaneEligibility([]Flight{
		flight(flightOpts{id: "a", totalTime: 100, dualTime: 100, picTime: 100, crossCountryTime: 100, actualInstrument: 100}),
	}, asof)

	r := findRequirement(t, reqs, "61.65(d)(2)(ii)", "250nm instrument cross-country with approaches")
	wantBool(t, "needsManualReview", r.NeedsManualReview, true)
	wantBool(t, "met", r.Met, false)
	if r.Note == "" {
		t.Errorf("expected a non-empty note")
	}
}

// --- Cross-country time as pilot in command — 61.65(d)(1) ---

func TestInstrumentXCPIC(t *testing.T) {
	t.Run("meets 50 hours via min(pic, crossCountry)", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", picTime: 60, crossCountryTime: 50}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(1)", "Cross-country time as pilot in command")
		wantFloat(t, "have", r.Have, 50)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses when crossCountry falls short of pic", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", picTime: 60, crossCountryTime: 49.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(1)", "Cross-country time as pilot in command")
		wantFloat(t, "have", r.Have, 49.9)
		wantBool(t, "met", r.Met, false)
	})

	t.Run("counts non-airplane cross-country PIC time toward the 50-hour figure", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", categoryClass: "rotorcraft_helicopter", picTime: 50, crossCountryTime: 50}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(1)", "Cross-country time as pilot in command")
		wantFloat(t, "have", r.Have, 50)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("ignores simulator time", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", instanceType: "ato_ftd", picTime: 50, crossCountryTime: 50}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(1)", "Cross-country time as pilot in command")
		wantFloat(t, "have", r.Have, 0)
	})
}

// --- Cross-country PIC time in an airplane — 61.65(d)(1) ---

func TestInstrumentXCPICAirplane(t *testing.T) {
	t.Run("meets 10 hours in an airplane", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", picTime: 10, crossCountryTime: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(1)", "Cross-country PIC time in an airplane")
		wantFloat(t, "have", r.Have, 10)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("non-airplane category class doesn't count", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", categoryClass: "rotorcraft_helicopter", picTime: 10, crossCountryTime: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(1)", "Cross-country PIC time in an airplane")
		wantFloat(t, "have", r.Have, 0)
		wantBool(t, "met", r.Met, false)
	})

	t.Run("any airplane category/class counts, not just ASEL", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", categoryClass: "airplane_multi_engine_sea", picTime: 10, crossCountryTime: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(1)", "Cross-country PIC time in an airplane")
		wantFloat(t, "have", r.Have, 10)
		wantBool(t, "met", r.Met, true)
	})
}

// --- Actual or simulated instrument time — 61.65(d)(2) ---

func TestInstrumentTotal(t *testing.T) {
	t.Run("meets 40 hours via actual + simulated", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", actualInstrument: 25, simInstrument: 15}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(2)", "Actual or simulated instrument time")
		wantFloat(t, "have", r.Have, 40)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses by a tenth of an hour", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", actualInstrument: 39.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(2)", "Actual or simulated instrument time")
		wantBool(t, "met", r.Met, false)
	})

	t.Run("non-airplane category class doesn't count", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", categoryClass: "rotorcraft_helicopter", actualInstrument: 40}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(2)", "Actual or simulated instrument time")
		wantFloat(t, "have", r.Have, 0)
	})
}

// --- Instrument time received from an authorized instructor — 61.65(d)(2) ---

func TestInstrumentDual(t *testing.T) {
	t.Run("meets 15 hours via min(dual, instrument)", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 15, actualInstrument: 20}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(2)", "Instrument time received from an authorized instructor")
		wantFloat(t, "have", r.Have, 15)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses when dual falls short of instrument time", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 14.9, actualInstrument: 20}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(2)", "Instrument time received from an authorized instructor")
		wantFloat(t, "have", r.Have, 14.9)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Instrument flight training within the preceding 2 calendar months — 61.65(d)(2)(i) ---

func TestInstrumentRecentTestPrep(t *testing.T) {
	t.Run("meets 3 hours flown this calendar month", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", date: asof, dualTime: 3, actualInstrument: 3}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(2)(i)", "Instrument flight training within the preceding 2 calendar months")
		wantFloat(t, "have", r.Have, 3)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("flight 3 calendar months back has aged out", func(t *testing.T) {
		reqs := InstrumentAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", date: d("2026-06-30"), dualTime: 3, actualInstrument: 3}),
		}, asof)
		r := findRequirement(t, reqs, "61.65(d)(2)(i)", "Instrument flight training within the preceding 2 calendar months")
		wantFloat(t, "have", r.Have, 0)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Fully qualified pilot: every automated line item at once ---

func TestInstrumentFullyQualified(t *testing.T) {
	flights := []Flight{
		flight(flightOpts{id: "xc1", date: d("2026-01-05"), picTime: 30, crossCountryTime: 30}),
		flight(flightOpts{id: "xc-other-category", date: d("2026-01-06"), categoryClass: "rotorcraft_helicopter", picTime: 20, crossCountryTime: 20}),
		flight(flightOpts{id: "training1", date: d("2026-02-01"), dualTime: 15, actualInstrument: 15}),
		flight(flightOpts{id: "training2", date: d("2026-03-01"), dualTime: 20, simInstrument: 25}),
		flight(flightOpts{id: "recent1", date: asof, dualTime: 3, actualInstrument: 3}),
	}

	reqs := InstrumentAirplaneEligibility(flights, asof)

	wantMet := map[string]bool{
		"Cross-country time as pilot in command":                            true,
		"Cross-country PIC time in an airplane":                             true,
		"Actual or simulated instrument time":                               true,
		"Instrument time received from an authorized instructor":            true,
		"Instrument flight training within the preceding 2 calendar months": true,
	}

	for _, r := range reqs {
		if r.NeedsManualReview {
			continue
		}
		want, ok := wantMet[r.Label]
		if !ok {
			t.Fatalf("unexpected requirement %q in results", r.Label)
		}
		wantBool(t, r.Label+" met", r.Met, want)
	}
}
