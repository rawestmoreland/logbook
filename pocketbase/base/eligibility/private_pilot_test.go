package eligibility

import (
	"testing"
	"time"
)

func d(iso string) time.Time {
	t, err := time.ParseInLocation("2006-01-02", iso, time.Local)
	if err != nil {
		panic(err)
	}
	return t
}

var asof = d("2026-09-24")

type flightOpts struct {
	id                    string
	date                  time.Time
	categoryClass         string
	instanceType          string
	totalTime             float64
	dualTime              float64
	soloTime              float64
	nightTime             float64
	crossCountryTime      float64
	nightLandingsFullStop int
}

func flight(o flightOpts) Flight {
	categoryClass := o.categoryClass
	if categoryClass == "" {
		categoryClass = aselCategoryClass
	}
	instanceType := o.instanceType
	if instanceType == "" {
		instanceType = "real"
	}
	date := o.date
	if date.IsZero() {
		date = asof
	}
	return Flight{
		ID: o.id, Date: date, CategoryClass: categoryClass, InstanceType: instanceType,
		TotalTime: o.totalTime, DualTime: o.dualTime, SoloTime: o.soloTime, NightTime: o.nightTime,
		CrossCountryTime: o.crossCountryTime, NightLandingsFullStop: o.nightLandingsFullStop,
	}
}

func findRequirement(t *testing.T, reqs []Requirement, citation, label string) Requirement {
	t.Helper()
	for _, r := range reqs {
		if r.Citation == citation && r.Label == label {
			return r
		}
	}
	t.Fatalf("no requirement found for %s %q", citation, label)
	return Requirement{}
}

func wantFloat(t *testing.T, label string, got, want float64) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %v, want %v", label, got, want)
	}
}

func wantBool(t *testing.T, label string, got, want bool) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %v, want %v", label, got, want)
	}
}

func TestNoFlightsLogged(t *testing.T) {
	reqs := PrivatePilotAirplaneEligibility(nil, asof)
	for _, r := range reqs {
		if r.NeedsManualReview {
			wantBool(t, r.Label+" met", r.Met, false)
			continue
		}
		wantFloat(t, r.Label+" have", r.Have, 0)
		wantBool(t, r.Label+" met", r.Met, false)
	}
}

func TestManualReviewItemsAlwaysFlagged(t *testing.T) {
	reqs := PrivatePilotAirplaneEligibility([]Flight{
		flight(flightOpts{id: "a", totalTime: 100, dualTime: 100, soloTime: 100, nightTime: 100, crossCountryTime: 100, nightLandingsFullStop: 100}),
	}, asof)

	manual := []struct{ citation, label string }{
		{"61.109(a)(2)(i)", "Night cross-country flight over 100nm"},
		{"61.109(a)(4)(ii)", "150nm solo cross-country with 3 full-stop points"},
		{"61.109(a)(4)(iii)", "Solo takeoffs/landings at a towered airport"},
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

// --- Total flight time — 61.109(a) ---

func TestTotalFlightTime(t *testing.T) {
	t.Run("meets 40 hours exactly", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", totalTime: 40}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)", "Total flight time")
		wantFloat(t, "have", r.Have, 40)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses by a tenth of an hour", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", totalTime: 39.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)", "Total flight time")
		wantFloat(t, "have", r.Have, 39.9)
		wantBool(t, "met", r.Met, false)
	})

	t.Run("ignores non-ASEL and simulator time", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", totalTime: 40}),
			flight(flightOpts{id: "b", totalTime: 40, categoryClass: "rotorcraft_helicopter"}),
			flight(flightOpts{id: "c", totalTime: 40, instanceType: "ato_ftd"}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)", "Total flight time")
		wantFloat(t, "have", r.Have, 40)
	})
}

// --- Flight training received — 61.109(a) ---

func TestDualReceived(t *testing.T) {
	t.Run("meets 20 hours exactly", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 20}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)", "Flight training received")
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses by a tenth of an hour", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 19.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)", "Flight training received")
		wantBool(t, "met", r.Met, false)
	})
}

// --- Solo flight time — 61.109(a) ---

func TestSoloTime(t *testing.T) {
	t.Run("meets 10 hours exactly", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)", "Solo flight time")
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses by a tenth of an hour", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 9.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)", "Solo flight time")
		wantBool(t, "met", r.Met, false)
	})
}

// --- Cross-country flight training — 61.109(a)(1) ---

func TestDualCrossCountry(t *testing.T) {
	t.Run("meets 3 hours via min(dual, crossCountry)", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 5, crossCountryTime: 3}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(1)", "Cross-country flight training")
		wantFloat(t, "have", r.Have, 3)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses when crossCountry falls short of dual", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 5, crossCountryTime: 2.9}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(1)", "Cross-country flight training")
		wantFloat(t, "have", r.Have, 2.9)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Night flight training — 61.109(a)(2) ---

func TestNightDual(t *testing.T) {
	t.Run("meets 3 hours via min(dual, night)", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 3, nightTime: 5}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(2)", "Night flight training")
		wantFloat(t, "have", r.Have, 3)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses when dual falls short of night", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 2.9, nightTime: 5}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(2)", "Night flight training")
		wantFloat(t, "have", r.Have, 2.9)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Night full-stop landings (training) — 61.109(a)(2)(ii) ---

func TestNightLandingsTraining(t *testing.T) {
	t.Run("meets 10 landings on a dual flight", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 1, nightLandingsFullStop: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(2)(ii)", "Night full-stop landings (training)")
		wantFloat(t, "have", r.Have, 10)
		wantBool(t, "met", r.Met, true)
		wantBool(t, "unit is landings", r.Unit == "landings", true)
	})

	t.Run("misses by one landing", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", dualTime: 1, nightLandingsFullStop: 9}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(2)(ii)", "Night full-stop landings (training)")
		wantFloat(t, "have", r.Have, 9)
		wantBool(t, "met", r.Met, false)
	})

	t.Run("solo night landings don't count toward the training requirement", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 1, nightLandingsFullStop: 10}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(2)(ii)", "Night full-stop landings (training)")
		wantFloat(t, "have", r.Have, 0)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Flight training within the preceding 2 calendar months — 61.109(a)(3) ---

func TestRecentTestPrep(t *testing.T) {
	t.Run("meets 3 hours flown this calendar month", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", date: asof, dualTime: 3}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(3)", "Flight training within the preceding 2 calendar months")
		wantFloat(t, "have", r.Have, 3)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("flight 2 calendar months back still counts", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", date: d("2026-07-01"), dualTime: 3}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(3)", "Flight training within the preceding 2 calendar months")
		wantFloat(t, "have", r.Have, 3)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("flight from 3 calendar months back has aged out", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", date: d("2026-06-30"), dualTime: 3}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(3)", "Flight training within the preceding 2 calendar months")
		wantFloat(t, "have", r.Have, 0)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Solo cross-country time — 61.109(a)(4)(i) ---

func TestSoloCrossCountry(t *testing.T) {
	t.Run("meets 5 hours via min(solo, crossCountry)", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 5, crossCountryTime: 8}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(4)(i)", "Solo cross-country time")
		wantFloat(t, "have", r.Have, 5)
		wantBool(t, "met", r.Met, true)
	})

	t.Run("misses when solo falls short of crossCountry", func(t *testing.T) {
		reqs := PrivatePilotAirplaneEligibility([]Flight{
			flight(flightOpts{id: "a", soloTime: 4.9, crossCountryTime: 8}),
		}, asof)
		r := findRequirement(t, reqs, "61.109(a)(4)(i)", "Solo cross-country time")
		wantFloat(t, "have", r.Have, 4.9)
		wantBool(t, "met", r.Met, false)
	})
}

// --- Fully qualified pilot: every automated line item at once ---

func TestFullyQualified(t *testing.T) {
	flights := []Flight{
		// Dual training flights: cross-country, night, recent test prep.
		flight(flightOpts{id: "xc1", date: d("2026-01-05"), totalTime: 2, dualTime: 2, crossCountryTime: 2}),
		flight(flightOpts{id: "xc2", date: d("2026-01-12"), totalTime: 1, dualTime: 1, crossCountryTime: 1}),
		flight(flightOpts{id: "night1", date: d("2026-02-01"), totalTime: 3, dualTime: 3, nightTime: 3, nightLandingsFullStop: 10}),
		flight(flightOpts{id: "recent1", date: asof, totalTime: 3, dualTime: 3}),
		// Remaining dual to reach 20 total, plus extra total time so the
		// 40-hour aggregate isn't just dual+solo.
		flight(flightOpts{id: "dual-fill", date: d("2026-03-01"), totalTime: 21, dualTime: 11}),
		// Solo flights: cross-country plus remaining solo to reach 10.
		flight(flightOpts{id: "solo-xc", date: d("2026-04-01"), totalTime: 5, soloTime: 5, crossCountryTime: 5}),
		flight(flightOpts{id: "solo-fill", date: d("2026-04-15"), totalTime: 5, soloTime: 5}),
	}

	reqs := PrivatePilotAirplaneEligibility(flights, asof)

	wantMet := map[string]bool{
		"Total flight time":                                      true,
		"Flight training received":                               true,
		"Solo flight time":                                       true,
		"Cross-country flight training":                          true,
		"Night flight training":                                  true,
		"Night full-stop landings (training)":                    true,
		"Flight training within the preceding 2 calendar months": true,
		"Solo cross-country time":                                true,
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
