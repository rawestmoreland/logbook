import { z } from 'zod';

// `date` is entered as plain text rather than a Date object — it keeps the
// input portable across web/native without a native date-picker dependency
// and matches how pilots actually fill out a paper logbook.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^\d*\.?\d*$/;
const INTEGER_PATTERN = /^\d*$/;

const hoursField = () => z.string().trim().regex(DECIMAL_PATTERN, 'Enter a number');
const landingsField = () => z.string().trim().regex(INTEGER_PATTERN, 'Enter a whole number');

export const flightFormShape = z.object({
  date: z.string().regex(DATE_PATTERN, 'Use YYYY-MM-DD'),
  aircraftId: z.string().min(1, 'Select an aircraft'),
  // Free-text route, e.g. "KPAO KMRY" or a multi-stop "KPAO KSQL KHWD
  // KPAO". Used as-is for display, and parsed (see route.ts's
  // parseRouteIdents/routeEndpoints) wherever a single departure/arrival
  // pair or the full waypoint list is needed.
  route: z.string().trim().min(1, 'Required').max(200, 'Too long'),
  totalTime: hoursField(),
  picTime: hoursField(),
  sicTime: hoursField(),
  dualTime: hoursField(),
  soloTime: hoursField(),
  nightTime: hoursField(),
  actualInstrument: hoursField(),
  simInstrument: hoursField(),
  crossCountryTime: hoursField(),
  dualGivenTime: hoursField(),
  groundSimTime: hoursField(),
  // Total landings for the flight (day + night, full stop + touch and go) —
  // mirrors MyFlightbook's Total/Day full stop/Night full stop convention
  // rather than splitting day vs. night landings up front.
  totalLandings: landingsField(),
  // Of totalLandings, how many were to a full stop during the day —
  // required for tailwheel currency credit (see
  // CurrencyFlight.dayLandingsFullStop).
  dayLandingsFullStop: landingsField(),
  // Of totalLandings, how many were to a full stop at night (1 hr after
  // sunset to 1 hr before sunrise) — see CurrencyFlight.nightLandingsFullStop.
  // Their sum can't exceed totalLandings; enforced below via .refine rather
  // than a schema constraint, since it's a relationship between fields, not
  // any one field alone.
  nightLandingsFullStop: landingsField(),
  approaches: landingsField(),
  // Booleans rather than the rest of the form's string-field convention:
  // those strings exist to let an HTML number input hold intermediate
  // typing state ("1.", "") that isn't valid yet, which doesn't apply to a
  // checkbox — its DOM value is already a boolean.
  holding: z.boolean(),
  courseTracking: z.boolean(),
  remarks: z.string().optional(),
  // Pending Flights (MyFlightbook parity): a flight logged but not yet
  // reviewed/confirmed — held out of totals, currency, and the main flights
  // list until confirmed. Optional/defaulted rather than required so every
  // existing caller (CSV import, older form state) that doesn't set it still
  // gets an ordinary, immediately-counted flight.
  pending: z.boolean().optional(),
});

export const flightFormSchema = flightFormShape.refine(
  (data) =>
    parseNumberValue(data.dayLandingsFullStop) + parseNumberValue(data.nightLandingsFullStop) <=
    parseNumberValue(data.totalLandings),
  {
    message: 'Full-stop landings cannot exceed total landings',
    path: ['dayLandingsFullStop'],
  },
);

export type FlightFormValues = z.infer<typeof flightFormShape>;

/**
 * Date written on a pilot's starting-totals row — a single carry-forward
 * snapshot of everything logged before this app, stored as one flagged
 * `flights` record (`is_starting_totals: true`) rather than a parallel data
 * model (see `pocketbase/base/migrations/1789800000_updated_flights.go`).
 * Dated to the epoch of aviation record-keeping itself, well outside every
 * currency window (90-day/12-month/24-month) `currency/rules.ts` computes,
 * so it never needs special-casing there — it simply never falls inside an
 * "as of" lookback.
 */
export const STARTING_TOTALS_DATE = '1903-12-17';

/**
 * Field subset for the starting-totals form — every hours/landings field
 * `flightFormShape` has, minus the ones that only make sense for a flight
 * actually flown (aircraft, route, holding/course-tracking currency
 * credit): there's no tail number, no route, and 61.57 currency doesn't
 * look at a carry-forward snapshot at all (see `STARTING_TOTALS_DATE`).
 */
export const startingTotalsFormShape = z.object({
  totalTime: hoursField(),
  picTime: hoursField(),
  sicTime: hoursField(),
  dualTime: hoursField(),
  soloTime: hoursField(),
  nightTime: hoursField(),
  actualInstrument: hoursField(),
  simInstrument: hoursField(),
  crossCountryTime: hoursField(),
  dualGivenTime: hoursField(),
  groundSimTime: hoursField(),
  totalLandings: landingsField(),
  dayLandingsFullStop: landingsField(),
  nightLandingsFullStop: landingsField(),
  approaches: landingsField(),
});

export const startingTotalsFormSchema = startingTotalsFormShape.refine(
  (data) =>
    parseNumberValue(data.dayLandingsFullStop) + parseNumberValue(data.nightLandingsFullStop) <=
    parseNumberValue(data.totalLandings),
  {
    message: 'Full-stop landings cannot exceed total landings',
    path: ['dayLandingsFullStop'],
  },
);

export type StartingTotalsFormValues = z.infer<typeof startingTotalsFormShape>;

export function defaultStartingTotalsFormValues(): StartingTotalsFormValues {
  return {
    totalTime: '0',
    picTime: '0',
    sicTime: '0',
    dualTime: '0',
    soloTime: '0',
    nightTime: '0',
    actualInstrument: '0',
    simInstrument: '0',
    crossCountryTime: '0',
    dualGivenTime: '0',
    groundSimTime: '0',
    totalLandings: '0',
    dayLandingsFullStop: '0',
    nightLandingsFullStop: '0',
    approaches: '0',
  };
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function defaultFlightFormValues(): FlightFormValues {
  return {
    date: formatDateValue(new Date()),
    aircraftId: '',
    route: '',
    totalTime: '0',
    picTime: '0',
    sicTime: '0',
    dualTime: '0',
    soloTime: '0',
    nightTime: '0',
    actualInstrument: '0',
    simInstrument: '0',
    crossCountryTime: '0',
    dualGivenTime: '0',
    groundSimTime: '0',
    totalLandings: '0',
    dayLandingsFullStop: '0',
    nightLandingsFullStop: '0',
    approaches: '0',
    holding: false,
    courseTracking: false,
    remarks: '',
    pending: false,
  };
}

/**
 * Parses "YYYY-MM-DD" as a local-midnight Date (never UTC — avoids the date
 * rolling back a day for pilots west of Greenwich).
 *
 * Throws on anything else rather than returning an Invalid Date: this is a
 * shared entry point now, and a silently invalid date would be written into
 * a logbook entry and only surface years later as a hole in someone's totals.
 */
export function parseDateValue(value: string): Date {
  const parts = value.split('-');
  if (parts.length !== 3) {
    throw new RangeError(`Expected a YYYY-MM-DD date, received "${value}"`);
  }
  const [year, month, day] = parts.map(Number) as [number, number, number];
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new RangeError(`Expected a YYYY-MM-DD date, received "${value}"`);
  }
  const parsed = new Date(year, month - 1, day);
  // Rejects overflow the Date constructor would otherwise normalize away,
  // e.g. 2026-02-31 quietly becoming 3 March.
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new RangeError(`"${value}" is not a real calendar date`);
  }
  return parsed;
}

/** Parses a form hours/landings field back to a number, defaulting to 0 for
 * an empty or otherwise unparseable string (schema already constrains the
 * shape, so this is just the empty-string case). */
export function parseNumberValue(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
