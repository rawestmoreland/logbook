package eligibility

import "testing"

func TestCommercialNoFlightsLogged(t *testing.T) {
	reqs := CommercialAirplaneEligibility(nil, asof)
	for _, r := range reqs {
		if r.NeedsManualReview {
			wantBool(t, r.Label+" met", r.Met, false)
			continue
		}
		wantFloat(t, r.Label+" have", r.Have, 0)
		wantBool(t, r.Label+" met", r.Met, false)
	}
}

func TestCommercialManualReviewItemsAlwaysFlagged(t *testing.T) {
	reqs := CommercialAirplaneEligibility([]Flight{
		flight(flightOpts{
			id: "a", totalTime: 500, dualTime: 500, soloTime: 500, picTime: 500,
			nightTime: 500, crossCountryTime: 500, simInstrument: 500,
			nightLandingsFullStop: 500, complex: true,
		}),
	}, asof)

	manual := []struct{ citation, label string }{
		{"61.129(a)(3)(iii)", "Day cross-country training flight over 100nm"},
		{"61.129(a)(3)(iv)", "Night cross-country training flight over 100nm"},
		{"61.129(a)(4)(i)", "300nm solo cross-country with 3 full-stop points"},
		{"61.129(a)(4)(ii)", "Solo night takeoffs and landings at a towered airport"},
	}
	for _, m := range manual {
		r := findRequirement(t, reqs, m.citation, m.label)
		wantBool(t, m.label+" needsManualReview", r.NeedsManualReview, true)
		wantBool(t, m.label+" met", r.Met, false)
		if r.Note == "" {
			t.Errorf("%s: expected a non-empty note", m.label)
		}
	}
}

// --- Total flight time / powered aircraft time — 61.129(a), 61.129(a)(1) ---

func TestCommercialTotalFlightTime(t *testing.T) {
	t.Run("meets 250 hours exactly", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", totalTime: 250}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)", "Total flight time")
		wantFloat(t, "have", r.Have, 250)
		wantBool(t, "met", r.Met, true)

		powered := findRequirement(t, reqs, "61.129(a)(1)", "Powered aircraft time")
		wantFloat(t, "have", powered.Have, 250)
		wantBool(t, "met", powered.Met, true)

		poweredInAirplane := findRequirement(t, reqs, "61.129(a)(1)", "Powered aircraft time in an airplane")
		wantFloat(t, "have", poweredInAirplane.Have, 250)
		wantBool(t, "met", poweredInAirplane.Met, true)
	})

	t.Run("misses by a tenth of an hour", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", totalTime: 249.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)", "Total flight time")
		wantFloat(t, "have", r.Have, 249.9)
		wantBool(t, "met", r.Met, false)
	})

	t.Run("ignores non-ASEL and simulator time", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", totalTime: 250}),
			flight(flightOpts{id: "b", totalTime: 250, categoryClass: "airplane_multi_engine_land"}),
			flight(flightOpts{id: "c", totalTime: 250, instanceType: "ato_ftd"}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)", "Total flight time")
		wantFloat(t, "have", r.Have, 250)
	})
}

// --- Pilot-in-command flight time — 61.129(a)(2), 61.129(a)(2)(i) ---

func TestCommercialPICTime(t *testing.T) {
	t.Run("meets 100 hours exactly", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", picTime: 100}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(2)", "Pilot-in-command flight time")
		wantFloat(t, "have", r.Have, 100)
		wantBool(t, "met", r.Met, true)

		inAirplane := findRequirement(t, reqs, "61.129(a)(2)(i)", "Pilot-in-command flight time in an airplane")
		wantFloat(t, "have", inAirplane.Have, 100)
		wantBool(t, "met", inAirplane.Met, true)
	})

	t.Run("misses by a tenth of an hour", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", picTime: 99.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(2)", "Pilot-in-command flight time")
		wantBool(t, "met", r.Met, false)
	})
}

// --- Cross-country PIC time — 61.129(a)(2)(ii) ---

func TestCommercialPICCrossCountry(t *testing.T) {
	t.Run("meets 50 hours via min(pic, crossCountry)", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", picTime: 60, crossCountryTime: 50}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(2)(ii)", "Cross-country flight time as pilot in command")
		wantFloat(t, "have", r.Have, 50)
		wantBool(t, "met", r.Met, true)

		inAirplane := findRequirement(t, reqs, "61.129(a)(2)(ii)", "Cross-country pilot-in-command time in an airplane")
		wantFloat(t, "have", inAirplane.Have, 50)
		wantBool(t, "met", inAirplane.Met, true)
	})

	t.Run("misses when crossCountry falls short of pic", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", picTime: 60, crossCountryTime: 49.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(2)(ii)", "Cross-country flight time as pilot in command")
		wantFloat(t, "have", r.Have, 49.9)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Flight training received — 61.129(a)(3) ---

func TestCommercialDualReceived(t *testing.T) {
	t.Run("meets 20 hours exactly", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 20}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)", "Flight training received")
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses by a tenth of an hour", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 19.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)", "Flight training received")
		wantBool(t, "met", r.Met, false)
	})
}

// --- Simulated instrument training — 61.129(a)(3)(i) ---

func TestCommercialSimInstrumentTraining(t *testing.T) {
	t.Run("meets 10 hours via min(dual, simInstrument)", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 15, simInstrument: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)(i)", "Simulated instrument training")
		wantFloat(t, "have", r.Have, 10)
		wantBool(t, "met", r.Met, true)

		inASEL := findRequirement(t, reqs, "61.129(a)(3)(i)", "Simulated instrument training in a single-engine airplane")
		wantFloat(t, "have", inASEL.Have, 10)
		wantBool(t, "met", inASEL.Met, true)
	})

	t.Run("misses when dual falls short of simInstrument", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 9.9, simInstrument: 20}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)(i)", "Simulated instrument training")
		wantFloat(t, "have", r.Have, 9.9)
		wantBool(t, "met", r.Met, false)
	})

	t.Run("actual instrument time (not simulated) doesn't count", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 10, actualInstrument: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)(i)", "Simulated instrument training")
		wantFloat(t, "have", r.Have, 0)
	})
}

// --- Complex or turbine-powered airplane training — 61.129(a)(3)(ii) ---

func TestCommercialComplexOrTurbineTraining(t *testing.T) {
	t.Run("complex airplane training counts", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 10, complex: true}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)(ii)", "Complex or turbine-powered airplane training")
		wantFloat(t, "have", r.Have, 10)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("turbine-powered airplane training counts", func(t *testing.T) {
		for _, engineType := range []string{"turboprop", "jet", "turbine_other"} {
			reqs := CommercialAirplaneEligibility([]Flight{
				flight(flightOpts{id: "a", dualTime: 10, engineType: engineType}),
			}, asof)
			r := findRequirement(t, reqs, "61.129(a)(3)(ii)", "Complex or turbine-powered airplane training")
			wantFloat(t, engineType+" have", r.Have, 10)
			wantBool(t, engineType+" met", r.Met, true)
		}
	})

	t.Run("non-complex piston training doesn't count", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 10, engineType: "piston"}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)(ii)", "Complex or turbine-powered airplane training")
		wantFloat(t, "have", r.Have, 0)
		wantBool(t, "met", r.Met, false)
	})

	t.Run("electric-powered training doesn't count as turbine", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 10, engineType: "electric"}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)(ii)", "Complex or turbine-powered airplane training")
		wantFloat(t, "have", r.Have, 0)
	})
}

// --- Flight training within the preceding 2 calendar months — 61.129(a)(3)(v) ---

func TestCommercialRecentTestPrep(t *testing.T) {
	t.Run("meets 3 hours flown this calendar month", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", date: asof, dualTime: 3}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)(v)", "Flight training within the preceding 2 calendar months")
		wantFloat(t, "have", r.Have, 3)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("flight 3 calendar months back has aged out", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", date: d("2026-06-30"), dualTime: 3}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(3)(v)", "Flight training within the preceding 2 calendar months")
		wantFloat(t, "have", r.Have, 0)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Solo flight time — 61.129(a)(4) ---

func TestCommercialSoloTime(t *testing.T) {
	t.Run("meets 10 hours exactly", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(4)", "Solo flight time")
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses by a tenth of an hour", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 9.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(4)", "Solo flight time")
		wantBool(t, "met", r.Met, false)
	})
}

// --- Solo night flight time — 61.129(a)(4)(ii) ---

func TestCommercialSoloNightTime(t *testing.T) {
	t.Run("meets 5 hours via min(solo, night)", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 8, nightTime: 5}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(4)(ii)", "Solo night flight time")
		wantFloat(t, "have", r.Have, 5)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses when solo falls short of night", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 4.9, nightTime: 5}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(4)(ii)", "Solo night flight time")
		wantFloat(t, "have", r.Have, 4.9)
		wantBool(t, "met", r.Met, false)
	})

	t.Run("dual night time doesn't count toward solo night time", func(t *testing.T) {
		reqs := CommercialAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 5, nightTime: 5}),
		}, asof)
		r := findRequirement(t, reqs, "61.129(a)(4)(ii)", "Solo night flight time")
		wantFloat(t, "have", r.Have, 0)
	})
}

// --- Fully qualified pilot: every automated line item at once ---

func TestCommercialFullyQualified(t *testing.T) {
	flights := []Flight{
		// Remaining total time to reach the 250-hour aggregate.
		flight(flightOpts{id: "total-fill", date: d("2026-01-01"), totalTime: 200}),
		// Cross-country PIC time, which is also cross-country PIC time in
		// an airplane given the ASEL-only scope.
		flight(flightOpts{id: "pic-xc", date: d("2026-01-05"), totalTime: 50, picTime: 50, crossCountryTime: 50}),
		// Remaining PIC time to reach the 100-hour PIC aggregate.
		flight(flightOpts{id: "pic-fill", date: d("2026-01-10"), totalTime: 50, picTime: 50}),
		// Simulated instrument training in a single-engine airplane.
		flight(flightOpts{id: "sim-instrument", date: d("2026-02-01"), totalTime: 10, dualTime: 10, simInstrument: 10}),
		// Complex airplane training.
		flight(flightOpts{id: "complex", date: d("2026-02-10"), totalTime: 10, dualTime: 10, complex: true}),
		// Remaining dual to reach the 20-hour training aggregate.
		flight(flightOpts{id: "dual-fill", date: d("2026-02-15"), totalTime: 5, dualTime: 5}),
		// Recent test prep, within the preceding 2 calendar months.
		flight(flightOpts{id: "recent", date: asof, totalTime: 3, dualTime: 3}),
		// Solo night flight time.
		flight(flightOpts{id: "solo-night", date: d("2026-03-01"), totalTime: 5, soloTime: 5, nightTime: 5}),
		// Remaining solo to reach the 10-hour solo aggregate.
		flight(flightOpts{id: "solo-fill", date: d("2026-03-05"), totalTime: 5, soloTime: 5}),
	}

	reqs := CommercialAirplaneEligibility(flights, asof)

	wantMet := map[string]bool{
		"Total flight time":                                         true,
		"Powered aircraft time":                                     true,
		"Powered aircraft time in an airplane":                      true,
		"Pilot-in-command flight time":                              true,
		"Pilot-in-command flight time in an airplane":               true,
		"Cross-country flight time as pilot in command":             true,
		"Cross-country pilot-in-command time in an airplane":        true,
		"Flight training received":                                  true,
		"Simulated instrument training":                             true,
		"Simulated instrument training in a single-engine airplane": true,
		"Complex or turbine-powered airplane training":              true,
		"Flight training within the preceding 2 calendar months":    true,
		"Solo flight time":                                          true,
		"Solo night flight time":                                    true,
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
