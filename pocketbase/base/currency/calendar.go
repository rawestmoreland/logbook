// Package currency implements 14 CFR part 61 / EASA Part-FCL/MED currency
// rules server-side. Ported from packages/core/src/currency/{calendar,rules}.ts —
// that TypeScript module is retired once this package ships; there is no
// lockstep to maintain going forward.
package currency

import "time"

// Date arithmetic for part 61 currency windows.
//
// Two different clocks appear in the regulations and they are NOT
// interchangeable:
//
//   - 61.57(a) and 61.57(b) use 90 DAYS — plain rolling days.
//   - 61.57(c), 61.56 and 61.23 use CALENDAR MONTHS — the privilege
//     survives to the END of the final month, whatever day you flew.
//
// Conflating them is the classic logbook bug: an approach flown 15 Mar is
// good through 30 Sep, not through 15 Sep. Sixteen extra days of legality.
//
// Everything here is local-midnight date arithmetic. A logbook entry is a
// calendar date, not an instant.

// StartOfDay returns local midnight on the same calendar date.
func StartOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// DaysBetween returns whole calendar days from `from` to `to`; negative when
// `to` precedes `from`.
func DaysBetween(from, to time.Time) int {
	a := StartOfDay(from)
	b := StartOfDay(to)
	return int(b.Sub(a).Hours() / 24)
}

// AddDays returns `date` plus `days`, normalized to local midnight.
func AddDays(date time.Time, days int) time.Time {
	return StartOfDay(date).AddDate(0, 0, days)
}

// EndOfCalendarMonthsAfter returns the last day of the calendar month
// `months` after the month of `date`.
//
// Day 0 of month N is the last day of month N-1, and Go's time.Date
// normalizes month overflow into the next year, so this handles both the
// year boundary and short months (31 Aug + 6 -> 28/29 Feb) without cases.
func EndOfCalendarMonthsAfter(date time.Time, months int) time.Time {
	return time.Date(date.Year(), date.Month()+time.Month(months)+1, 0, 0, 0, 0, 0, date.Location())
}

// AddCalendarMonths returns `date` plus `months`, landing on the same day of
// the month (time.Date normalizes both year rollover and day-of-month
// overflow for short months, same as EndOfCalendarMonthsAfter above). Used
// for EASA medical certificate validity, which expires on the certificate's
// own anniversary date rather than at the end of a calendar month.
func AddCalendarMonths(date time.Time, months int) time.Time {
	d := StartOfDay(date)
	return time.Date(d.Year(), d.Month()+time.Month(months), d.Day(), 0, 0, 0, 0, d.Location())
}
