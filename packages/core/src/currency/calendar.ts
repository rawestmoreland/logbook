/**
 * Date arithmetic for part 61 currency windows.
 *
 * Two different clocks appear in the regulations and they are NOT
 * interchangeable:
 *
 *   - 61.57(a) and 61.57(b) use **90 days** — plain rolling days.
 *   - 61.57(c), 61.56 and 61.23 use **calendar months** — the privilege
 *     survives to the END of the final month, whatever day you flew.
 *
 * Conflating them is the classic logbook bug: an approach flown 15 Mar is
 * good through 30 Sep, not through 15 Sep. Sixteen extra days of legality.
 *
 * Everything here is local-midnight date arithmetic. A logbook entry is a
 * calendar date, not an instant — using UTC would roll the date backwards
 * for any pilot west of Greenwich.
 */

const MS_PER_DAY = 86_400_000;

/** Local midnight on the same calendar date. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days from `from` to `to`; negative when `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Last day of the calendar month `months` after the month of `date`.
 *
 * Day 0 of month N is the last day of month N-1, and the Date constructor
 * normalizes month overflow into the next year, so this handles both the
 * year boundary and short months (31 Aug + 6 -> 28/29 Feb) without cases.
 */
export function endOfCalendarMonthsAfter(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months + 1, 0);
}

/**
 * `date` plus `months`, landing on the same day of the month (the `Date`
 * constructor normalizes both year rollover and day-of-month overflow for
 * short months, same as `endOfCalendarMonthsAfter` above). Used for EASA
 * medical certificate validity, which expires on the certificate's own
 * anniversary date rather than at the end of a calendar month — unlike the
 * FAA's 61.23(d), which explicitly extends to month-end (see the module
 * comment above), EASA certificates state a day-precise expiry date.
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const d = startOfDay(date);
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
}

/** Whole calendar months from `from` to `to`, rounded down; negative if `to` precedes `from`. */
export function monthsBetween(from: Date, to: Date): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}
