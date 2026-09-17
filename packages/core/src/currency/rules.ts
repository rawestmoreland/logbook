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

import { categoryOf, type AircraftInstanceType, type CategoryClass } from '../aircraft.js';
import { EASA_MEDICAL_CLASS_LABELS, MEDICAL_CLASS_LABELS, type EasaMedicalClass, type MedicalClass } from '../medical.js';
import { addCalendarMonths, addDays, daysBetween, endOfCalendarMonthsAfter } from './calendar.js';

/** How close to expiry counts as "expiring" rather than "current". */
export const EXPIRING_SOON_DAYS = 30;

const PASSENGER_WINDOW_DAYS = 90;
const PASSENGER_LANDINGS_REQUIRED = 3;
const INSTRUMENT_WINDOW_MONTHS = 6;
const INSTRUMENT_APPROACHES_REQUIRED = 6;
/** 61.57(d): one additional 6 calendar months, past ordinary (c) currency's
 * lapse, in which flying approaches/holding/tracking solo can still restore
 * currency before an IPC becomes mandatory. */
const INSTRUMENT_GRACE_MONTHS = 6;
const FLIGHT_REVIEW_MONTHS = 24;
const BASICMED_COURSE_MONTHS = 24;
const BASICMED_EXAM_MONTHS = 48;
/** MED.A.045's absolute cessation age for a certificate examined under 40 —
 * see `easaMedicalDurationMonths`'s doc comment. */
const EASA_UNDER_40_CESSATION_AGE = 42;
/** MED.A.045's absolute cessation age for a Class 2 certificate examined
 * 40-49 — see `easaMedicalDurationMonths`'s doc comment. LAPL has no
 * equivalent: its 40+ tier doesn't step down again, so nothing caps it. */
const EASA_CLASS2_UNDER_50_CESSATION_AGE = 51;
const IPC_REQUIRED_ACTION =
  'Past the 61.57(d) grace period — an instrument proficiency check (IPC) is required; approaches alone no longer restore currency';

export type CurrencyState = 'current' | 'expiring' | 'expired';

/** The slice of a flight the currency rules actually read. */
export type CurrencyFlight = {
  id: string;
  date: Date;
  categoryClass: CategoryClass;
  /** Set only when the aircraft requires a type rating; 61.57(a) is type-specific then. */
  typeRating?: string | null;
  tailwheel?: boolean;
  /**
   * What kind of device this flight was flown in. 61.57(a) and (b) both
   * require the takeoffs/landings to be in an aircraft of the same category
   * and class — there is no simulator/ATD credit provision, unlike (c),
   * which explicitly allows it for instrument currency. So only `'real'`
   * flights are credited toward day/night passenger currency;
   * `instrumentCurrency` doesn't look at this field at all.
   */
  instanceType: AircraftInstanceType;
  /** Total landings as sole manipulator (day + night, full stop + touch and go). */
  totalLandings: number;
  /** Of `totalLandings`, how many were to a full stop during the day. Required for tailwheel credit. */
  dayLandingsFullStop?: number;
  /** Of `totalLandings`, how many were to a full stop between 1 hr after
   * sunset and 1 hr before sunrise. */
  nightLandingsFullStop: number;
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

/** Used by day/night passenger currency only — instrument currency has no
 * simulator/ATD exclusion and doesn't call this. */
function matchesAircraft(
  flight: CurrencyFlight,
  categoryClass: CategoryClass,
  typeRating?: string | null,
): boolean {
  if (flight.categoryClass !== categoryClass) return false;
  // 61.57(a) and (b) both require the landings to be in an aircraft of the
  // same category and class — no simulator/ATD credit provision.
  if (flight.instanceType !== 'real') return false;
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
 * it does not replace this one. Only landings flown in a real aircraft count —
 * unlike 61.57(c), (a) and (b) have no simulator/ATD credit provision.
 *
 * Tailwheel airplanes (61.57(a)(1)(ii)) require the landings to be to a full
 * stop. When `tailwheel` is set and `dayLandingsFullStop` is absent we cannot
 * prove that, so those landings are not credited. A non-tailwheel day count
 * is derived as `totalLandings - nightLandingsFullStop` — every landing not
 * already accounted for as a night full stop — since this app doesn't track
 * a separate touch-and-go count for day vs. night landings.
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
    const day = f.tailwheel ? (f.dayLandingsFullStop ?? 0) : f.totalLandings - f.nightLandingsFullStop;
    const counts = day + f.nightLandingsFullStop;
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
 * (1 hr after sunset to 1 hr before sunrise) in the preceding 90 days. Same
 * real-aircraft-only restriction as (a)(1) — see `dayPassengerCurrency`.
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
    if (f.nightLandingsFullStop > 0) {
      events.push({
        flightId: f.id,
        date: f.date,
        counts: f.nightLandingsFullStop,
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

const EASA_RECENCY_WINDOW_DAYS = 90;
const EASA_RECENCY_LANDINGS_REQUIRED = 3;
const EASA_NIGHT_PIC_LANDINGS_REQUIRED = 1;

/**
 * EASA Part-FCL, FCL.060(b)(1) — recent experience to carry passengers (or
 * operate in commercial air transport) as PIC or co-pilot: at least 3
 * take-offs, approaches, and landings in the preceding 90 days, in an
 * aircraft of the same type or class (mirroring `typeRating`'s existing
 * role in `matchesAircraft`, shared with the FAA functions above).
 *
 * Unlike 61.57(a)/(b), which split day and night passenger currency into
 * two entirely independent 3-landing tracks, FCL.060(b)(1) is a single
 * UNIFIED count: day and night take-offs/landings both credit the same
 * 3-in-90 requirement, with no separate day-only track. A further,
 * additional requirement applies on top of this one specifically to acting
 * as PIC at night — see `easaNightPicCurrency` for FCL.060(b)(2).
 *
 * FCL.060(b)(1)'s text explicitly credits "an FFS representing that type or
 * class" — unlike 61.57(a)/(b), which have no simulator/ATD credit
 * provision at all (see `matchesAircraft`'s comment). This app's
 * `instanceType` field doesn't distinguish an EASA-qualified FFS from the
 * FAA-flavored ATD/FTD tiers it actually tracks (`certified_ifr_sim`,
 * `certified_atd`, etc. — see `aircraft.ts`), so crediting any non-`'real'`
 * flight here risks over-crediting a device that wouldn't actually qualify
 * as an FFS under EASA's device categorization. Per this module's fail-safe
 * principle, only `'real'` flights are credited for now — via the same
 * `matchesAircraft` helper the FAA functions use — under-reporting rather
 * than guessing at FSTD grade.
 *
 * Primary source (EASA's Easy Access Rules for Flight Crew Licensing,
 * Part-FCL, FCL.060) was not reachable from this environment's network
 * egress — easa.europa.eu, pprune.org, euroga.org, caa.gov.cz,
 * aerocomsystem.com, ypa.gr, and irp.cdn-website.com were all blocked, the
 * same wall `easaMedicalDurationMonths` hit. Verified instead against
 * several independent secondary sources' summaries of FCL.060(b)(1)'s text,
 * cross-checked against each other for consistency on the specific
 * requirement above (3 take-offs/approaches/landings, 90 days, same type or
 * class or an FFS representing it, PIC or co-pilot, day and night unified).
 * Re-verify against EASA's Easy Access Rules for Part-FCL before this ships.
 */
export function easaRecencyCurrency(
  flights: CurrencyFlight[],
  asOf: Date,
  categoryClass: CategoryClass,
  typeRating?: string | null,
): CurrencyResult {
  const events: QualifyingEvent[] = [];
  for (const f of withinDays(flights, asOf, EASA_RECENCY_WINDOW_DAYS)) {
    if (!matchesAircraft(f, categoryClass, typeRating)) continue;
    const counts = f.totalLandings;
    if (counts > 0) {
      events.push({
        flightId: f.id,
        date: f.date,
        counts,
        agesOutOn: addDays(f.date, EASA_RECENCY_WINDOW_DAYS),
      });
    }
  }

  return build(
    'FCL.060(b)(1)',
    'Recency (EASA)',
    events,
    EASA_RECENCY_LANDINGS_REQUIRED,
    asOf,
    (missing) => `${missing} more take-off${missing === 1 ? '' : 's'} and landing${missing === 1 ? '' : 's'} required`,
    (expiresOn) => `One take-off and landing before ${fmt(expiresOn)} keeps this alive`,
  );
}

/**
 * EASA Part-FCL, FCL.060(b)(2) — an ADDITIONAL requirement layered on top of
 * `easaRecencyCurrency`, applying only to acting as PIC at night: at least
 * 1 take-off, approach, and landing at night, in the preceding 90 days, as
 * pilot flying, in an aircraft of the same type or class (or an FFS
 * representing it — see `easaRecencyCurrency`'s FFS-credit caveat, which
 * applies here too and for the same reason).
 *
 * FCL.060(b)(2) also exempts a pilot who holds a valid instrument rating
 * (IR) from this specific night requirement entirely. This app has no field
 * recording IR validity — that's FCL.625/FCL.740 rating revalidation, a
 * structurally different mechanism with fixed validity periods revalidated
 * by a proficiency check rather than a rolling currency computed from
 * ordinary logged flights (see the doc comment on `easaMedicalCurrency`,
 * which flags the same gap for Class 1 medicals). Implementing that
 * exemption would need a new `endorsements.type` value and UI to log a
 * proficiency check — out of scope here, left as the natural next step. So
 * the IR exemption is simply not modeled: a pilot who actually holds a
 * valid IR and hasn't flown a night landing in the preceding 90 days will
 * be reported as not current on this tile even though FCL.060(b)(2) would
 * exempt them from it. That fails SAFE — it under-reports currency rather
 * than assuming an IR this app can't verify.
 *
 * Same source-provenance caveat as `easaRecencyCurrency` above.
 */
export function easaNightPicCurrency(
  flights: CurrencyFlight[],
  asOf: Date,
  categoryClass: CategoryClass,
  typeRating?: string | null,
): CurrencyResult {
  const events: QualifyingEvent[] = [];
  for (const f of withinDays(flights, asOf, EASA_RECENCY_WINDOW_DAYS)) {
    if (!matchesAircraft(f, categoryClass, typeRating)) continue;
    if (f.nightLandingsFullStop > 0) {
      events.push({
        flightId: f.id,
        date: f.date,
        counts: f.nightLandingsFullStop,
        agesOutOn: addDays(f.date, EASA_RECENCY_WINDOW_DAYS),
      });
    }
  }

  return build(
    'FCL.060(b)(2)',
    'Recency — night PIC (EASA)',
    events,
    EASA_NIGHT_PIC_LANDINGS_REQUIRED,
    asOf,
    (missing) => `${missing} more night take-off and landing required`,
    (expiresOn) => `One night take-off and landing before ${fmt(expiresOn)} keeps this alive`,
  );
}

type InstrumentSnapshot = {
  approaches: QualifyingEvent[];
  holding: QualifyingEvent | null;
  tracking: QualifyingEvent | null;
  approachTotal: number;
  bindingApproach: QualifyingEvent | null;
  expiresOn: Date | null;
};

/** The ordinary 61.57(c)(1) computation, evaluated as of `t`: six approaches,
 * holding, and course tracking within the trailing 6 calendar months of `t`.
 * Factored out of `instrumentCurrency` so it can also be evaluated at
 * historical instants when reconstructing when currency actually lapsed. */
function instrumentStateAt(categoryFlights: CurrencyFlight[], t: Date): InstrumentSnapshot {
  const inWindow = categoryFlights
    .filter((f) => {
      const expiry = endOfCalendarMonthsAfter(f.date, INSTRUMENT_WINDOW_MONTHS);
      return daysBetween(f.date, t) >= 0 && daysBetween(t, expiry) >= 0;
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

  return { approaches, holding, tracking, approachTotal, bindingApproach, expiresOn };
}

/**
 * 61.57(d): reconstructs the date the pilot's (c) currency is legitimately
 * good through — the "anchor" — by walking every candidate qualifying event
 * (a flight carrying approaches/holding/tracking, or an IPC) in date order.
 *
 * A flight-only event advances the anchor only when it lands on or before the
 * previous anchor's grace deadline (`anchor` + 6 calendar months) — that is
 * exactly what 61.57(d) allows: requalifying solo within the grace period. An
 * event arriving after that deadline is void: the anchor is left untouched,
 * so it (and every later flight-only event, until an IPC) keeps failing the
 * same grace check against that now-stale anchor — mirroring how, once the
 * grace period is spent, no amount of further solo flying restores currency.
 * An IPC always resets the anchor unconditionally, since it is what the
 * regulation requires at that point, and starts a fresh ordinary 6-month
 * window from its own date.
 */
function instrumentAnchor(categoryFlights: CurrencyFlight[], asOf: Date, lastIpc: Date | null): Date | null {
  const candidateDates = new Set<number>();
  for (const f of categoryFlights) {
    if ((f.approaches ?? 0) > 0 || f.holding || f.courseTracking) candidateDates.add(f.date.getTime());
  }

  type Event = { date: Date; kind: 'flight' | 'ipc' };
  const events: Event[] = [...candidateDates].map((t) => ({ date: new Date(t), kind: 'flight' as const }));
  if (lastIpc) events.push({ date: lastIpc, kind: 'ipc' });
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  let anchor: Date | null = null;
  for (const event of events) {
    if (daysBetween(event.date, asOf) < 0) continue; // in the future relative to asOf

    if (event.kind === 'ipc') {
      anchor = endOfCalendarMonthsAfter(event.date, INSTRUMENT_WINDOW_MONTHS);
      continue;
    }

    const snapshot = instrumentStateAt(categoryFlights, event.date);
    if (!(snapshot.approachTotal >= INSTRUMENT_APPROACHES_REQUIRED && snapshot.holding && snapshot.tracking)) {
      continue;
    }
    const withinGrace =
      anchor === null ||
      daysBetween(event.date, endOfCalendarMonthsAfter(anchor, INSTRUMENT_GRACE_MONTHS)) >= 0;
    if (withinGrace) anchor = snapshot.expiresOn;
  }

  return anchor;
}

/**
 * 61.57(c)(1)/(d) — within the preceding 6 CALENDAR months: six instrument
 * approaches, holding procedures and tasks, and intercepting and tracking
 * courses. Per category, not class — like the approaches/holding/tracking it
 * folds together, an IPC is flown in a specific aircraft, so `lastIpc` is the
 * caller's most recent qualifying IPC *for this category* (mirroring the
 * category-not-class scoping already used for approaches/holding/tracking
 * above), not a global one like `flightReviewCurrency`'s flight review.
 *
 * All three (c) requirements must be satisfied inside the window, so the rule
 * expires on whichever of the three lapses first — UNLESS the pilot is past
 * 61.57(d)'s one-time 6-calendar-month grace period since that lapse, in
 * which case only a dated IPC (not more solo approaches) can restore it.
 */
export function instrumentCurrency(
  flights: CurrencyFlight[],
  asOf: Date,
  categoryClass: CategoryClass,
  lastIpc: Date | null = null,
): CurrencyResult {
  const category = categoryOf(categoryClass);
  const categoryFlights = flights.filter((f) => categoryOf(f.categoryClass) === category);

  const anchor = instrumentAnchor(categoryFlights, asOf, lastIpc);
  let requiresIpc =
    anchor !== null && daysBetween(asOf, endOfCalendarMonthsAfter(anchor, INSTRUMENT_GRACE_MONTHS)) < 0;

  // `instrumentAnchor` can only flag a lapsed grace period once it has
  // reconstructed a historical instant where all three (c)(1) elements were
  // satisfied at once. That reconstruction fails whenever the flight data
  // never happens to carry all three together — most commonly, imported
  // logbook data (the ForeFlight CSV importer always writes `courseTracking:
  // false`, since ForeFlight has no such column — see csv-foreflight.ts) —
  // even when the pilot plainly has old instrument activity on record.
  // Without this fallback that gap silently reports "fly 6 approaches,
  // holding, tracking" forever, regardless of how long it has actually been,
  // which is the unsafe direction: it implies solo flying still restores
  // currency when 61.57(d) may already require a dated IPC.
  //
  // No anchor ever having been established means no unbroken currency chain
  // exists to protect, so there is nothing for a later solo flight to game:
  // if the most recent instrument-related activity on record is already
  // older than the combined 12-calendar-month (c)/(d) window, an IPC is
  // required the same as if a real anchor had lapsed.
  if (!requiresIpc && anchor === null && lastIpc === null) {
    const mostRecentActivity = categoryFlights.reduce<Date | null>((latest, f) => {
      if (!((f.approaches ?? 0) > 0 || f.holding || f.courseTracking)) return latest;
      return !latest || f.date.getTime() > latest.getTime() ? f.date : latest;
    }, null);
    requiresIpc =
      mostRecentActivity !== null &&
      daysBetween(
        asOf,
        endOfCalendarMonthsAfter(mostRecentActivity, INSTRUMENT_WINDOW_MONTHS + INSTRUMENT_GRACE_MONTHS),
      ) < 0;
  }

  if (requiresIpc) {
    // Fail safe: once the grace period is spent, nothing short of a fresh IPC
    // counts, so don't credit whatever approaches happen to sit in the
    // trailing window — that would look like ordinary progress toward
    // currency when it legally isn't.
    return {
      rule: '61.57(c)(1)',
      label: 'Instrument',
      state: 'expired',
      have: 0,
      need: INSTRUMENT_APPROACHES_REQUIRED,
      expiresOn: null,
      daysRemaining: null,
      qualifying: [],
      action: IPC_REQUIRED_ACTION,
    };
  }

  // Not past grace: an IPC (if any) counts toward ordinary ongoing (c)
  // currency the same way a flight with six approaches, holding, and
  // tracking would — folding back into normal tracking, per the module brief.
  const ipcFlight: CurrencyFlight | null = lastIpc
    ? {
        id: 'ipc',
        date: lastIpc,
        categoryClass,
        instanceType: 'real',
        totalLandings: 0,
        nightLandingsFullStop: 0,
        approaches: INSTRUMENT_APPROACHES_REQUIRED,
        holding: true,
        courseTracking: true,
      }
    : null;
  const effectiveFlights = ipcFlight ? [...categoryFlights, ipcFlight] : categoryFlights;

  const { approaches, holding, tracking, approachTotal, expiresOn } = instrumentStateAt(effectiveFlights, asOf);
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

/** The more recent of two nullable dates; null only when both are. Not
 * pulled into `calendar.ts` since nothing else needs a null-safe "latest
 * of" over date arithmetic. */
function latestOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * 61.56 — flight review within the preceding 24 calendar months. 61.56(d)(1)
 * exempts a pilot from this requirement if they've passed a pilot
 * proficiency check or practical test (checkride) within that same
 * 24-calendar-month window, so the window runs from whichever of the two —
 * the last flight review or the last checkride — is more recent.
 *
 * eCFR (ecfr.gov) was not reachable from this environment's network egress —
 * same wall `easaMedicalDurationMonths`/`easaRecencyCurrency` hit — so this
 * was verified instead against several independent secondary sources'
 * summaries of 61.56(d)(1)'s text, cross-checked against each other for
 * consistency on the specific requirement above. Re-verify against the eCFR
 * primary text before this ships.
 */
export function flightReviewCurrency(
  lastReview: Date | null,
  lastCheckride: Date | null,
  asOf: Date,
): CurrencyResult {
  const basis = latestOf(lastReview, lastCheckride);
  const expiresOn = basis ? endOfCalendarMonthsAfter(basis, FLIGHT_REVIEW_MONTHS) : null;
  const daysRemaining = expiresOn ? daysBetween(asOf, expiresOn) : null;
  const state = stateFor(daysRemaining);

  return {
    rule: '61.56',
    label: 'Flight review',
    state,
    have: basis ? 1 : 0,
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
 * 61.23(d) — a class's own medical validity window, in calendar months, per
 * (d)(1)-(3). Each tier's duration is set purely by age at exam and is NOT
 * stacked on any other tier's window: (d)(2)'s 12 months for second-class
 * privileges runs from the exam date whether the certificate was issued as
 * second-class or is a first-class certificate stepping down, and likewise
 * for (d)(3)'s third-class window. That independence is what lets
 * `medicalCurrency` below turn the step-down ladder into a rank check instead
 * of tracking per-tier boundaries itself.
 */
export function medicalDurationMonths(cls: MedicalClass, ageAtExam: number): number {
  if (cls === 'first') return ageAtExam < 40 ? 12 : 6;
  if (cls === 'second') return 12;
  return ageAtExam < 40 ? 60 : 24;
}

/** Highest privilege first — used to check whether a held certificate class
 * covers the privileges actually needed. */
const MEDICAL_CLASS_RANK: Record<MedicalClass, number> = { first: 0, second: 1, third: 2 };

/**
 * 61.23(d) — is the medical certificate current for `privilegesNeeded`?
 *
 * A medical certificate doesn't expire all at once: a first-class certificate
 * is good for first-class privileges only for its own (12/6-month) window,
 * then steps down to second-class privileges through (d)(2)'s 12 months,
 * then to third-class through (d)(3)'s 60/24 months — a second-class
 * certificate steps down the same way, straight to third. Because each
 * tier's window is measured independently from the exam date (see
 * `medicalDurationMonths`), the step-down reduces to a single check: does
 * the held class (`cls`) rank at or above `privilegesNeeded`? If so, the
 * relevant window is just `medicalDurationMonths(privilegesNeeded, ageAtExam)`
 * — the class as issued doesn't matter beyond that. If the held class ranks
 * below what's needed (e.g. a third-class certificate can never grant
 * first-class privileges), this fails safe and reports no currency at any
 * age, the same way the rest of this module under- rather than over-reports.
 *
 * Nothing on `pilots` records what privilege level a pilot actually needs to
 * exercise (private vs. commercial vs. ATP) — there's no certificate-level
 * field for it. `privilegesNeeded` defaults to `'third'` (private
 * privileges): it's the common case for this app's users and the tier every
 * certificate class eventually steps down to, so it's also the fail-safe
 * default. Callers that later track a pilot's certificate level can pass the
 * right tier explicitly — mirroring how `instrumentCurrency` takes an
 * explicit `categoryClass` rather than inferring one.
 */
export function medicalCurrency(
  issued: Date | null,
  cls: MedicalClass,
  ageAtExam: number,
  asOf: Date,
  privilegesNeeded: MedicalClass = 'third',
): CurrencyResult {
  const heldPrivileges = MEDICAL_CLASS_RANK[cls] <= MEDICAL_CLASS_RANK[privilegesNeeded];
  const months = heldPrivileges ? medicalDurationMonths(privilegesNeeded, ageAtExam) : null;
  const expiresOn = issued && months !== null ? endOfCalendarMonthsAfter(issued, months) : null;
  const daysRemaining = expiresOn ? daysBetween(asOf, expiresOn) : null;
  const state = stateFor(daysRemaining);

  return {
    rule: '61.23',
    label: `Medical — ${privilegesNeeded} class privileges`,
    state,
    have: issued && heldPrivileges ? 1 : 0,
    need: 1,
    expiresOn,
    daysRemaining,
    qualifying: [],
    action:
      state === 'expired'
        ? heldPrivileges
          ? 'Medical certificate has expired'
          : `A ${MEDICAL_CLASS_LABELS[privilegesNeeded]} medical certificate (or higher) is required`
        : state === 'expiring' && expiresOn
          ? `Renew by ${fmt(expiresOn)}`
          : null,
  };
}

/**
 * 14 CFR part 68 (BasicMed) — an alternate medical-currency pathway to the
 * certificate-class ladder above, with its own two independent, concurrently
 * required windows instead of a certificate class:
 *
 *   - A medical education course (e.g. AOPA's or EAA's online course),
 *     completed within the preceding 24 calendar months.
 *   - A comprehensive medical exam per the Comprehensive Medical Exam
 *     Checklist (CMEC), completed by any state-licensed physician within the
 *     preceding 48 calendar months.
 *
 * Both windows are required at once — same AND-composition as
 * `instrumentCurrency`'s three simultaneous 61.57(c) requirements — so the
 * rule expires at whichever lapses first. A missing date fails safe: it
 * can't be current, the same way a missing certificate date reports no
 * currency in `medicalCurrency` above.
 *
 * BasicMed also has a one-time eligibility gate — the pilot must have held
 * an FAA medical certificate at some point after 14 Jul 2006 — but that's a
 * historical fact, not a currency window, and nothing in this app records
 * it. Gating on it here would make BasicMed currency permanently
 * unrepresentable for every pilot (there's no field to ever satisfy it),
 * which is a worse failure than the module's fail-safe philosophy asks for:
 * that philosophy is about not over-reporting currency, not about blocking
 * the whole pathway on data nobody can supply. So this function evaluates
 * only the two currency windows and leaves that eligibility gate untracked,
 * the same way it leaves BasicMed's operational limitations (seats, weight,
 * altitude, speed, occupants, airspace, compensation) untracked — those are
 * flight-level constraints, not date-based currency, and out of scope here.
 */
export function basicMedCurrency(
  lastCourseCompleted: Date | null,
  lastExamCompleted: Date | null,
  asOf: Date,
): CurrencyResult {
  const courseExpiresOn = lastCourseCompleted
    ? endOfCalendarMonthsAfter(lastCourseCompleted, BASICMED_COURSE_MONTHS)
    : null;
  const examExpiresOn = lastExamCompleted
    ? endOfCalendarMonthsAfter(lastExamCompleted, BASICMED_EXAM_MONTHS)
    : null;

  const courseCurrent = courseExpiresOn !== null && daysBetween(asOf, courseExpiresOn) >= 0;
  const examCurrent = examExpiresOn !== null && daysBetween(asOf, examExpiresOn) >= 0;
  const have = (courseCurrent ? 1 : 0) + (examCurrent ? 1 : 0);

  // Both windows must be open at once, so the rule can only report an
  // expiry when both dates are on record — a missing date is handled below
  // as an outright "not current" rather than a computable (past) expiry.
  const expiresOn =
    courseExpiresOn && examExpiresOn
      ? new Date(Math.min(courseExpiresOn.getTime(), examExpiresOn.getTime()))
      : null;
  const daysRemaining = expiresOn ? daysBetween(asOf, expiresOn) : null;
  const state = stateFor(daysRemaining);

  const missing: string[] = [];
  if (!courseCurrent) missing.push('a medical education course (within the preceding 24 calendar months)');
  if (!examCurrent) {
    missing.push('a comprehensive medical exam / CMEC (within the preceding 48 calendar months)');
  }

  let action: string | null = null;
  if (state === 'expired') action = `Needs ${missing.join(' and ')}`;
  else if (state === 'expiring' && expiresOn) action = `Renew by ${fmt(expiresOn)}`;

  return {
    rule: '14 CFR 68',
    label: 'Medical — BasicMed',
    state,
    have,
    need: 2,
    expiresOn,
    daysRemaining,
    qualifying: [],
    action,
  };
}

/** Whole years old at `at`. Private to this module — `easaMedicalCurrency`
 * below is the only caller; `medicalCurrency` above takes age as an
 * already-computed parameter instead because it has no need for a raw
 * `birthdate`, unlike EASA's cessation-age cap (see below), which does. */
function ageAt(birthdate: Date, at: Date): number {
  let age = at.getFullYear() - birthdate.getFullYear();
  const hadBirthdayThisYear =
    at.getMonth() > birthdate.getMonth() ||
    (at.getMonth() === birthdate.getMonth() && at.getDate() >= birthdate.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/** The date `birthdate`'s holder turns `age` years old. */
function birthdayAt(birthdate: Date, age: number): Date {
  return new Date(birthdate.getFullYear() + age, birthdate.getMonth(), birthdate.getDate());
}

/**
 * EASA Part-MED, MED.A.045 — LAPL medical and Class 2 certificate validity,
 * in calendar months, keyed by age at the examination. Class 1 (commercial)
 * is out of scope for this module — see `easaMedicalCurrency`'s doc comment.
 *
 * This module's PDF/EUR-Lex primary text was not reachable from the
 * environment this was written in (every document host tried — including
 * easa.europa.eu, eur-lex.europa.eu, and legislation.gov.uk — was blocked
 * by the sandbox's network egress policy), so this was verified instead
 * against several independent secondary sources describing MED.A.045's
 * text, cross-checked against each other for consistency on the specific
 * numbers below. Re-verify against EASA's Easy Access Rules for Medical
 * Requirements before this ships. What those sources agree on:
 *
 * The duration is fixed once at the exam by age at that exam — mechanic
 * (a), the SAME mechanic as `medicalDurationMonths` above — NOT truncated
 * mid-term the instant a pilot's age crosses a band boundary. A pilot
 * examined at 39 keeps the full 60-month certificate after turning 40
 * partway through it.
 *
 *   - under 40 at exam: 60 months (both classes)
 *   - 40 up to 50 at exam: 24 months (both classes)
 *   - 50 or older at exam: 12 months — CLASS 2 ONLY. LAPL has no third
 *     tier: an exam at 40 or any older age is still just 24 months.
 *
 * Separately from this fixed-at-exam duration, MED.A.045 also gives every
 * certificate an absolute cessation age that applies regardless of issue
 * date: a certificate examined under 40 additionally ceases to be valid
 * once its holder turns `EASA_UNDER_40_CESSATION_AGE` (42), and a Class 2
 * certificate examined 40-49 additionally ceases once its holder turns
 * `EASA_CLASS2_UNDER_50_CESSATION_AGE` (51) — e.g. an exam at 39 nominally
 * reads good for 60 months, but actually expires at 42, not 44. This
 * function reports only the nominal per-tier duration; `easaMedicalCurrency`
 * applies the cessation cap on top of it, since skipping that cap would
 * over-report currency for anyone examined close to a band boundary — the
 * one failure mode this module treats as unacceptable (see the module
 * comment at the top of this file).
 */
export function easaMedicalDurationMonths(cls: EasaMedicalClass, ageAtExam: number): number {
  if (ageAtExam < 40) return 60;
  if (cls === 'class2' && ageAtExam >= 50) return 12;
  return 24;
}

/**
 * EASA Part-MED, MED.A.045 — is the LAPL/Class 2 medical certificate
 * current? Parallel to `medicalCurrency`/`basicMedCurrency` above, but
 * takes a raw `birthdate` rather than a precomputed age: unlike the FAA
 * ladder, MED.A.045's cessation cap (see `easaMedicalDurationMonths`) needs
 * the pilot's actual birthdate to find the specific date they turn 42 or
 * 51, not just their age at exam.
 *
 * Class 1 (commercial) and its single-pilot-commercial age-40
 * six-month-reduction rule are out of scope — this app has no field
 * distinguishing a commercial pilot's privilege level, the same gap
 * `medicalCurrency` already has for FAA certificate tiers. FCL.740/FCL.625
 * (rating revalidation) are separate currency windows entirely, not
 * medical, and aren't computed here either.
 *
 * A missing `birthdate` or `issued` date fails safe: no currency, same as
 * a missing certificate date in `medicalCurrency` above.
 */
export function easaMedicalCurrency(
  birthdate: Date | null,
  issued: Date | null,
  cls: EasaMedicalClass,
  asOf: Date,
): CurrencyResult {
  const label = `Medical — ${EASA_MEDICAL_CLASS_LABELS[cls]} (EASA)`;
  const have = birthdate && issued ? 1 : 0;

  let expiresOn: Date | null = null;
  if (birthdate && issued) {
    const ageAtExam = ageAt(birthdate, issued);
    const baseExpiry = addCalendarMonths(issued, easaMedicalDurationMonths(cls, ageAtExam));

    let cessationCap: Date | null = null;
    if (ageAtExam < 40) {
      cessationCap = birthdayAt(birthdate, EASA_UNDER_40_CESSATION_AGE);
    } else if (cls === 'class2' && ageAtExam < 50) {
      cessationCap = birthdayAt(birthdate, EASA_CLASS2_UNDER_50_CESSATION_AGE);
    }

    expiresOn = cessationCap && cessationCap.getTime() < baseExpiry.getTime() ? cessationCap : baseExpiry;
  }

  const daysRemaining = expiresOn ? daysBetween(asOf, expiresOn) : null;
  const state = stateFor(daysRemaining);

  return {
    rule: 'MED.A.045',
    label,
    state,
    have,
    need: 1,
    expiresOn,
    daysRemaining,
    qualifying: [],
    action:
      state === 'expired'
        ? have
          ? 'EASA medical certificate has expired'
          : 'Set a birthdate and medical issue date to compute EASA medical currency'
        : state === 'expiring' && expiresOn
          ? `Renew by ${fmt(expiresOn)}`
          : null,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
