package currency

import (
	"fmt"
	"time"
)

// Where the rules below are ambiguous this package fails SAFE: it
// under-reports currency rather than over-reporting it. Telling a pilot they
// are current when they are not is the one unacceptable error.

// ExpiringSoonDays is how close to expiry counts as "expiring" rather than
// "current".
const ExpiringSoonDays = 30

const (
	passengerWindowDays          = 90
	passengerLandingsRequired    = 3
	instrumentWindowMonths       = 6
	instrumentApproachesRequired = 6
	// instrumentGraceMonths is 61.57(d): one additional 6 calendar months,
	// past ordinary (c) currency's lapse, in which flying
	// approaches/holding/tracking solo can still restore currency before an
	// IPC becomes mandatory.
	instrumentGraceMonths = 6
	flightReviewMonths    = 24
	basicMedCourseMonths  = 24
	basicMedExamMonths    = 48
	// easaUnder40CessationAge is MED.A.045's absolute cessation age for a
	// certificate examined under 40 — see EasaMedicalDurationMonths's doc
	// comment.
	easaUnder40CessationAge = 42
	// easaClass2Under50CessationAge is MED.A.045's absolute cessation age
	// for a Class 2 certificate examined 40-49 — see
	// EasaMedicalDurationMonths's doc comment. LAPL has no equivalent: its
	// 40+ tier doesn't step down again, so nothing caps it.
	easaClass2Under50CessationAge = 51

	ipcRequiredAction = "Past the 61.57(d) grace period — an instrument proficiency check (IPC) is required; approaches alone no longer restore currency"
)

type CurrencyState string

const (
	StateCurrent  CurrencyState = "current"
	StateExpiring CurrencyState = "expiring"
	StateExpired  CurrencyState = "expired"
)

// category/categoryOf mirror CATEGORIES/categoryOf in
// packages/core/src/aircraft.ts — the coarser FAA category (61.5(b))
// grouping the instrument currency rule keys off. 61.57(c) is per-category,
// while 61.57(a)/(b) are per category AND class, so the two rules need
// different comparisons. categoryClass values are plain strings, not a
// closed Go enum — same pragmatic call already made for aircraft type info
// in hooks/aircraft_notifications.go: every value read here came from a
// PocketBase select field already constrained to it.
var categoryOfClass = map[string]string{
	"airplane_single_engine_land": "airplane",
	"airplane_multi_engine_land":  "airplane",
	"airplane_single_engine_sea":  "airplane",
	"airplane_multi_engine_sea":   "airplane",
	"rotorcraft_helicopter":       "rotorcraft",
	"rotorcraft_gyroplane":        "rotorcraft",
	"glider":                      "glider",
	"lighter_than_air_airship":    "lighter_than_air",
	"lighter_than_air_balloon":    "lighter_than_air",
	"powered_lift":                "powered_lift",
	"powered_parachute_land":      "powered_parachute",
	"powered_parachute_sea":       "powered_parachute",
	"weight_shift_control_land":   "weight_shift_control",
	"weight_shift_control_sea":    "weight_shift_control",
}

// CategoryOf returns the FAA category (61.5(b)) a category/class belongs to.
func CategoryOf(categoryClass string) string {
	return categoryOfClass[categoryClass]
}

// Categories mirrors CATEGORIES in packages/core/src/aircraft.ts — the fixed
// display order for grouping instrument currency by category.
var Categories = []string{
	"airplane", "rotorcraft", "glider", "lighter_than_air",
	"powered_lift", "powered_parachute", "weight_shift_control",
}

// CurrencyFlight is the slice of a flight the currency rules actually read.
type CurrencyFlight struct {
	ID   string
	Date time.Time

	CategoryClass string
	// TypeRating is set only when the aircraft requires a type rating;
	// 61.57(a) is type-specific then.
	TypeRating string
	Tailwheel  bool
	// InstanceType is what kind of device this flight was flown in.
	// 61.57(a) and (b) both require the takeoffs/landings to be in an
	// aircraft of the same category and class — there is no simulator/ATD
	// credit provision, unlike (c), which explicitly allows it for
	// instrument currency. So only "real" flights are credited toward
	// day/night passenger currency; InstrumentCurrency doesn't look at this
	// field at all.
	InstanceType string
	// TotalLandings is total landings as sole manipulator (day + night,
	// full stop + touch and go).
	TotalLandings int
	// DayLandingsFullStop is, of TotalLandings, how many were to a full
	// stop during the day. Required for tailwheel credit.
	DayLandingsFullStop int
	// NightLandingsFullStop is, of TotalLandings, how many were to a full
	// stop between 1 hr after sunset and 1 hr before sunrise.
	NightLandingsFullStop int
	// Approaches is instrument approaches performed and logged.
	Approaches     int
	Holding        bool
	CourseTracking bool
}

// QualifyingEvent is one flight's contribution to a rule, and the date it
// stops counting.
type QualifyingEvent struct {
	FlightID  string    `json:"flightId"`
	Date      time.Time `json:"date"`
	Counts    int       `json:"counts"`
	AgesOutOn time.Time `json:"agesOutOn"`
}

type CurrencyResult struct {
	// Rule is the CFR citation, e.g. "61.57(a)(1)".
	Rule          string        `json:"rule"`
	Label         string        `json:"label"`
	State         CurrencyState `json:"state"`
	Have          int           `json:"have"`
	Need          int           `json:"need"`
	ExpiresOn     *time.Time    `json:"expiresOn"`
	DaysRemaining *int          `json:"daysRemaining"`
	// Qualifying are the specific flights carrying this currency, newest
	// first.
	Qualifying []QualifyingEvent `json:"qualifying"`
	// Action is what to do to regain or hold it; nil when comfortably
	// current.
	Action *string `json:"action"`
}

// matchesAircraft is used by day/night passenger currency only —
// instrument currency has no simulator/ATD exclusion and doesn't call this.
func matchesAircraft(f CurrencyFlight, categoryClass, typeRating string) bool {
	if f.CategoryClass != categoryClass {
		return false
	}
	// 61.57(a) and (b) both require the landings to be in an aircraft of
	// the same category and class — no simulator/ATD credit provision.
	if f.InstanceType != "real" {
		return false
	}
	// 61.57(a)(2): when a type rating is required, the landings must be in
	// type.
	if typeRating != "" {
		return f.TypeRating == typeRating
	}
	return true
}

// bindingEvent is the event that will break currency first: walking
// newest-first, the one that carries the running total up to `need`. When it
// ages out the total drops below the requirement, so its expiry is the whole
// rule's expiry.
func bindingEvent(newestFirst []QualifyingEvent, need int) *QualifyingEvent {
	running := 0
	for i := range newestFirst {
		running += newestFirst[i].Counts
		if running >= need {
			return &newestFirst[i]
		}
	}
	return nil
}

func stateFor(daysRemaining *int) CurrencyState {
	if daysRemaining == nil || *daysRemaining < 0 {
		return StateExpired
	}
	if *daysRemaining <= ExpiringSoonDays {
		return StateExpiring
	}
	return StateCurrent
}

func totalOf(events []QualifyingEvent) int {
	sum := 0
	for _, e := range events {
		sum += e.Counts
	}
	return sum
}

func build(
	rule, label string,
	events []QualifyingEvent,
	need int,
	asOf time.Time,
	shortfallAction func(missing int) string,
	holdAction func(expiresOn time.Time) string,
) CurrencyResult {
	have := totalOf(events)
	binding := bindingEvent(events, need)

	var expiresOn *time.Time
	if binding != nil {
		t := binding.AgesOutOn
		expiresOn = &t
	}

	var daysRemaining *int
	if expiresOn != nil {
		d := DaysBetween(asOf, *expiresOn)
		daysRemaining = &d
	}
	state := stateFor(daysRemaining)

	var action *string
	if state == StateExpired {
		missing := need - have
		if missing < 0 {
			missing = 0
		}
		s := shortfallAction(missing)
		action = &s
	} else if state == StateExpiring && expiresOn != nil {
		s := holdAction(*expiresOn)
		action = &s
	}

	if events == nil {
		events = []QualifyingEvent{}
	}

	return CurrencyResult{
		Rule: rule, Label: label, State: state, Have: have, Need: need,
		ExpiresOn: expiresOn, DaysRemaining: daysRemaining, Qualifying: events, Action: action,
	}
}

// withinDays returns flights inside a rolling day window, newest first.
func withinDays(flights []CurrencyFlight, asOf time.Time, days int) []CurrencyFlight {
	result := make([]CurrencyFlight, 0, len(flights))
	for _, f := range flights {
		age := DaysBetween(f.Date, asOf)
		if age >= 0 && age <= days {
			result = append(result, f)
		}
	}
	sortFlightsNewestFirst(result)
	return result
}

func sortFlightsNewestFirst(flights []CurrencyFlight) {
	for i := 1; i < len(flights); i++ {
		for j := i; j > 0 && flights[j].Date.After(flights[j-1].Date); j-- {
			flights[j], flights[j-1] = flights[j-1], flights[j]
		}
	}
}

func pluralS(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// DayPassengerCurrency implements 61.57(a)(1) — three takeoffs and landings
// in the preceding 90 days, same category and class (and type, when a type
// rating is required), as sole manipulator. Night full-stop landings count
// here too: (b) adds a requirement, it does not replace this one. Only
// landings flown in a real aircraft count — unlike 61.57(c), (a) and (b)
// have no simulator/ATD credit provision.
//
// Tailwheel airplanes (61.57(a)(1)(ii)) require the landings to be to a full
// stop. When Tailwheel is set and DayLandingsFullStop is zero we cannot
// prove that, so those landings are not credited. A non-tailwheel day count
// is derived as TotalLandings - NightLandingsFullStop — every landing not
// already accounted for as a night full stop — since this app doesn't track
// a separate touch-and-go count for day vs. night landings.
func DayPassengerCurrency(flights []CurrencyFlight, asOf time.Time, categoryClass, typeRating string) CurrencyResult {
	events := []QualifyingEvent{}
	for _, f := range withinDays(flights, asOf, passengerWindowDays) {
		if !matchesAircraft(f, categoryClass, typeRating) {
			continue
		}
		day := f.TotalLandings - f.NightLandingsFullStop
		if f.Tailwheel {
			day = f.DayLandingsFullStop
		}
		counts := day + f.NightLandingsFullStop
		if counts > 0 {
			events = append(events, QualifyingEvent{
				FlightID: f.ID, Date: f.Date, Counts: counts, AgesOutOn: AddDays(f.Date, passengerWindowDays),
			})
		}
	}

	return build(
		"61.57(a)(1)", "Passengers — day", events, passengerLandingsRequired, asOf,
		func(missing int) string {
			return fmt.Sprintf("%d more takeoff%s and landing%s required", missing, pluralS(missing), pluralS(missing))
		},
		func(expiresOn time.Time) string {
			return fmt.Sprintf("One takeoff and landing before %s keeps this alive", fmtDate(expiresOn))
		},
	)
}

// NightPassengerCurrency implements 61.57(b) — three takeoffs and three
// landings to a full stop at night (1 hr after sunset to 1 hr before
// sunrise) in the preceding 90 days. Same real-aircraft-only restriction as
// (a)(1) — see DayPassengerCurrency.
func NightPassengerCurrency(flights []CurrencyFlight, asOf time.Time, categoryClass, typeRating string) CurrencyResult {
	events := []QualifyingEvent{}
	for _, f := range withinDays(flights, asOf, passengerWindowDays) {
		if !matchesAircraft(f, categoryClass, typeRating) {
			continue
		}
		if f.NightLandingsFullStop > 0 {
			events = append(events, QualifyingEvent{
				FlightID: f.ID, Date: f.Date, Counts: f.NightLandingsFullStop, AgesOutOn: AddDays(f.Date, passengerWindowDays),
			})
		}
	}

	return build(
		"61.57(b)", "Passengers — night", events, passengerLandingsRequired, asOf,
		func(missing int) string {
			return fmt.Sprintf("%d more full-stop night landing%s required", missing, pluralS(missing))
		},
		func(expiresOn time.Time) string {
			return fmt.Sprintf("One night full-stop before %s keeps this alive", fmtDate(expiresOn))
		},
	)
}

const (
	easaRecencyWindowDays        = 90
	easaRecencyLandingsRequired  = 3
	easaNightPicLandingsRequired = 1
)

// EasaRecencyCurrency implements EASA Part-FCL, FCL.060(b)(1) — recent
// experience to carry passengers (or operate in commercial air transport) as
// PIC or co-pilot: at least 3 take-offs, approaches, and landings in the
// preceding 90 days, in an aircraft of the same type or class.
//
// Unlike 61.57(a)/(b), which split day and night passenger currency into two
// entirely independent 3-landing tracks, FCL.060(b)(1) is a single UNIFIED
// count: day and night take-offs/landings both credit the same 3-in-90
// requirement, with no separate day-only track. A further, additional
// requirement applies on top of this one specifically to acting as PIC at
// night — see EasaNightPicCurrency for FCL.060(b)(2).
//
// Per this package's fail-safe principle, only "real" flights are credited
// (via the same matchesAircraft helper the FAA functions use) — this app's
// InstanceType field can't distinguish an EASA-qualified FFS from the
// FAA-flavored ATD/FTD tiers it actually tracks, so crediting any non-"real"
// flight risks over-crediting a device that wouldn't actually qualify.
func EasaRecencyCurrency(flights []CurrencyFlight, asOf time.Time, categoryClass, typeRating string) CurrencyResult {
	events := []QualifyingEvent{}
	for _, f := range withinDays(flights, asOf, easaRecencyWindowDays) {
		if !matchesAircraft(f, categoryClass, typeRating) {
			continue
		}
		if f.TotalLandings > 0 {
			events = append(events, QualifyingEvent{
				FlightID: f.ID, Date: f.Date, Counts: f.TotalLandings, AgesOutOn: AddDays(f.Date, easaRecencyWindowDays),
			})
		}
	}

	return build(
		"FCL.060(b)(1)", "Recency (EASA)", events, easaRecencyLandingsRequired, asOf,
		func(missing int) string {
			return fmt.Sprintf("%d more take-off%s and landing%s required", missing, pluralS(missing), pluralS(missing))
		},
		func(expiresOn time.Time) string {
			return fmt.Sprintf("One take-off and landing before %s keeps this alive", fmtDate(expiresOn))
		},
	)
}

// EasaNightPicCurrency implements EASA Part-FCL, FCL.060(b)(2) — an
// ADDITIONAL requirement layered on top of EasaRecencyCurrency, applying
// only to acting as PIC at night: at least 1 take-off, approach, and landing
// at night, in the preceding 90 days, as pilot flying, in an aircraft of the
// same type or class.
//
// FCL.060(b)(2) also exempts a pilot who holds a valid instrument rating
// (IR) from this specific night requirement entirely. This app has no field
// recording IR validity, so that exemption is simply not modeled: a pilot
// who actually holds a valid IR and hasn't flown a night landing in the
// preceding 90 days will be reported as not current on this tile even
// though FCL.060(b)(2) would exempt them from it. That fails SAFE.
func EasaNightPicCurrency(flights []CurrencyFlight, asOf time.Time, categoryClass, typeRating string) CurrencyResult {
	events := []QualifyingEvent{}
	for _, f := range withinDays(flights, asOf, easaRecencyWindowDays) {
		if !matchesAircraft(f, categoryClass, typeRating) {
			continue
		}
		if f.NightLandingsFullStop > 0 {
			events = append(events, QualifyingEvent{
				FlightID: f.ID, Date: f.Date, Counts: f.NightLandingsFullStop, AgesOutOn: AddDays(f.Date, easaRecencyWindowDays),
			})
		}
	}

	return build(
		"FCL.060(b)(2)", "Recency — night PIC (EASA)", events, easaNightPicLandingsRequired, asOf,
		func(missing int) string {
			return fmt.Sprintf("%d more night take-off and landing required", missing)
		},
		func(expiresOn time.Time) string {
			return fmt.Sprintf("One night take-off and landing before %s keeps this alive", fmtDate(expiresOn))
		},
	)
}

type instrumentSnapshot struct {
	approaches      []QualifyingEvent
	holding         *QualifyingEvent
	tracking        *QualifyingEvent
	approachTotal   int
	bindingApproach *QualifyingEvent
	expiresOn       *time.Time
}

// instrumentStateAt is the ordinary 61.57(c)(1) computation, evaluated as of
// `t`: six approaches, holding, and course tracking within the trailing 6
// calendar months of `t`. Factored out of InstrumentCurrency so it can also
// be evaluated at historical instants when reconstructing when currency
// actually lapsed.
func instrumentStateAt(categoryFlights []CurrencyFlight, t time.Time) instrumentSnapshot {
	inWindow := make([]CurrencyFlight, 0, len(categoryFlights))
	for _, f := range categoryFlights {
		expiry := EndOfCalendarMonthsAfter(f.Date, instrumentWindowMonths)
		if DaysBetween(f.Date, t) >= 0 && DaysBetween(t, expiry) >= 0 {
			inWindow = append(inWindow, f)
		}
	}
	sortFlightsNewestFirst(inWindow)

	approaches := []QualifyingEvent{}
	var holding, tracking *QualifyingEvent

	for _, f := range inWindow {
		agesOutOn := EndOfCalendarMonthsAfter(f.Date, instrumentWindowMonths)
		if f.Approaches > 0 {
			approaches = append(approaches, QualifyingEvent{FlightID: f.ID, Date: f.Date, Counts: f.Approaches, AgesOutOn: agesOutOn})
		}
		// Newest first, so the first one seen is the one that lasts longest.
		if f.Holding && holding == nil {
			holding = &QualifyingEvent{FlightID: f.ID, Date: f.Date, Counts: 1, AgesOutOn: agesOutOn}
		}
		if f.CourseTracking && tracking == nil {
			tracking = &QualifyingEvent{FlightID: f.ID, Date: f.Date, Counts: 1, AgesOutOn: agesOutOn}
		}
	}

	approachTotal := totalOf(approaches)
	bApproach := bindingEvent(approaches, instrumentApproachesRequired)

	// All three requirements must hold at once, so the rule dies with
	// whichever of them lapses first.
	var expiresOn *time.Time
	if bApproach != nil && holding != nil && tracking != nil {
		min := bApproach.AgesOutOn
		if holding.AgesOutOn.Before(min) {
			min = holding.AgesOutOn
		}
		if tracking.AgesOutOn.Before(min) {
			min = tracking.AgesOutOn
		}
		expiresOn = &min
	}

	return instrumentSnapshot{approaches, holding, tracking, approachTotal, bApproach, expiresOn}
}

// instrumentAnchor implements 61.57(d): reconstructs the date the pilot's
// (c) currency is legitimately good through — the "anchor" — by walking
// every candidate qualifying event (a flight carrying
// approaches/holding/tracking, or an IPC) in date order.
//
// A flight-only event advances the anchor only when it lands on or before
// the previous anchor's grace deadline (anchor + 6 calendar months) — that
// is exactly what 61.57(d) allows: requalifying solo within the grace
// period. An event arriving after that deadline is void: the anchor is left
// untouched, so it (and every later flight-only event, until an IPC) keeps
// failing the same grace check against that now-stale anchor. An IPC always
// resets the anchor unconditionally, since it is what the regulation
// requires at that point, and starts a fresh ordinary 6-month window from
// its own date.
func instrumentAnchor(categoryFlights []CurrencyFlight, asOf time.Time, lastIpc *time.Time) *time.Time {
	type anchorEvent struct {
		date time.Time
		ipc  bool
	}

	candidateDates := map[int64]time.Time{}
	for _, f := range categoryFlights {
		if f.Approaches > 0 || f.Holding || f.CourseTracking {
			candidateDates[f.Date.UnixNano()] = f.Date
		}
	}

	events := make([]anchorEvent, 0, len(candidateDates)+1)
	for _, t := range candidateDates {
		events = append(events, anchorEvent{date: t})
	}
	if lastIpc != nil {
		events = append(events, anchorEvent{date: *lastIpc, ipc: true})
	}
	for i := 1; i < len(events); i++ {
		for j := i; j > 0 && events[j].date.Before(events[j-1].date); j-- {
			events[j], events[j-1] = events[j-1], events[j]
		}
	}

	var anchor *time.Time
	for _, event := range events {
		if DaysBetween(event.date, asOf) < 0 {
			continue // in the future relative to asOf
		}

		if event.ipc {
			end := EndOfCalendarMonthsAfter(event.date, instrumentWindowMonths)
			anchor = &end
			continue
		}

		snapshot := instrumentStateAt(categoryFlights, event.date)
		if !(snapshot.approachTotal >= instrumentApproachesRequired && snapshot.holding != nil && snapshot.tracking != nil) {
			continue
		}
		withinGrace := anchor == nil || DaysBetween(event.date, EndOfCalendarMonthsAfter(*anchor, instrumentGraceMonths)) >= 0
		if withinGrace {
			anchor = snapshot.expiresOn
		}
	}

	return anchor
}

// InstrumentCurrency implements 61.57(c)(1)/(d) — within the preceding 6
// CALENDAR months: six instrument approaches, holding procedures and tasks,
// and intercepting and tracking courses. Per category, not class — like the
// approaches/holding/tracking it folds together, an IPC is flown in a
// specific aircraft, so lastIpc is the caller's most recent qualifying IPC
// FOR THIS CATEGORY, not a global one like FlightReviewCurrency's flight
// review.
//
// All three (c) requirements must be satisfied inside the window, so the
// rule expires on whichever of the three lapses first — UNLESS the pilot is
// past 61.57(d)'s one-time 6-calendar-month grace period since that lapse,
// in which case only a dated IPC (not more solo approaches) can restore it.
func InstrumentCurrency(flights []CurrencyFlight, asOf time.Time, categoryClass string, lastIpc *time.Time) CurrencyResult {
	category := CategoryOf(categoryClass)
	categoryFlights := make([]CurrencyFlight, 0, len(flights))
	for _, f := range flights {
		if CategoryOf(f.CategoryClass) == category {
			categoryFlights = append(categoryFlights, f)
		}
	}

	anchor := instrumentAnchor(categoryFlights, asOf, lastIpc)
	requiresIpc := anchor != nil && DaysBetween(asOf, EndOfCalendarMonthsAfter(*anchor, instrumentGraceMonths)) < 0

	// instrumentAnchor can only flag a lapsed grace period once it has
	// reconstructed a historical instant where all three (c)(1) elements
	// were satisfied at once. That reconstruction fails whenever the flight
	// data never happens to carry all three together — most commonly,
	// imported logbook data — even when the pilot plainly has old
	// instrument activity on record. Without this fallback that gap
	// silently reports "fly 6 approaches, holding, tracking" forever,
	// regardless of how long it has actually been, which is the unsafe
	// direction. No anchor ever having been established means no unbroken
	// currency chain exists to protect, so there is nothing for a later
	// solo flight to game: if the most recent instrument-related activity
	// on record is already older than the combined 12-calendar-month (c)/(d)
	// window, an IPC is required the same as if a real anchor had lapsed.
	if !requiresIpc && anchor == nil && lastIpc == nil {
		var mostRecentActivity *time.Time
		for _, f := range categoryFlights {
			if !(f.Approaches > 0 || f.Holding || f.CourseTracking) {
				continue
			}
			if mostRecentActivity == nil || f.Date.After(*mostRecentActivity) {
				d := f.Date
				mostRecentActivity = &d
			}
		}
		if mostRecentActivity != nil {
			requiresIpc = DaysBetween(asOf, EndOfCalendarMonthsAfter(*mostRecentActivity, instrumentWindowMonths+instrumentGraceMonths)) < 0
		}
	}

	if requiresIpc {
		// Fail safe: once the grace period is spent, nothing short of a
		// fresh IPC counts, so don't credit whatever approaches happen to
		// sit in the trailing window — that would look like ordinary
		// progress toward currency when it legally isn't.
		action := ipcRequiredAction
		return CurrencyResult{
			Rule: "61.57(c)(1)", Label: "Instrument", State: StateExpired,
			Have: 0, Need: instrumentApproachesRequired,
			Qualifying: []QualifyingEvent{}, Action: &action,
		}
	}

	// Not past grace: an IPC (if any) counts toward ordinary ongoing (c)
	// currency the same way a flight with six approaches, holding, and
	// tracking would — folding back into normal tracking.
	effectiveFlights := categoryFlights
	if lastIpc != nil {
		effectiveFlights = append(append([]CurrencyFlight{}, categoryFlights...), CurrencyFlight{
			ID: "ipc", Date: *lastIpc, CategoryClass: categoryClass, InstanceType: "real",
			Approaches: instrumentApproachesRequired, Holding: true, CourseTracking: true,
		})
	}

	snapshot := instrumentStateAt(effectiveFlights, asOf)
	var daysRemaining *int
	if snapshot.expiresOn != nil {
		d := DaysBetween(asOf, *snapshot.expiresOn)
		daysRemaining = &d
	}
	state := stateFor(daysRemaining)

	missing := []string{}
	if snapshot.approachTotal < instrumentApproachesRequired {
		missing = append(missing, fmt.Sprintf("%d more approaches", instrumentApproachesRequired-snapshot.approachTotal))
	}
	if snapshot.holding == nil {
		missing = append(missing, "holding procedures")
	}
	if snapshot.tracking == nil {
		missing = append(missing, "intercepting and tracking courses")
	}

	var action *string
	if state == StateExpired {
		s := "Instrument currency has lapsed"
		if len(missing) > 0 {
			s = "Needs " + joinStrings(missing, ", ")
		}
		action = &s
	} else if state == StateExpiring && snapshot.expiresOn != nil {
		s := fmt.Sprintf("Expires %s — fly approaches to stay ahead", fmtDate(*snapshot.expiresOn))
		action = &s
	}

	if snapshot.approaches == nil {
		snapshot.approaches = []QualifyingEvent{}
	}

	return CurrencyResult{
		Rule: "61.57(c)(1)", Label: "Instrument", State: state,
		Have: snapshot.approachTotal, Need: instrumentApproachesRequired,
		ExpiresOn: snapshot.expiresOn, DaysRemaining: daysRemaining,
		Qualifying: snapshot.approaches, Action: action,
	}
}

// latestOf returns the more recent of two nullable dates; nil only when
// both are.
func latestOf(a, b *time.Time) *time.Time {
	if a == nil {
		return b
	}
	if b == nil {
		return a
	}
	if a.After(*b) || a.Equal(*b) {
		return a
	}
	return b
}

// FlightReviewCurrency implements 61.56 — flight review within the
// preceding 24 calendar months. 61.56(d)(1) exempts a pilot from this
// requirement if they've passed a pilot proficiency check or practical test
// (checkride) within that same 24-calendar-month window, so the window runs
// from whichever of the two — the last flight review or the last checkride
// — is more recent.
func FlightReviewCurrency(lastReview, lastCheckride *time.Time, asOf time.Time) CurrencyResult {
	basis := latestOf(lastReview, lastCheckride)

	var expiresOn *time.Time
	if basis != nil {
		e := EndOfCalendarMonthsAfter(*basis, flightReviewMonths)
		expiresOn = &e
	}
	var daysRemaining *int
	if expiresOn != nil {
		d := DaysBetween(asOf, *expiresOn)
		daysRemaining = &d
	}
	state := stateFor(daysRemaining)

	have := 0
	if basis != nil {
		have = 1
	}

	var action *string
	if state == StateExpired {
		s := "A flight review is required before acting as pilot in command"
		action = &s
	} else if state == StateExpiring && expiresOn != nil {
		s := fmt.Sprintf("Due by %s", fmtDate(*expiresOn))
		action = &s
	}

	return CurrencyResult{
		Rule: "61.56", Label: "Flight review", State: state, Have: have, Need: 1,
		ExpiresOn: expiresOn, DaysRemaining: daysRemaining, Qualifying: []QualifyingEvent{}, Action: action,
	}
}

// MedicalDurationMonths implements 61.23(d) — a class's own medical
// validity window, in calendar months, per (d)(1)-(3). Each tier's duration
// is set purely by age at exam and is NOT stacked on any other tier's
// window: (d)(2)'s 12 months for second-class privileges runs from the exam
// date whether the certificate was issued as second-class or is a
// first-class certificate stepping down, and likewise for (d)(3)'s
// third-class window. That independence is what lets MedicalCurrency below
// turn the step-down ladder into a rank check instead of tracking per-tier
// boundaries itself.
func MedicalDurationMonths(cls string, ageAtExam int) int {
	switch cls {
	case "first":
		if ageAtExam < 40 {
			return 12
		}
		return 6
	case "second":
		return 12
	default: // "third"
		if ageAtExam < 40 {
			return 60
		}
		return 24
	}
}

// medicalClassRank ranks highest privilege first — used to check whether a
// held certificate class covers the privileges actually needed.
var medicalClassRank = map[string]int{"first": 0, "second": 1, "third": 2}

// MedicalClassLabels mirrors MEDICAL_CLASS_LABELS in
// packages/core/src/medical.ts.
var MedicalClassLabels = map[string]string{
	"first":  "First Class",
	"second": "Second Class",
	"third":  "Third Class",
}

var medicalClassLabels = MedicalClassLabels

// MedicalCurrency implements 61.23(d) — is the medical certificate current
// for `privilegesNeeded`?
//
// A medical certificate doesn't expire all at once: a first-class
// certificate is good for first-class privileges only for its own
// (12/6-month) window, then steps down to second-class privileges through
// (d)(2)'s 12 months, then to third-class through (d)(3)'s 60/24 months — a
// second-class certificate steps down the same way, straight to third.
// Because each tier's window is measured independently from the exam date
// (see MedicalDurationMonths), the step-down reduces to a single check: does
// the held class (cls) rank at or above privilegesNeeded? If so, the
// relevant window is just MedicalDurationMonths(privilegesNeeded, ageAtExam)
// — the class as issued doesn't matter beyond that. If the held class ranks
// below what's needed, this fails safe and reports no currency at any age.
//
// privilegesNeeded defaults to "third" (private privileges) by callers that
// don't yet track a pilot's certificate level — it's the tier every
// certificate class eventually steps down to, so it's also the fail-safe
// default.
func MedicalCurrency(issued *time.Time, cls string, ageAtExam int, asOf time.Time, privilegesNeeded string) CurrencyResult {
	if privilegesNeeded == "" {
		privilegesNeeded = "third"
	}
	heldPrivileges := medicalClassRank[cls] <= medicalClassRank[privilegesNeeded]

	var expiresOn *time.Time
	if issued != nil && heldPrivileges {
		e := EndOfCalendarMonthsAfter(*issued, MedicalDurationMonths(privilegesNeeded, ageAtExam))
		expiresOn = &e
	}
	var daysRemaining *int
	if expiresOn != nil {
		d := DaysBetween(asOf, *expiresOn)
		daysRemaining = &d
	}
	state := stateFor(daysRemaining)

	have := 0
	if issued != nil && heldPrivileges {
		have = 1
	}

	var action *string
	if state == StateExpired {
		var s string
		if heldPrivileges {
			s = "Medical certificate has expired"
		} else {
			s = fmt.Sprintf("A %s medical certificate (or higher) is required", medicalClassLabels[privilegesNeeded])
		}
		action = &s
	} else if state == StateExpiring && expiresOn != nil {
		s := fmt.Sprintf("Renew by %s", fmtDate(*expiresOn))
		action = &s
	}

	return CurrencyResult{
		Rule: "61.23", Label: fmt.Sprintf("Medical — %s class privileges", privilegesNeeded), State: state,
		Have: have, Need: 1, ExpiresOn: expiresOn, DaysRemaining: daysRemaining,
		Qualifying: []QualifyingEvent{}, Action: action,
	}
}

// BasicMedCurrency implements 14 CFR part 68 (BasicMed) — an alternate
// medical-currency pathway to the certificate-class ladder above, with its
// own two independent, concurrently required windows instead of a
// certificate class:
//
//   - A medical education course, completed within the preceding 24
//     calendar months.
//   - A comprehensive medical exam per the Comprehensive Medical Exam
//     Checklist (CMEC), completed by any state-licensed physician within
//     the preceding 48 calendar months.
//
// Both windows are required at once, so the rule expires at whichever
// lapses first. A missing date fails safe: it can't be current.
//
// BasicMed's one-time eligibility gate (an FAA medical certificate held at
// some point after 14 Jul 2006) and its operational limitations aren't
// tracked here — see the TS module's original doc comment for why.
func BasicMedCurrency(lastCourseCompleted, lastExamCompleted *time.Time, asOf time.Time) CurrencyResult {
	var courseExpiresOn, examExpiresOn *time.Time
	if lastCourseCompleted != nil {
		e := EndOfCalendarMonthsAfter(*lastCourseCompleted, basicMedCourseMonths)
		courseExpiresOn = &e
	}
	if lastExamCompleted != nil {
		e := EndOfCalendarMonthsAfter(*lastExamCompleted, basicMedExamMonths)
		examExpiresOn = &e
	}

	courseCurrent := courseExpiresOn != nil && DaysBetween(asOf, *courseExpiresOn) >= 0
	examCurrent := examExpiresOn != nil && DaysBetween(asOf, *examExpiresOn) >= 0
	have := 0
	if courseCurrent {
		have++
	}
	if examCurrent {
		have++
	}

	// Both windows must be open at once, so the rule can only report an
	// expiry when both dates are on record — a missing date is handled
	// below as an outright "not current" rather than a computable (past)
	// expiry.
	var expiresOn *time.Time
	if courseExpiresOn != nil && examExpiresOn != nil {
		min := *courseExpiresOn
		if examExpiresOn.Before(min) {
			min = *examExpiresOn
		}
		expiresOn = &min
	}
	var daysRemaining *int
	if expiresOn != nil {
		d := DaysBetween(asOf, *expiresOn)
		daysRemaining = &d
	}
	state := stateFor(daysRemaining)

	missing := []string{}
	if !courseCurrent {
		missing = append(missing, "a medical education course (within the preceding 24 calendar months)")
	}
	if !examCurrent {
		missing = append(missing, "a comprehensive medical exam / CMEC (within the preceding 48 calendar months)")
	}

	var action *string
	if state == StateExpired {
		s := "Needs " + joinStrings(missing, " and ")
		action = &s
	} else if state == StateExpiring && expiresOn != nil {
		s := fmt.Sprintf("Renew by %s", fmtDate(*expiresOn))
		action = &s
	}

	return CurrencyResult{
		Rule: "14 CFR 68", Label: "Medical — BasicMed", State: state, Have: have, Need: 2,
		ExpiresOn: expiresOn, DaysRemaining: daysRemaining, Qualifying: []QualifyingEvent{}, Action: action,
	}
}

// ageAt returns whole years old at `at`.
func ageAt(birthdate, at time.Time) int {
	age := at.Year() - birthdate.Year()
	hadBirthdayThisYear := at.Month() > birthdate.Month() ||
		(at.Month() == birthdate.Month() && at.Day() >= birthdate.Day())
	if !hadBirthdayThisYear {
		age--
	}
	return age
}

// birthdayAt returns the date `birthdate`'s holder turns `age` years old.
func birthdayAt(birthdate time.Time, age int) time.Time {
	return time.Date(birthdate.Year()+age, birthdate.Month(), birthdate.Day(), 0, 0, 0, 0, birthdate.Location())
}

// EasaMedicalClassLabels mirrors EASA_MEDICAL_CLASS_LABELS in
// packages/core/src/medical.ts.
var EasaMedicalClassLabels = map[string]string{
	"lapl":   "LAPL medical",
	"class2": "Class 2",
}

var easaMedicalClassLabels = EasaMedicalClassLabels

// EasaMedicalDurationMonths implements EASA Part-MED, MED.A.045 — LAPL
// medical and Class 2 certificate validity, in calendar months, keyed by age
// at the examination. Class 1 (commercial) is out of scope.
//
// The duration is fixed once at the exam by age at that exam — NOT
// truncated mid-term the instant a pilot's age crosses a band boundary. A
// pilot examined at 39 keeps the full 60-month certificate after turning 40
// partway through it.
//
//   - under 40 at exam: 60 months (both classes)
//   - 40 up to 50 at exam: 24 months (both classes)
//   - 50 or older at exam: 12 months — CLASS 2 ONLY. LAPL has no third
//     tier: an exam at 40 or any older age is still just 24 months.
//
// Separately from this fixed-at-exam duration, MED.A.045 also gives every
// certificate an absolute cessation age that applies regardless of issue
// date — see easaUnder40CessationAge / easaClass2Under50CessationAge. This
// function reports only the nominal per-tier duration; EasaMedicalCurrency
// applies the cessation cap on top of it.
func EasaMedicalDurationMonths(cls string, ageAtExam int) int {
	if ageAtExam < 40 {
		return 60
	}
	if cls == "class2" && ageAtExam >= 50 {
		return 12
	}
	return 24
}

// EasaMedicalCurrency implements EASA Part-MED, MED.A.045 — is the
// LAPL/Class 2 medical certificate current? Takes a raw birthdate rather
// than a precomputed age: unlike the FAA ladder, MED.A.045's cessation cap
// needs the pilot's actual birthdate to find the specific date they turn 42
// or 51.
//
// Class 1 (commercial) and FCL.740/FCL.625 (rating revalidation) are out of
// scope — same gaps the FAA-side functions have for certificate/rating
// tiers this app doesn't track.
func EasaMedicalCurrency(birthdate, issued *time.Time, cls string, asOf time.Time) CurrencyResult {
	label := fmt.Sprintf("Medical — %s (EASA)", easaMedicalClassLabels[cls])
	have := 0
	if birthdate != nil && issued != nil {
		have = 1
	}

	var expiresOn *time.Time
	if birthdate != nil && issued != nil {
		ageAtExam := ageAt(*birthdate, *issued)
		baseExpiry := AddCalendarMonths(*issued, EasaMedicalDurationMonths(cls, ageAtExam))

		var cessationCap *time.Time
		if ageAtExam < 40 {
			c := birthdayAt(*birthdate, easaUnder40CessationAge)
			cessationCap = &c
		} else if cls == "class2" && ageAtExam < 50 {
			c := birthdayAt(*birthdate, easaClass2Under50CessationAge)
			cessationCap = &c
		}

		if cessationCap != nil && cessationCap.Before(baseExpiry) {
			expiresOn = cessationCap
		} else {
			expiresOn = &baseExpiry
		}
	}

	var daysRemaining *int
	if expiresOn != nil {
		d := DaysBetween(asOf, *expiresOn)
		daysRemaining = &d
	}
	state := stateFor(daysRemaining)

	var action *string
	if state == StateExpired {
		var s string
		if have == 1 {
			s = "EASA medical certificate has expired"
		} else {
			s = "Set a birthdate and medical issue date to compute EASA medical currency"
		}
		action = &s
	} else if state == StateExpiring && expiresOn != nil {
		s := fmt.Sprintf("Renew by %s", fmtDate(*expiresOn))
		action = &s
	}

	return CurrencyResult{
		Rule: "MED.A.045", Label: label, State: state, Have: have, Need: 1,
		ExpiresOn: expiresOn, DaysRemaining: daysRemaining, Qualifying: []QualifyingEvent{}, Action: action,
	}
}

var monthAbbrev = [...]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

func fmtDate(date time.Time) string {
	return fmt.Sprintf("%02d %s %d", date.Day(), monthAbbrev[date.Month()-1], date.Year())
}

func joinStrings(parts []string, sep string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += sep
		}
		out += p
	}
	return out
}
