// Package eligibility computes pass/fail checklists against a specific
// certificate/rating's aeronautical-experience minimums — as opposed to
// currency (pocketbase/base/currency), which tracks whether a privilege
// already held is still exercisable, or the IACRA totals worksheet
// (packages/core/src/analysis/iacra-totals.ts), which just sums logged time
// into FAA Form 8710-1's grid with no pass/fail judgment at all.
//
// Same fail-safe principle as currency: where the data can't actually prove
// a sub-requirement is met, this package reports it as needing manual
// review rather than guessing "met" or "not met". Telling a pilot they've
// satisfied a requirement they haven't is the one unacceptable error.
//
// Two checklists are modeled today: Private Pilot, airplane category /
// single-engine class (ASEL) — 14 CFR 61.109(a), this file — and Instrument
// Rating, Airplane category — 14 CFR 61.65(d), instrument_rating.go.
// Multi-engine private (61.109(b)) and every other certificate/rating are
// out of scope; add them as sibling files in this package rather than
// reworking these.
package eligibility

import "time"

import "logbook/currency"

// aselCategoryClass is the only categoryClass value this package's rules
// credit. 61.109(a)(1), (a)(2), and (a)(4) each explicitly restrict their
// cross-country/night/solo requirements to "a single-engine airplane"; the
// intro sentence's 40/20/10-hour aggregate doesn't repeat that restriction
// in the regulation's own text, but crediting, say, glider or helicopter
// time toward an airplane certificate's minimums isn't how any of this data
// is actually used, and would only ever move a requirement from "not met"
// to "met" — the wrong direction to be wrong in. So every automated line
// item below is computed over ASEL flights only, not just the ones the
// regulation's text happens to name explicitly.
const aselCategoryClass = "airplane_single_engine_land"

// testPrepWindowMonths is 61.109(a)(3)'s "preceding 2 calendar months from
// the month of the test." There is no scheduled test date in this app, so
// `asOf` (today, the same convention Currency uses) stands in for it —
// the same trade this task's spec calls out for every other requirement.
const testPrepWindowMonths = 2

// Flight is the slice of a flight this package's rules read. Deliberately
// minimal and separate from currency.CurrencyFlight: eligibility needs
// summable hour fields (TotalTime, DualTime, ...) that currency never sums,
// and has no use for currency's landing-count/approach/tailwheel fields.
type Flight struct {
	ID   string
	Date time.Time

	CategoryClass string
	// InstanceType is what kind of device this flight was flown in. Only
	// "real" flights count — 61.109(k)'s FRTD/AATD simulator credit
	// provision is narrow and conditional (specific device qualification,
	// capped hours) and isn't modeled here; see this package's doc comment
	// and the task that added it for why that's a documented gap rather
	// than a guess.
	InstanceType string

	TotalTime             float64
	DualTime              float64
	SoloTime              float64
	NightTime             float64
	CrossCountryTime      float64
	NightLandingsFullStop int

	// PICTime, ActualInstrument, and SimInstrument are unused by
	// PrivatePilotAirplaneEligibility below; InstrumentAirplaneEligibility
	// (instrument_rating.go) is what reads them.
	PICTime          float64
	ActualInstrument float64
	SimInstrument    float64
}

// Requirement is one 61.109(a) sub-requirement's computed state: how much
// the pilot has, how much is required, and whether it's met — or, for a
// sub-requirement this data can't actually verify, an explanation of why
// not instead of a guess.
type Requirement struct {
	// Citation is the CFR paragraph, e.g. "61.109(a)(2)(ii)".
	Citation string `json:"citation"`
	Label    string `json:"label"`
	// Have/Need are hours for a "hours" Unit, a landing count for
	// "landings" — both left at zero, with NeedsManualReview set, when this
	// package can't compute them at all.
	Have float64 `json:"have"`
	Need float64 `json:"need"`
	Unit string  `json:"unit"`
	Met  bool    `json:"met"`
	// NeedsManualReview is true for a sub-requirement this app's data can't
	// verify (route-distance or control-tower resolution — see Note). Have
	// zero, Need zero, and Met false in that case; the point is not to
	// silently omit the line item, per this package's doc comment.
	NeedsManualReview bool   `json:"needsManualReview"`
	Note              string `json:"note,omitempty"`
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// aselRealFlights returns the flights every automated 61.109(a) computation
// below draws from — see aselCategoryClass's doc comment for why this
// filter applies even to the sub-requirements whose own regulation text
// doesn't name an aircraft type.
func aselRealFlights(flights []Flight) []Flight {
	result := make([]Flight, 0, len(flights))
	for _, f := range flights {
		if f.CategoryClass == aselCategoryClass && f.InstanceType == "real" {
			result = append(result, f)
		}
	}
	return result
}

// withinTestPrepWindow reports whether f counts toward 61.109(a)(3)'s
// "preceding 2 calendar months from the month of the test" — treating asOf
// as the test date, the same substitution this package makes everywhere a
// date-relative rule needs one. Mirrors the trailing-calendar-months window
// currency.InstrumentCurrency uses for 61.57(c)(1)'s 6-month window: a
// flight counts once it isn't in the future and its own
// EndOfCalendarMonthsAfter horizon hasn't yet passed asOf.
func withinTestPrepWindow(f Flight, asOf time.Time) bool {
	if currency.DaysBetween(f.Date, asOf) < 0 {
		return false // in the future relative to asOf
	}
	expiry := currency.EndOfCalendarMonthsAfter(f.Date, testPrepWindowMonths)
	return currency.DaysBetween(asOf, expiry) >= 0
}

func hoursRequirement(citation, label string, have, need float64) Requirement {
	return Requirement{Citation: citation, Label: label, Have: have, Need: need, Unit: "hours", Met: have >= need}
}

func manualReview(citation, label, note string) Requirement {
	return Requirement{Citation: citation, Label: label, Unit: "", Met: false, NeedsManualReview: true, Note: note}
}

// PrivatePilotAirplaneEligibility implements 14 CFR 61.109(a) — the
// aeronautical-experience minimums for a private pilot certificate with an
// airplane category and single-engine class rating (ASEL). Returns one
// Requirement per sub-requirement in the order the regulation states them;
// see this package's doc comment for the fail-safe/manual-review posture on
// the three sub-requirements this data can't verify on its own.
func PrivatePilotAirplaneEligibility(flights []Flight, asOf time.Time) []Requirement {
	eligible := aselRealFlights(flights)

	var totalTime, dualTime, soloTime float64
	var dualXC, nightDual, recentDual float64
	var soloXC float64
	var nightLandings float64

	for _, f := range eligible {
		totalTime += f.TotalTime
		dualTime += f.DualTime
		soloTime += f.SoloTime

		// A flight logs one dualTime and one crossCountryTime total, not a
		// dual/solo breakdown of the cross-country portion — this is the
		// best available lower bound: dual-XC can never exceed either the
		// flight's dual time or its cross-country time. Same reasoning for
		// soloXC and nightDual below. Documented assumption, per this
		// task's spec, the same way iacra-totals.ts documents its own
		// prior-totals/category-attribution calls.
		dualXC += minF(f.DualTime, f.CrossCountryTime)
		soloXC += minF(f.SoloTime, f.CrossCountryTime)
		nightDual += minF(f.DualTime, f.NightTime)

		if f.DualTime > 0 {
			nightLandings += float64(f.NightLandingsFullStop)
		}

		if withinTestPrepWindow(f, asOf) {
			recentDual += f.DualTime
		}
	}

	return []Requirement{
		hoursRequirement("61.109(a)", "Total flight time", totalTime, 40),
		hoursRequirement("61.109(a)", "Flight training received", dualTime, 20),
		hoursRequirement("61.109(a)", "Solo flight time", soloTime, 10),
		hoursRequirement("61.109(a)(1)", "Cross-country flight training", dualXC, 3),
		hoursRequirement("61.109(a)(2)", "Night flight training", nightDual, 3),
		manualReview(
			"61.109(a)(2)(i)", "Night cross-country flight over 100nm",
			"Needs a specific flight's route distance to verify — not resolved server-side; see the Check Flights page for this flight's own cross-country distance warnings.",
		),
		hoursRequirement("61.109(a)(2)(ii)", "Night full-stop landings (training)", nightLandings, 10).withLandingsUnit(),
		hoursRequirement("61.109(a)(3)", "Flight training within the preceding 2 calendar months", recentDual, 3),
		hoursRequirement("61.109(a)(4)(i)", "Solo cross-country time", soloXC, 5),
		manualReview(
			"61.109(a)(4)(ii)", "150nm solo cross-country with 3 full-stop points",
			"Needs multi-leg route resolution (three distinct full-stop points, one leg over 50nm) not available server-side.",
		),
		manualReview(
			"61.109(a)(4)(iii)", "Solo takeoffs/landings at a towered airport",
			"Needs airport control-tower data, which this app doesn't track.",
		),
	}
}

// withLandingsUnit overrides a Requirement built by hoursRequirement to
// report a landing count instead of hours — the two share the same
// have/need/met plumbing, so this avoids a second constructor.
func (r Requirement) withLandingsUnit() Requirement {
	r.Unit = "landings"
	return r
}
