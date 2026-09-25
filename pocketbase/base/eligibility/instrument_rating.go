package eligibility

import "time"

// airplaneCategoryClasses is every "airplane" category/class value — as
// opposed to rotorcraft, glider, lighter-than-air, powered-lift, powered
// parachute, or weight-shift-control. 61.65(d) ("Aeronautical experience for
// the instrument-airplane rating") scopes its instrument-time figures and
// its "10 hours must have been in an airplane" sub-requirement to this set —
// but unlike aselCategoryClass it isn't single-engine-land-only: any
// airplane category/class satisfies those sub-requirements, not just ASEL.
var airplaneCategoryClasses = map[string]bool{
	"airplane_single_engine_land": true,
	"airplane_multi_engine_land":  true,
	"airplane_single_engine_sea":  true,
	"airplane_multi_engine_sea":   true,
}

// realFlights filters to "real" (non-simulator) flights only, with no
// category-class restriction. 61.65(d)(1)'s base 50-hour cross-country PIC
// figure explicitly isn't limited to airplane time — the regulation's own
// text only requires 10 of those 50 hours to be in an airplane — so this
// doesn't filter by category class the way aselRealFlights does for private
// pilot; InstrumentAirplaneEligibility checks airplaneCategoryClasses itself
// for the sub-requirements that do need it.
//
// Same simulator-credit gap as aselRealFlights: 61.65(i)'s BATD/AATD/FFS/FTD
// credit toward the 40-hour instrument-time figure is narrow and
// conditional and isn't modeled here — a documented gap, not a guess.
func realFlights(flights []Flight) []Flight {
	result := make([]Flight, 0, len(flights))
	for _, f := range flights {
		if f.InstanceType == "real" {
			result = append(result, f)
		}
	}
	return result
}

// InstrumentAirplaneEligibility implements 14 CFR 61.65(d) — the
// aeronautical-experience minimums for an instrument rating, airplane
// category. Returns one Requirement per sub-requirement in the order the
// regulation states them; see this package's doc comment for the fail-safe/
// manual-review posture on the sub-requirement this data can't verify on its
// own (the 250nm instrument cross-country).
//
// Not modeled, same posture as PrivatePilotAirplaneEligibility's own gaps:
// this data has no record of which instructor held an instrument-airplane
// rating, so DualTime is trusted as instruction received the same way
// PrivatePilotAirplaneEligibility trusts it — this package has no CFI-rating
// data anywhere to check against.
func InstrumentAirplaneEligibility(flights []Flight, asOf time.Time) []Requirement {
	eligible := realFlights(flights)

	var xcPIC, xcPICAirplane float64
	var instrumentTotal, instrumentDual, recentInstrumentDual float64

	for _, f := range eligible {
		// A flight logs one picTime and one crossCountryTime total, not a
		// PIC-only breakdown of the cross-country portion — the same
		// documented lower-bound assumption PrivatePilotAirplaneEligibility
		// makes for dualXC/soloXC/nightDual.
		flightXCPIC := minF(f.PICTime, f.CrossCountryTime)
		xcPIC += flightXCPIC

		if !airplaneCategoryClasses[f.CategoryClass] {
			continue
		}

		xcPICAirplane += flightXCPIC

		instrumentTime := f.ActualInstrument + f.SimInstrument
		instrumentTotal += instrumentTime

		// Same min()-as-lower-bound assumption: a flight logs one dualTime
		// total, not a dual-only breakdown of its instrument time.
		flightInstrumentDual := minF(f.DualTime, instrumentTime)
		instrumentDual += flightInstrumentDual

		if withinTestPrepWindow(f, asOf) {
			recentInstrumentDual += flightInstrumentDual
		}
	}

	return []Requirement{
		hoursRequirement("61.65(d)(1)", "Cross-country time as pilot in command", xcPIC, 50),
		hoursRequirement("61.65(d)(1)", "Cross-country PIC time in an airplane", xcPICAirplane, 10),
		hoursRequirement("61.65(d)(2)", "Actual or simulated instrument time", instrumentTotal, 40),
		hoursRequirement("61.65(d)(2)", "Instrument time received from an authorized instructor", instrumentDual, 15),
		hoursRequirement("61.65(d)(2)(i)", "Instrument flight training within the preceding 2 calendar months", recentInstrumentDual, 3),
		manualReview(
			"61.65(d)(2)(ii)", "250nm instrument cross-country with approaches",
			"Needs multi-leg route resolution — a single IFR cross-country flight of 250nm along airways or directed routing, with an instrument approach at each airport and three different kinds of approaches — not available server-side.",
		),
	}
}
