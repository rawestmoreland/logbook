package eligibility

import "time"

// isTurbinePowered reports whether engineType is one of the turbine
// engine_type values the aircraft_models collection recognizes —
// "turboprop", "jet", or "turbine_other" — as opposed to "piston" or
// "electric" (see validAircraftEngineTypes, commands/seed_aircraft.go).
// 61.129(a)(3)(ii) credits training in "a turbine-powered airplane" toward
// its complex/turbine/TAA sub-requirement; see
// CommercialAirplaneEligibility's doc comment for why TAA itself isn't
// credited here.
func isTurbinePowered(engineType string) bool {
	return engineType == "turboprop" || engineType == "jet" || engineType == "turbine_other"
}

// CommercialAirplaneEligibility implements 14 CFR 61.129(a) — the
// aeronautical-experience minimums for a commercial pilot certificate with
// an airplane category and single-engine class rating (ASEL). Returns one
// Requirement per sub-requirement in the order the regulation states them;
// see this package's doc comment for the fail-safe/manual-review posture on
// the sub-requirements this data can't verify on its own.
//
// Scoped to ASEL flights only (aselRealFlights), the same restriction
// PrivatePilotAirplaneEligibility applies and for the same reason: 61.129(a)
// and its (a)(1)/(a)(2) sub-paragraphs don't, on their own text, restrict
// their total-time/PIC-time figures to single-engine-land airplanes
// specifically — a multi-engine or seaplane rating's time would also count
// toward an ASEL-bound applicant's totals in real-world practice — but
// crediting other category/class time here would only ever move a
// requirement from "not met" to "met", the wrong direction to be wrong in.
// Because of this scoping, several sub-requirements ("... of which N hours
// must be in an airplane") end up reading the same Have as their parent
// ("N hours of ... time") — e.g. "Powered aircraft time" and "Powered
// aircraft time in an airplane" — because every ASEL flight is already both.
// That's expected, not a bug: it mirrors PrivatePilotAirplaneEligibility's
// own total/dual/solo aggregate-plus-subset shape.
//
// Not modeled, documented gaps rather than guesses (same posture as this
// package's other checklists):
//   - 61.129(a)(3)(ii)'s complex-airplane/turbine-powered-airplane/
//     technically-advanced-airplane (TAA) credit only recognizes complex and
//     turbine-powered airplanes here, not TAA — currency.AircraftTypeInfo
//     has no TAA/minimum_avionics signal today (see the task that added this
//     file). Omitting a valid credit source only makes this checklist item
//     stricter than the regulation, never looser.
//   - 61.129(a)(4)'s "10 hours of solo flight time... or 10 hours of flight
//     time performing the duties of pilot in command... with an authorized
//     instructor on board" is two alternate paths to the same credit; this
//     data has no field distinguishing "acting as PIC with an instructor
//     aboard, not receiving instruction" from ordinary dual received, so
//     only the unambiguous solo-flight-time path is credited below.
func CommercialAirplaneEligibility(flights []Flight, asOf time.Time) []Requirement {
	eligible := aselRealFlights(flights)

	var totalTime, picTime, dualTime, soloTime float64
	var picXC, instrumentDualSim, complexOrTurbineDual, recentDual, nightSolo float64

	for _, f := range eligible {
		totalTime += f.TotalTime
		picTime += f.PICTime
		dualTime += f.DualTime
		soloTime += f.SoloTime

		// Same min()-as-lower-bound documented assumption
		// PrivatePilotAirplaneEligibility and InstrumentAirplaneEligibility
		// both make: a flight logs one PICTime/SoloTime/DualTime total, not
		// a dual/solo/PIC breakdown of its cross-country, simulated
		// instrument, or night portion.
		picXC += minF(f.PICTime, f.CrossCountryTime)
		instrumentDualSim += minF(f.DualTime, f.SimInstrument)
		nightSolo += minF(f.SoloTime, f.NightTime)

		if f.Complex || isTurbinePowered(f.EngineType) {
			complexOrTurbineDual += f.DualTime
		}

		if withinTestPrepWindow(f, asOf) {
			recentDual += f.DualTime
		}
	}

	return []Requirement{
		hoursRequirement("61.129(a)", "Total flight time", totalTime, 250),
		hoursRequirement("61.129(a)(1)", "Powered aircraft time", totalTime, 100),
		hoursRequirement("61.129(a)(1)", "Powered aircraft time in an airplane", totalTime, 50),
		hoursRequirement("61.129(a)(2)", "Pilot-in-command flight time", picTime, 100),
		hoursRequirement("61.129(a)(2)(i)", "Pilot-in-command flight time in an airplane", picTime, 50),
		hoursRequirement("61.129(a)(2)(ii)", "Cross-country flight time as pilot in command", picXC, 50),
		hoursRequirement("61.129(a)(2)(ii)", "Cross-country pilot-in-command time in an airplane", picXC, 10),
		hoursRequirement("61.129(a)(3)", "Flight training received", dualTime, 20),
		hoursRequirement("61.129(a)(3)(i)", "Simulated instrument training", instrumentDualSim, 10),
		hoursRequirement("61.129(a)(3)(i)", "Simulated instrument training in a single-engine airplane", instrumentDualSim, 5),
		hoursRequirement("61.129(a)(3)(ii)", "Complex or turbine-powered airplane training", complexOrTurbineDual, 10),
		manualReview(
			"61.129(a)(3)(iii)", "Day cross-country training flight over 100nm",
			"Needs a specific flight's route distance to verify — not resolved server-side; see the Check Flights page for this flight's own cross-country distance warnings.",
		),
		manualReview(
			"61.129(a)(3)(iv)", "Night cross-country training flight over 100nm",
			"Needs a specific flight's route distance to verify — not resolved server-side; see the Check Flights page for this flight's own cross-country distance warnings.",
		),
		hoursRequirement("61.129(a)(3)(v)", "Flight training within the preceding 2 calendar months", recentDual, 3),
		hoursRequirement("61.129(a)(4)", "Solo flight time", soloTime, 10),
		manualReview(
			"61.129(a)(4)(i)", "300nm solo cross-country with 3 full-stop points",
			"Needs multi-leg route resolution (three distinct full-stop points, one leg at least 250nm from the original departure point) not available server-side.",
		),
		hoursRequirement("61.129(a)(4)(ii)", "Solo night flight time", nightSolo, 5),
		manualReview(
			"61.129(a)(4)(ii)", "Solo night takeoffs and landings at a towered airport",
			"Needs airport control-tower data, which this app doesn't track.",
		),
	}
}
