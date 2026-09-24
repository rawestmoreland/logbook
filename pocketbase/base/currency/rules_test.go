package currency

import (
	"testing"
	"time"
)

// d parses "YYYY-MM-DD" into a local-midnight time.Time, mirroring the `d`
// helper in the retired rules.test.ts.
func d(iso string) time.Time {
	t, err := time.ParseInLocation("2006-01-02", iso, time.Local)
	if err != nil {
		panic(err)
	}
	return t
}

func dp(iso string) *time.Time {
	t := d(iso)
	return &t
}

var asof = d("2026-09-12")

type flightOpts struct {
	id                    string
	date                  time.Time
	categoryClass         string
	instanceType          string
	tailwheel             bool
	typeRating            string
	totalLandings         int
	dayLandingsFullStop   int
	nightLandingsFullStop int
	approaches            int
	holding               bool
	courseTracking        bool
}

func flight(o flightOpts) CurrencyFlight {
	categoryClass := o.categoryClass
	if categoryClass == "" {
		categoryClass = "airplane_single_engine_land"
	}
	instanceType := o.instanceType
	if instanceType == "" {
		instanceType = "real"
	}
	return CurrencyFlight{
		ID: o.id, Date: o.date, CategoryClass: categoryClass, InstanceType: instanceType,
		Tailwheel: o.tailwheel, TypeRating: o.typeRating,
		TotalLandings: o.totalLandings, DayLandingsFullStop: o.dayLandingsFullStop,
		NightLandingsFullStop: o.nightLandingsFullStop,
		Approaches:            o.approaches, Holding: o.holding, CourseTracking: o.courseTracking,
	}
}

func ifr(id, date string, approaches int) CurrencyFlight {
	return flight(flightOpts{id: id, date: d(date), approaches: approaches, holding: true, courseTracking: true})
}

func wantTime(t *testing.T, label string, got *time.Time, want *time.Time) {
	t.Helper()
	if want == nil {
		if got != nil {
			t.Errorf("%s: got %v, want nil", label, got)
		}
		return
	}
	if got == nil || !got.Equal(*want) {
		t.Errorf("%s: got %v, want %v", label, got, *want)
	}
}

func wantInt(t *testing.T, label string, got, want int) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %d, want %d", label, got, want)
	}
}

func wantIntPtr(t *testing.T, label string, got *int, want *int) {
	t.Helper()
	if want == nil {
		if got != nil {
			t.Errorf("%s: got %v, want nil", label, *got)
		}
		return
	}
	if got == nil || *got != *want {
		t.Errorf("%s: got %v, want %d", label, got, *want)
	}
}

func intp(v int) *int { return &v }

func wantState(t *testing.T, label string, got, want CurrencyState) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got state %q, want %q", label, got, want)
	}
}

func wantAction(t *testing.T, label string, got *string, want string) {
	t.Helper()
	if got == nil {
		t.Errorf("%s: got nil action, want %q", label, want)
		return
	}
	if *got != want {
		t.Errorf("%s: got action %q, want %q", label, *got, want)
	}
}

// --- dayPassengerCurrency — 61.57(a)(1) ---

func TestDayPassengerCurrency(t *testing.T) {
	t.Run("is current on three landings inside 90 days", func(t *testing.T) {
		r := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), totalLandings: 1}),
			flight(flightOpts{id: "b", date: d("2026-08-20"), totalLandings: 1}),
			flight(flightOpts{id: "c", date: d("2026-07-30"), totalLandings: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantState(t, "state", r.State, StateCurrent)
		wantInt(t, "have", r.Have, 3)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-10-28"))
		wantIntPtr(t, "daysRemaining", r.DaysRemaining, intp(46))
	})

	t.Run("expires when only two landings remain in the window", func(t *testing.T) {
		r := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), totalLandings: 1}),
			flight(flightOpts{id: "b", date: d("2026-08-20"), totalLandings: 1}),
			flight(flightOpts{id: "old", date: d("2026-05-01"), totalLandings: 9}),
		}, asof, "airplane_single_engine_land", "")
		wantState(t, "state", r.State, StateExpired)
		wantInt(t, "have", r.Have, 2)
		wantAction(t, "action", r.Action, "1 more takeoff and landing required")
	})

	t.Run("counts a landing exactly 90 days old and drops one at 91", func(t *testing.T) {
		at90 := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-06-14"), totalLandings: 3}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "at90.have", at90.Have, 3)
		wantIntPtr(t, "at90.daysRemaining", at90.DaysRemaining, intp(0))

		at91 := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-06-13"), totalLandings: 3}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "at91.have", at91.Have, 0)
		wantState(t, "at91.state", at91.State, StateExpired)
	})

	t.Run("credits night full-stop landings toward the day requirement", func(t *testing.T) {
		r := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), totalLandings: 3, nightLandingsFullStop: 3}),
		}, asof, "airplane_single_engine_land", "")
		wantState(t, "state", r.State, StateCurrent)
		wantInt(t, "have", r.Have, 3)
	})

	t.Run("ignores landings in a different class", func(t *testing.T) {
		r := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "sea", date: d("2026-09-09"), totalLandings: 5, categoryClass: "airplane_single_engine_sea"}),
			flight(flightOpts{id: "land", date: d("2026-09-08"), totalLandings: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 1)
		wantState(t, "state", r.State, StateExpired)
	})

	t.Run("requires landings in type when a type rating applies", func(t *testing.T) {
		flights := []CurrencyFlight{
			flight(flightOpts{id: "cj", date: d("2026-09-09"), totalLandings: 3, typeRating: "CE-525"}),
			flight(flightOpts{id: "other", date: d("2026-09-08"), totalLandings: 3, typeRating: "CE-510"}),
		}
		wantInt(t, "in-type", DayPassengerCurrency(flights, asof, "airplane_single_engine_land", "CE-525").Have, 3)
		wantInt(t, "other-type", DayPassengerCurrency(flights, asof, "airplane_single_engine_land", "LR-45").Have, 0)
	})

	t.Run("does not credit tailwheel landings that are not proven full stop", func(t *testing.T) {
		unproven := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "cub", date: d("2026-09-09"), totalLandings: 5, tailwheel: true}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "unproven.have", unproven.Have, 0)

		proven := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "cub", date: d("2026-09-09"), totalLandings: 5, dayLandingsFullStop: 3, tailwheel: true}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "proven.have", proven.Have, 3)
		wantState(t, "proven.state", proven.State, StateCurrent)
	})

	t.Run("reports the flights carrying the currency, newest first", func(t *testing.T) {
		r := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "old", date: d("2026-07-30"), totalLandings: 1}),
			flight(flightOpts{id: "new", date: d("2026-09-09"), totalLandings: 1}),
			flight(flightOpts{id: "mid", date: d("2026-08-20"), totalLandings: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantFlightIDOrder(t, r.Qualifying, "new", "mid", "old")
		wantTime(t, "qualifying[0].agesOutOn", &r.Qualifying[0].AgesOutOn, dp("2026-12-08"))
	})

	t.Run("gives no credit for landings flown in a simulator or ATD", func(t *testing.T) {
		r := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "sim", date: d("2026-09-09"), totalLandings: 5, instanceType: "certified_atd"}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 0)
		wantState(t, "state", r.State, StateExpired)
	})

	t.Run("only credits the real-aircraft flights out of a mix of real and simulator", func(t *testing.T) {
		r := DayPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "sim", date: d("2026-09-09"), totalLandings: 9, instanceType: "uncertified_sim"}),
			flight(flightOpts{id: "real-a", date: d("2026-09-08"), totalLandings: 2}),
			flight(flightOpts{id: "real-b", date: d("2026-09-07"), totalLandings: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 3)
		wantState(t, "state", r.State, StateCurrent)
		wantFlightIDOrder(t, r.Qualifying, "real-a", "real-b")
	})
}

func wantFlightIDOrder(t *testing.T, events []QualifyingEvent, ids ...string) {
	t.Helper()
	if len(events) != len(ids) {
		t.Fatalf("got %d qualifying events, want %d", len(events), len(ids))
	}
	for i, id := range ids {
		if events[i].FlightID != id {
			t.Errorf("qualifying[%d]: got %q, want %q", i, events[i].FlightID, id)
		}
	}
}

// --- nightPassengerCurrency — 61.57(b) ---

func TestNightPassengerCurrency(t *testing.T) {
	t.Run("counts only full-stop night landings", func(t *testing.T) {
		r := NightPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), totalLandings: 9, nightLandingsFullStop: 0}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 0)
		wantState(t, "state", r.State, StateExpired)
		wantAction(t, "action", r.Action, "3 more full-stop night landings required")
	})

	t.Run("expires on the oldest of the three counted landings", func(t *testing.T) {
		r := NightPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-06"), nightLandingsFullStop: 1}),
			flight(flightOpts{id: "b", date: d("2026-08-18"), nightLandingsFullStop: 1}),
			flight(flightOpts{id: "c", date: d("2026-08-04"), nightLandingsFullStop: 2}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 4)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-11-02"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("flags expiring inside the 30-day warning band", func(t *testing.T) {
		r := NightPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-06-20"), nightLandingsFullStop: 3}),
		}, asof, "airplane_single_engine_land", "")
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-09-18"))
		wantIntPtr(t, "daysRemaining", r.DaysRemaining, intp(6))
		wantState(t, "state", r.State, StateExpiring)
	})

	t.Run("gives no credit for night landings flown in a simulator or ATD", func(t *testing.T) {
		r := NightPassengerCurrency([]CurrencyFlight{
			flight(flightOpts{id: "sim", date: d("2026-09-09"), nightLandingsFullStop: 3, instanceType: "certified_ifr_landings_sim"}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 0)
		wantState(t, "state", r.State, StateExpired)
	})
}

// --- easaRecencyCurrency — FCL.060(b)(1) ---

func TestEasaRecencyCurrency(t *testing.T) {
	t.Run("is current on three landings inside 90 days", func(t *testing.T) {
		r := EasaRecencyCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), totalLandings: 1}),
			flight(flightOpts{id: "b", date: d("2026-08-20"), totalLandings: 1}),
			flight(flightOpts{id: "c", date: d("2026-07-30"), totalLandings: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantState(t, "state", r.State, StateCurrent)
		wantInt(t, "have", r.Have, 3)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-10-28"))
	})

	t.Run("unifies day and night landings into a single count, unlike 61.57(a)/(b)", func(t *testing.T) {
		r := EasaRecencyCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), totalLandings: 1}),
			flight(flightOpts{id: "b", date: d("2026-08-20"), totalLandings: 2, nightLandingsFullStop: 2}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 3)
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("expires when only two landings remain in the window", func(t *testing.T) {
		r := EasaRecencyCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), totalLandings: 1}),
			flight(flightOpts{id: "b", date: d("2026-08-20"), totalLandings: 1}),
			flight(flightOpts{id: "old", date: d("2026-05-01"), totalLandings: 9}),
		}, asof, "airplane_single_engine_land", "")
		wantState(t, "state", r.State, StateExpired)
		wantInt(t, "have", r.Have, 2)
		wantAction(t, "action", r.Action, "1 more take-off and landing required")
	})

	t.Run("counts a landing exactly 90 days old and drops one at 91", func(t *testing.T) {
		at90 := EasaRecencyCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-06-14"), totalLandings: 3}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "at90.have", at90.Have, 3)
		wantIntPtr(t, "at90.daysRemaining", at90.DaysRemaining, intp(0))

		at91 := EasaRecencyCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-06-13"), totalLandings: 3}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "at91.have", at91.Have, 0)
		wantState(t, "at91.state", at91.State, StateExpired)
	})

	t.Run("ignores landings in a different class", func(t *testing.T) {
		r := EasaRecencyCurrency([]CurrencyFlight{
			flight(flightOpts{id: "sea", date: d("2026-09-09"), totalLandings: 5, categoryClass: "airplane_single_engine_sea"}),
			flight(flightOpts{id: "land", date: d("2026-09-08"), totalLandings: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 1)
		wantState(t, "state", r.State, StateExpired)
	})

	t.Run("requires landings in type when a type rating applies", func(t *testing.T) {
		flights := []CurrencyFlight{
			flight(flightOpts{id: "cj", date: d("2026-09-09"), totalLandings: 3, typeRating: "CE-525"}),
			flight(flightOpts{id: "other", date: d("2026-09-08"), totalLandings: 3, typeRating: "CE-510"}),
		}
		wantInt(t, "in-type", EasaRecencyCurrency(flights, asof, "airplane_single_engine_land", "CE-525").Have, 3)
		wantInt(t, "other-type", EasaRecencyCurrency(flights, asof, "airplane_single_engine_land", "LR-45").Have, 0)
	})

	t.Run("gives no credit for landings flown in a simulator or ATD, fail-safe on unmodeled FFS credit", func(t *testing.T) {
		r := EasaRecencyCurrency([]CurrencyFlight{
			flight(flightOpts{id: "sim", date: d("2026-09-09"), totalLandings: 5, instanceType: "certified_ifr_landings_sim"}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 0)
		wantState(t, "state", r.State, StateExpired)
	})
}

// --- easaNightPicCurrency — FCL.060(b)(2) ---

func TestEasaNightPicCurrency(t *testing.T) {
	t.Run("requires only one night landing in the preceding 90 days", func(t *testing.T) {
		r := EasaNightPicCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), nightLandingsFullStop: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantState(t, "state", r.State, StateCurrent)
		wantInt(t, "have", r.Have, 1)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-12-08"))
	})

	t.Run("is not satisfied by day landings alone", func(t *testing.T) {
		r := EasaNightPicCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-09-09"), totalLandings: 9}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 0)
		wantState(t, "state", r.State, StateExpired)
		wantAction(t, "action", r.Action, "1 more night take-off and landing required")
	})

	t.Run("drops the landing once it ages past 90 days", func(t *testing.T) {
		at90 := EasaNightPicCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-06-14"), nightLandingsFullStop: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "at90.have", at90.Have, 1)

		at91 := EasaNightPicCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-06-13"), nightLandingsFullStop: 1}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "at91.have", at91.Have, 0)
		wantState(t, "at91.state", at91.State, StateExpired)
	})

	t.Run("gives no credit for a night landing flown in a simulator or ATD", func(t *testing.T) {
		r := EasaNightPicCurrency([]CurrencyFlight{
			flight(flightOpts{id: "sim", date: d("2026-09-09"), nightLandingsFullStop: 3, instanceType: "certified_ifr_landings_sim"}),
		}, asof, "airplane_single_engine_land", "")
		wantInt(t, "have", r.Have, 0)
		wantState(t, "state", r.State, StateExpired)
	})
}

// --- instrumentCurrency — 61.57(c)(1) ---

func TestInstrumentCurrency(t *testing.T) {
	t.Run("expires at the END of the sixth calendar month, not on a rolling date", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{ifr("a", "2026-04-05", 6)}, asof, "airplane_single_engine_land", nil)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-10-31"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("expires on whichever of approaches, holding or tracking lapses first", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{
			flight(flightOpts{id: "recent", date: d("2026-08-01"), approaches: 6}),
			flight(flightOpts{id: "tasks", date: d("2026-04-10"), holding: true, courseTracking: true}),
		}, asof, "airplane_single_engine_land", nil)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-10-31"))
	})

	t.Run("is not current on approaches alone", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{
			flight(flightOpts{id: "a", date: d("2026-08-01"), approaches: 8}),
		}, asof, "airplane_single_engine_land", nil)
		wantState(t, "state", r.State, StateExpired)
		wantInt(t, "have", r.Have, 8)
		wantAction(t, "action", r.Action, "Needs holding procedures, intercepting and tracking courses")
	})

	t.Run("accumulates approaches across flights", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{
			ifr("a", "2026-08-01", 2), ifr("b", "2026-07-04", 2), ifr("c", "2026-06-15", 2),
		}, asof, "airplane_single_engine_land", nil)
		wantInt(t, "have", r.Have, 6)
		wantState(t, "state", r.State, StateCurrent)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-12-31"))
	})

	t.Run("names what is short when approaches are missing", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{ifr("a", "2026-08-01", 4)}, asof, "airplane_single_engine_land", nil)
		wantState(t, "state", r.State, StateExpired)
		wantAction(t, "action", r.Action, "Needs 2 more approaches")
	})

	t.Run("matches on category, so a multi-engine approach counts for a single", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{
			flight(flightOpts{id: "me", date: d("2026-08-01"), approaches: 6, holding: true, courseTracking: true, categoryClass: "airplane_multi_engine_land"}),
		}, asof, "airplane_single_engine_land", nil)
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("does not count a helicopter approach toward airplane currency", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{
			flight(flightOpts{id: "heli", date: d("2026-08-01"), approaches: 6, holding: true, courseTracking: true, categoryClass: "rotorcraft_helicopter"}),
		}, asof, "airplane_single_engine_land", nil)
		wantState(t, "state", r.State, StateExpired)
		wantInt(t, "have", r.Have, 0)
	})

	t.Run("drops approaches once the calendar window closes", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{ifr("a", "2026-02-20", 6)}, asof, "airplane_single_engine_land", nil)
		wantInt(t, "have", r.Have, 0)
		wantState(t, "state", r.State, StateExpired)
	})

	t.Run("still credits a simulator/ATD flight's approaches, holding, and tracking", func(t *testing.T) {
		r := InstrumentCurrency([]CurrencyFlight{
			flight(flightOpts{id: "sim", date: d("2026-08-01"), approaches: 6, holding: true, courseTracking: true, instanceType: "certified_ifr_sim"}),
		}, asof, "airplane_single_engine_land", nil)
		wantState(t, "state", r.State, StateCurrent)
		wantInt(t, "have", r.Have, 6)
	})

	t.Run("61.57(d) grace period and IPC", func(t *testing.T) {
		t.Run("restores currency on solo approaches flown inside the grace window", func(t *testing.T) {
			r := InstrumentCurrency([]CurrencyFlight{
				ifr("lapsed", "2025-01-15", 6),
				ifr("restored", "2025-10-01", 6),
			}, d("2025-10-15"), "airplane_single_engine_land", nil)
			wantState(t, "state", r.State, StateCurrent)
			wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-04-30"))
		})

		t.Run("is NOT restored by solo approaches flown after the grace window has closed", func(t *testing.T) {
			r := InstrumentCurrency([]CurrencyFlight{
				ifr("lapsed", "2025-01-15", 6),
				ifr("too-late", "2026-03-01", 6),
			}, d("2026-03-05"), "airplane_single_engine_land", nil)
			wantState(t, "state", r.State, StateExpired)
			wantTime(t, "expiresOn", r.ExpiresOn, nil)
			wantAction(t, "action", r.Action, ipcRequiredAction)
		})

		t.Run("is restored by a dated IPC flown after the grace window closed, with a fresh 6-month clock", func(t *testing.T) {
			r := InstrumentCurrency([]CurrencyFlight{
				ifr("lapsed", "2025-01-15", 6),
			}, d("2026-06-10"), "airplane_single_engine_land", dp("2026-06-01"))
			wantState(t, "state", r.State, StateCurrent)
			wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-12-31"))
		})

		t.Run("gives an IPC no effect when it is dated before the lapse it would need to cure", func(t *testing.T) {
			r := InstrumentCurrency([]CurrencyFlight{
				ifr("lapsed", "2025-01-15", 6),
			}, d("2026-06-01"), "airplane_single_engine_land", dp("2020-01-01"))
			wantState(t, "state", r.State, StateExpired)
			wantTime(t, "expiresOn", r.ExpiresOn, nil)
			wantAction(t, "action", r.Action, ipcRequiredAction)
		})

		t.Run("requires an IPC when no flight ever carried all three elements at once, and the stale activity is past the 12-month window", func(t *testing.T) {
			r := InstrumentCurrency([]CurrencyFlight{
				flight(flightOpts{id: "old", date: d("2024-01-05"), approaches: 6, holding: true, courseTracking: false}),
			}, d("2026-09-12"), "airplane_single_engine_land", nil)
			wantState(t, "state", r.State, StateExpired)
			wantTime(t, "expiresOn", r.ExpiresOn, nil)
			wantAction(t, "action", r.Action, ipcRequiredAction)
		})

		t.Run("does not require an IPC for the same incomplete data when it is still recent", func(t *testing.T) {
			r := InstrumentCurrency([]CurrencyFlight{
				flight(flightOpts{id: "recent", date: d("2026-08-20"), approaches: 6, holding: true, courseTracking: false}),
			}, d("2026-09-12"), "airplane_single_engine_land", nil)
			wantState(t, "state", r.State, StateExpired)
			wantAction(t, "action", r.Action, "Needs intercepting and tracking courses")
		})

		t.Run("does not require an IPC for a pilot with no instrument activity on record at all", func(t *testing.T) {
			r := InstrumentCurrency(nil, d("2026-09-12"), "airplane_single_engine_land", nil)
			wantState(t, "state", r.State, StateExpired)
			wantAction(t, "action", r.Action, "Needs 6 more approaches, holding procedures, intercepting and tracking courses")
		})
	})
}

// --- flightReviewCurrency — 61.56 ---

func TestFlightReviewCurrency(t *testing.T) {
	t.Run("runs 24 calendar months to the end of the month", func(t *testing.T) {
		r := FlightReviewCurrency(dp("2026-07-14"), nil, asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2028-07-31"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("is expired with no review on record", func(t *testing.T) {
		r := FlightReviewCurrency(nil, nil, asof)
		wantState(t, "state", r.State, StateExpired)
		wantTime(t, "expiresOn", r.ExpiresOn, nil)
	})

	t.Run("is expired once the window has closed", func(t *testing.T) {
		r := FlightReviewCurrency(dp("2024-06-10"), nil, asof)
		wantState(t, "state", r.State, StateExpired)
		wantAction(t, "action", r.Action, "A flight review is required before acting as pilot in command")
	})

	t.Run("61.56(d): a checkride alone satisfies currency the same as a flight review", func(t *testing.T) {
		r := FlightReviewCurrency(nil, dp("2026-07-14"), asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2028-07-31"))
		wantState(t, "state", r.State, StateCurrent)
		wantInt(t, "have", r.Have, 1)
	})

	t.Run("61.56(d): takes the more recent of a checkride and a flight review when the checkride is newer", func(t *testing.T) {
		r := FlightReviewCurrency(dp("2024-01-05"), dp("2026-07-14"), asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2028-07-31"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("61.56(d): takes the more recent of a checkride and a flight review when the review is newer", func(t *testing.T) {
		r := FlightReviewCurrency(dp("2026-07-14"), dp("2024-01-05"), asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2028-07-31"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("61.56(d): an old checkride does not save a lapsed flight review", func(t *testing.T) {
		r := FlightReviewCurrency(dp("2024-06-10"), dp("2023-01-01"), asof)
		wantState(t, "state", r.State, StateExpired)
	})
}

// --- medicalCurrency — 61.23 ---

func TestMedicalDurationMonths(t *testing.T) {
	wantInt(t, "third<40", MedicalDurationMonths("third", 38), 60)
	wantInt(t, "third>=40", MedicalDurationMonths("third", 40), 24)
	wantInt(t, "first<40", MedicalDurationMonths("first", 39), 12)
	wantInt(t, "first>=40", MedicalDurationMonths("first", 41), 6)
	wantInt(t, "second-young", MedicalDurationMonths("second", 25), 12)
	wantInt(t, "second-old", MedicalDurationMonths("second", 55), 12)
}

func TestMedicalCurrency(t *testing.T) {
	t.Run("expires at the end of the calendar month", func(t *testing.T) {
		r := MedicalCurrency(dp("2025-03-02"), "third", 38, asof, "")
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2030-03-31"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("warns inside the 30-day band", func(t *testing.T) {
		r := MedicalCurrency(dp("2025-09-15"), "second", 45, asof, "second")
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-09-30"))
		wantState(t, "state", r.State, StateExpiring)
	})

	t.Run("defaults privilegesNeeded to third class", func(t *testing.T) {
		r := MedicalCurrency(dp("2025-03-02"), "third", 38, asof, "")
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2030-03-31"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("step-down (61.23(d)(1)-(3))", func(t *testing.T) {
		issued := dp("2026-01-15")

		t.Run("a first class past its own 6-month window is still current for second-class privileges", func(t *testing.T) {
			first := MedicalCurrency(issued, "first", 45, asof, "first")
			wantTime(t, "first.expiresOn", first.ExpiresOn, dp("2026-07-31"))
			wantState(t, "first.state", first.State, StateExpired)

			second := MedicalCurrency(issued, "first", 45, asof, "second")
			wantTime(t, "second.expiresOn", second.ExpiresOn, dp("2027-01-31"))
			wantState(t, "second.state", second.State, StateCurrent)
		})

		t.Run("past the second-class window but within the third-class window is current for third-class privileges", func(t *testing.T) {
			asOf := d("2027-06-01")
			second := MedicalCurrency(issued, "first", 45, asOf, "second")
			wantState(t, "second.state", second.State, StateExpired)

			third := MedicalCurrency(issued, "first", 45, asOf, "third")
			wantTime(t, "third.expiresOn", third.ExpiresOn, dp("2028-01-31"))
			wantState(t, "third.state", third.State, StateCurrent)
		})

		t.Run("past all three tiers reads expired", func(t *testing.T) {
			asOf := d("2028-06-01")
			r := MedicalCurrency(issued, "first", 45, asOf, "third")
			wantState(t, "state", r.State, StateExpired)
			wantTime(t, "expiresOn", r.ExpiresOn, dp("2028-01-31"))
		})

		t.Run("a second-class medical past its own window steps down to third-class privileges", func(t *testing.T) {
			secondIssued := dp("2025-06-10")
			asOf := d("2026-08-01")

			second := MedicalCurrency(secondIssued, "second", 35, asOf, "second")
			wantState(t, "second.state", second.State, StateExpired)

			third := MedicalCurrency(secondIssued, "second", 35, asOf, "third")
			wantTime(t, "third.expiresOn", third.ExpiresOn, dp("2030-06-30"))
			wantState(t, "third.state", third.State, StateCurrent)
		})

		t.Run("a third-class medical has no tier above it to step down from", func(t *testing.T) {
			thirdIssued := dp("2025-03-02")
			third := MedicalCurrency(thirdIssued, "third", 38, asof, "third")
			wantTime(t, "third.expiresOn", third.ExpiresOn, dp("2030-03-31"))
			wantState(t, "third.state", third.State, StateCurrent)

			wantState(t, "second-from-third", MedicalCurrency(thirdIssued, "third", 38, asof, "second").State, StateExpired)
			wantState(t, "first-from-third", MedicalCurrency(thirdIssued, "third", 38, asof, "first").State, StateExpired)
		})
	})
}

// --- basicMedCurrency — 14 CFR 68 ---

func TestBasicMedCurrency(t *testing.T) {
	t.Run("is current when both the course and exam windows are open", func(t *testing.T) {
		r := BasicMedCurrency(dp("2025-06-15"), dp("2023-01-10"), asof)
		wantState(t, "state", r.State, StateCurrent)
		wantInt(t, "have", r.Have, 2)
		wantInt(t, "need", r.Need, 2)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2027-01-31"))
	})

	t.Run("is expired when the course has lapsed but the exam has not", func(t *testing.T) {
		r := BasicMedCurrency(dp("2023-01-01"), dp("2025-06-01"), asof)
		wantState(t, "state", r.State, StateExpired)
		wantInt(t, "have", r.Have, 1)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2025-01-31"))
	})

	t.Run("is expired when the exam has lapsed but the course has not", func(t *testing.T) {
		r := BasicMedCurrency(dp("2025-06-01"), dp("2020-01-01"), asof)
		wantState(t, "state", r.State, StateExpired)
		wantInt(t, "have", r.Have, 1)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2024-01-31"))
	})

	t.Run("bands as expiring when the course window is the one closing soon", func(t *testing.T) {
		r := BasicMedCurrency(dp("2024-09-05"), dp("2023-01-01"), asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-09-30"))
		wantState(t, "state", r.State, StateExpiring)
		wantInt(t, "have", r.Have, 2)
	})

	t.Run("bands as expiring when the exam window is the one closing soon", func(t *testing.T) {
		r := BasicMedCurrency(dp("2025-06-01"), dp("2022-09-05"), asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-09-30"))
		wantState(t, "state", r.State, StateExpiring)
		wantInt(t, "have", r.Have, 2)
	})

	t.Run("reads null dates as not current without throwing", func(t *testing.T) {
		r := BasicMedCurrency(nil, nil, asof)
		wantState(t, "state", r.State, StateExpired)
		wantInt(t, "have", r.Have, 0)
		wantTime(t, "expiresOn", r.ExpiresOn, nil)
		wantIntPtr(t, "daysRemaining", r.DaysRemaining, nil)
	})

	t.Run("reads a single missing date as not current even if the other is current", func(t *testing.T) {
		courseOnly := BasicMedCurrency(dp("2025-06-01"), nil, asof)
		wantState(t, "courseOnly.state", courseOnly.State, StateExpired)
		wantInt(t, "courseOnly.have", courseOnly.Have, 1)
		wantTime(t, "courseOnly.expiresOn", courseOnly.ExpiresOn, nil)

		examOnly := BasicMedCurrency(nil, dp("2023-01-01"), asof)
		wantState(t, "examOnly.state", examOnly.State, StateExpired)
		wantInt(t, "examOnly.have", examOnly.Have, 1)
		wantTime(t, "examOnly.expiresOn", examOnly.ExpiresOn, nil)
	})
}

// --- easaMedicalDurationMonths / easaMedicalCurrency — MED.A.045 ---

func TestEasaMedicalDurationMonths(t *testing.T) {
	wantInt(t, "lapl<40", EasaMedicalDurationMonths("lapl", 38), 60)
	wantInt(t, "class2<40", EasaMedicalDurationMonths("class2", 38), 60)
	wantInt(t, "lapl-40", EasaMedicalDurationMonths("lapl", 40), 24)
	wantInt(t, "class2-40", EasaMedicalDurationMonths("class2", 40), 24)
	wantInt(t, "lapl-49", EasaMedicalDurationMonths("lapl", 49), 24)
	wantInt(t, "class2-49", EasaMedicalDurationMonths("class2", 49), 24)
	wantInt(t, "class2-50", EasaMedicalDurationMonths("class2", 50), 12)
	wantInt(t, "class2-65", EasaMedicalDurationMonths("class2", 65), 12)
	wantInt(t, "lapl-50", EasaMedicalDurationMonths("lapl", 50), 24)
	wantInt(t, "lapl-65", EasaMedicalDurationMonths("lapl", 65), 24)
}

func TestEasaMedicalCurrency(t *testing.T) {
	t.Run("expires on the exam anniversary date, not the end of the calendar month", func(t *testing.T) {
		r := EasaMedicalCurrency(dp("1990-05-20"), dp("2025-03-02"), "lapl", asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2030-03-02"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("at exactly 40, steps down to the 24-month band for both classes", func(t *testing.T) {
		birthdate := dp("1985-01-10")
		issued := dp("2025-01-10")
		wantTime(t, "lapl", EasaMedicalCurrency(birthdate, issued, "lapl", asof).ExpiresOn, dp("2027-01-10"))
		wantTime(t, "class2", EasaMedicalCurrency(birthdate, issued, "class2", asof).ExpiresOn, dp("2027-01-10"))
	})

	t.Run("does not truncate mid-term at the ordinary age-40 crossing — duration is fixed at the exam", func(t *testing.T) {
		birthdate := dp("1990-01-01")
		issued := dp("2029-06-01")
		r := EasaMedicalCurrency(birthdate, issued, "lapl", d("2031-01-01"))
		wantState(t, "state", r.State, StateCurrent)
	})

	t.Run("applies MED.A.045's absolute age-42 cessation cap on top of the fixed duration", func(t *testing.T) {
		birthdate := dp("1990-01-01")
		issued := dp("2029-06-01")
		r := EasaMedicalCurrency(birthdate, issued, "lapl", asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2032-01-01"))
	})

	t.Run("applies the Class 2 age-51 cessation cap for a 40-49 exam, but LAPL has no such cap", func(t *testing.T) {
		birthdate := dp("1976-03-01")
		issued := dp("2025-09-01")

		class2 := EasaMedicalCurrency(birthdate, issued, "class2", asof)
		wantTime(t, "class2.expiresOn", class2.ExpiresOn, dp("2027-03-01"))

		lapl := EasaMedicalCurrency(birthdate, issued, "lapl", asof)
		wantTime(t, "lapl.expiresOn", lapl.ExpiresOn, dp("2027-09-01"))
	})

	t.Run("warns inside the 30-day expiring band", func(t *testing.T) {
		r := EasaMedicalCurrency(dp("1990-01-01"), dp("2021-09-20"), "lapl", asof)
		wantTime(t, "expiresOn", r.ExpiresOn, dp("2026-09-20"))
		wantState(t, "state", r.State, StateExpiring)
	})

	t.Run("reads a missing birthdate or issue date as not current, without throwing", func(t *testing.T) {
		r := EasaMedicalCurrency(nil, nil, "class2", asof)
		wantState(t, "state", r.State, StateExpired)
		wantInt(t, "have", r.Have, 0)
		wantTime(t, "expiresOn", r.ExpiresOn, nil)
		wantIntPtr(t, "daysRemaining", r.DaysRemaining, nil)

		birthdateOnly := EasaMedicalCurrency(dp("1990-01-01"), nil, "lapl", asof)
		wantInt(t, "birthdateOnly.have", birthdateOnly.Have, 0)
		wantTime(t, "birthdateOnly.expiresOn", birthdateOnly.ExpiresOn, nil)

		issuedOnly := EasaMedicalCurrency(nil, dp("2023-01-01"), "lapl", asof)
		wantInt(t, "issuedOnly.have", issuedOnly.Have, 0)
		wantTime(t, "issuedOnly.expiresOn", issuedOnly.ExpiresOn, nil)
	})
}
