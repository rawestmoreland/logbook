/**
 * 14 CFR part 61 currency rules.
 *
 * Every function is pure and takes an explicit `asOf` date — currency is always
 * evaluated against a moment, and defaulting to `new Date()` inside the rule
 * would make it untestable and would silently answer a different question on
 * either side of midnight.
 *
 * Where the rules are ambiguous this module fails SAFE: it under-reports
 * currency rather than over-reporting it. Telling a pilot they are current
 * when they are not is the one unacceptable error.
 */

import { categoryOf, type CategoryClass } from '../aircraft.js';
import type { MedicalClass } from '../medical.js';
import { addDays, daysBetween, endOfCalendarMonthsAfter } from './calendar.js';

/** How close to expiry counts as "expiring" rather than "current". */
export const EXPIRING_SOON_DAYS = 30;

const PASSENGER_WINDOW_DAYS = 90;
const PASSENGER_LANDINGS_REQUIRED = 3;
const INSTRUMENT_WINDOW_MONTHS = 6;
const INSTRUMENT_APPROACHES_REQUIRED = 6;
const FLIGHT_REVIEW_MONTHS = 24;

export type CurrencyState = 'current' | 'expiring' | 'expired';

/** The slice of a flight the currency rules actually read. */
export type CurrencyFlight = {
  id: string;
  date: Date;
  categoryClass: CategoryClass;
  /** Set only when the aircraft requires a type rating; 61.57(a) is type-specific then. */
  typeRating?: string | null;
  tailwheel?: boolean;
  /** Landings as sole manipulator, daytime. */
  dayLandings: number;
  /** Of `dayLandings`, how many were to a full stop. Required for tailwheel credit. */
  dayLandingsFullStop?: number;
  /** Full-stop landings between 1 hr after sunset and 1 hr before sunrise. */
  nightLandings: number;
  /** Instrument approaches performed and logged. */
  approaches?: number;
  holding?: boolean;
  courseTracking?: boolean;
};

/** One flight's contribution to a rule, and the date it stops counting. */
export type QualifyingEvent = {
  flightId: string;
  date: Date;
  counts: number;
  agesOutOn: Date;
};

export type CurrencyResult = {
  /** CFR citation, e.g. "61.57(a)(1)". */
  rule: string;
  label: string;
  state: CurrencyState;
  have: number;
  need: number;
  expiresOn: Date | null;
  daysRemaining: number | null;
  /** The specific flights carrying this currency, newest first. */
  qualifying: QualifyingEvent[];
  /** What to do to regain or hold it; null when comfortably current. */
  action: string | null;
};

function matchesAircraft(
  flight: CurrencyFlight,
  categoryClass: CategoryClass,
  typeRating?: string | null,
): boolean {
  if (flight.categoryClass !== categoryClass) return false;
  // 61.57(a)(2): when a type rating is required, the landings must be in type.
  if (typeRating) return flight.typeRating === typeRating;
  return true;
}

/**
 * The event that will break currency first: walking newest-first, the one that
 * carries the running total up to `need`. When it ages out the total drops below
 * the requirement, so its expiry is the whole rule's expiry.
 */
function bindingEvent(newestFirst: QualifyingEvent[], need: number): QualifyingEvent | null {
  let running = 0;
  for (const event of newestFirst) {
    running += event.counts;
    if (running >= need) return event;
  }
  return null;
}

function stateFor(daysRemaining: number | null): CurrencyState {
  if (daysRemaining === null || daysRemaining < 0) return 'expired';
  return daysRemaining <= EXPIRING_SOON_DAYS ? 'expiring' : 'current';
}

function totalOf(events: QualifyingEvent[]): number {
  return events.reduce((sum, e) => sum + e.counts, 0);
}

function build(
  rule: string,
  label: string,
  events: QualifyingEvent[],
  need: number,
  asOf: Date,
  shortfallAction: (missing: number) => string,
  holdAction: (expiresOn: Date) => string,
): CurrencyResult {
  const have = totalOf(events);
  const binding = bindingEvent(events, need);
  const expiresOn = binding ? binding.agesOutOn : null;
  const daysRemaining = expiresOn ? daysBetween(asOf, expiresOn) : null;
  const state = stateFor(daysRemaining);

  let action: string | null = null;
  if (state === 'expired') action = shortfallAction(Math.max(0, need - have));
  else if (state === 'expiring' && expiresOn) action = holdAction(expiresOn);

  return { rule, label, state, have, need, expiresOn, daysRemaining, qualifying: events, action };
}

/** Flights inside a rolling day window, newest first. */
function withinDays(flights: CurrencyFlight[], asOf: Date, days: number): CurrencyFlight[] {
  return flights
    .filter((f) => {
      const age = daysBetween(f.date, asOf);
      return age >= 0 && age <= days;
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * 61.57(a)(1) — three takeoffs and landings in the preceding 90 days, same
 * category and class (and type, when a type rating is required), as sole
 * manipulator. Night full-stop landings count here too: (b) adds a requirement,
 * it does not replace this one.
 *
 * Tailwheel airplanes (61.57(a)(1)(ii)) require the landings to be to a full
 * stop. When `tailwheel` is set and `dayLandingsFullStop` is absent we cannot
 * prove that, so those landings are not credited.
 */
export function dayPassengerCurrency(
  flights: CurrencyFlight[],
  asOf: Date,
  categoryClass: CategoryClass,
  typeRating?: string | null,
): CurrencyResult {
  const events: QualifyingEvent[] = [];
  for (const f of withinDays(flights, asOf, PASSENGER_WINDOW_DAYS)) {
    if (!matchesAircraft(f, categoryClass, typeRating)) continue;
    const day = f.tailwheel ? (f.dayLandingsFullStop ?? 0) : f.dayLandings;
    const counts = day + f.nightLandings;
    if (counts > 0) {
      events.push({
        flightId: f.id,
        date: f.date,
        counts,
        agesOutOn: addDays(f.date, PASSENGER_WINDOW_DAYS),
      });
    }
  }

  return build(
    '61.57(a)(1)',
    'Passengers — day',
    events,
    PASSENGER_LANDINGS_REQUIRED,
    asOf,
    (missing) => `${missing} more takeoff${missing === 1 ? '' : 's'} and landing${missing === 1 ? '' : 's'} required`,
    (expiresOn) => `One takeoff and landing before ${fmt(expiresOn)} keeps this alive`,
  );
}

/**
 * 61.57(b) — three takeoffs and three landings to a full stop at night
 * (1 hr after sunset to 1 hr before sunrise) in the preceding 90 days.
 */
export function nightPassengerCurrency(
  flights: CurrencyFlight[],
  asOf: Date,
  categoryClass: CategoryClass,
  typeRating?: string | null,
): CurrencyResult {
  const events: QualifyingEvent[] = [];
  for (const f of withinDays(flights, asOf, PASSENGER_WINDOW_DAYS)) {
    if (!matchesAircraft(f, categoryClass, typeRating)) continue;
    if (f.nightLandings > 0) {
      events.push({
        flightId: f.id,
        date: f.date,
        counts: f.nightLandings,
        agesOutOn: addDays(f.date, PASSENGER_WINDOW_DAYS),
      });
    }
  }

  return build(
    '61.57(b)',
    'Passengers — night',
    events,
    PASSENGER_LANDINGS_REQUIRED,
    asOf,
    (missing) => `${missing} more full-stop night landing${missing === 1 ? '' : 's'} required`,
    (expiresOn) => `One night full-stop before ${fmt(expiresOn)} keeps this alive`,
  );
}

/**
 * 61.57(c)(1) — within the preceding 6 CALENDAR months: six instrument
 * approaches, holding procedures and tasks, and intercepting and tracking
 * courses. Per category, not class.
 *
 * All three requirements must be satisfied inside the window, so the rule
 * expires on whichever of the three lapses first.
 */
export function instrumentCurrency(
  flights: CurrencyFlight[],
  asOf: Date,
  categoryClass: CategoryClass,
): CurrencyResult {
  const category = categoryOf(categoryClass);
  const inWindow = flights
    .filter((f) => {
      if (categoryOf(f.categoryClass) !== category) return false;
      const expiry = endOfCalendarMonthsAfter(f.date, INSTRUMENT_WINDOW_MONTHS);
      return daysBetween(f.date, asOf) >= 0 && daysBetween(asOf, expiry) >= 0;
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const approaches: QualifyingEvent[] = [];
  let holding: QualifyingEvent | null = null;
  let tracking: QualifyingEvent | null = null;

  for (const f of inWindow) {
    const agesOutOn = endOfCalendarMonthsAfter(f.date, INSTRUMENT_WINDOW_MONTHS);
    if ((f.approaches ?? 0) > 0) {
      approaches.push({ flightId: f.id, date: f.date, counts: f.approaches ?? 0, agesOutOn });
    }
    // Newest first, so the first one seen is the one that lasts longest.
    if (f.holding && !holding) holding = { flightId: f.id, date: f.date, counts: 1, agesOutOn };
    if (f.courseTracking && !tracking) tracking = { flightId: f.id, date: f.date, counts: 1, agesOutOn };
  }

  const approachTotal = totalOf(approaches);
  const bindingApproach = bindingEvent(approaches, INSTRUMENT_APPROACHES_REQUIRED);

  // All three requirements must hold at once, so the rule dies with whichever
  // of them lapses first.
  let expiresOn: Date | null = null;
  if (bindingApproach && holding && tracking) {
    expiresOn = new Date(
      Math.min(
        bindingApproach.agesOutOn.getTime(),
        holding.agesOutOn.getTime(),
        tracking.agesOutOn.getTime(),
      ),
    );
  }
  const daysRemaining = expiresOn ? daysBetween(asOf, expiresOn) : null;
  const state = stateFor(daysRemaining);

  const missing: string[] = [];
  if (approachTotal < INSTRUMENT_APPROACHES_REQUIRED) {
    missing.push(`${INSTRUMENT_APPROACHES_REQUIRED - approachTotal} more approaches`);
  }
  if (!holding) missing.push('holding procedures');
  if (!tracking) missing.push('intercepting and tracking courses');

  let action: string | null = null;
  if (state === 'expired') {
    action = missing.length ? `Needs ${missing.join(', ')}` : 'Instrument currency has lapsed';
  } else if (state === 'expiring' && expiresOn) {
    action = `Expires ${fmt(expiresOn)} — fly approaches to stay ahead`;
  }

  return {
    rule: '61.57(c)(1)',
    label: 'Instrument',
    state,
    have: approachTotal,
    need: INSTRUMENT_APPROACHES_REQUIRED,
    expiresOn,
    daysRemaining,
    qualifying: approaches,
    action,
  };
}

/** 61.56 — flight review within the preceding 24 calendar months. */
export function flightReviewCurrency(lastReview: Date | null, asOf: Date): CurrencyResult {
  const expiresOn = lastReview ? endOfCalendarMonthsAfter(lastReview, FLIGHT_REVIEW_MONTHS) : null;
  const daysRemaining = expiresOn ? daysBetween(asOf, expiresOn) : null;
  const state = stateFor(daysRemaining);

  return {
    rule: '61.56',
    label: 'Flight review',
    state,
    have: lastReview ? 1 : 0,
    need: 1,
    expiresOn,
    daysRemaining,
    qualifying: [],
    action:
      state === 'expired'
        ? 'A flight review is required before acting as pilot in command'
        : state === 'expiring' && expiresOn
          ? `Due by ${fmt(expiresOn)}`
          : null,
  };
}

/**
 * 61.23(d) — medical validity in calendar months, for the privileges of the
 * class as issued. The step-down ladder (a first class reverting to second- then
 * third-class privileges as it ages) is not modelled yet; this returns the
 * window for the class's own privileges, which is the conservative answer.
 */
export function medicalDurationMonths(cls: MedicalClass, ageAtExam: number): number {
  if (cls === 'first') return ageAtExam < 40 ? 12 : 6;
  if (cls === 'second') return 12;
  return ageAtExam < 40 ? 60 : 24;
}

export function medicalCurrency(
  issued: Date | null,
  cls: MedicalClass,
  ageAtExam: number,
  asOf: Date,
): CurrencyResult {
  const months = medicalDurationMonths(cls, ageAtExam);
  const expiresOn = issued ? endOfCalendarMonthsAfter(issued, months) : null;
  const daysRemaining = expiresOn ? daysBetween(asOf, expiresOn) : null;
  const state = stateFor(daysRemaining);

  return {
    rule: '61.23',
    label: `Medical — ${cls} class`,
    state,
    have: issued ? 1 : 0,
    need: 1,
    expiresOn,
    daysRemaining,
    qualifying: [],
    action:
      state === 'expired'
        ? 'Medical certificate has expired'
        : state === 'expiring' && expiresOn
          ? `Renew by ${fmt(expiresOn)}`
          : null,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
