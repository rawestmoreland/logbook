import { z } from 'zod';

// `date` is entered as plain text rather than a Date object — it keeps the
// input portable across web/native without a native date-picker dependency
// and matches how pilots actually fill out a paper logbook.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^\d*\.?\d*$/;
const INTEGER_PATTERN = /^\d*$/;

const hoursField = () => z.string().trim().regex(DECIMAL_PATTERN, 'Enter a number');
const landingsField = () => z.string().trim().regex(INTEGER_PATTERN, 'Enter a whole number');

const flightFormShape = z.object({
  date: z.string().regex(DATE_PATTERN, 'Use YYYY-MM-DD'),
  aircraftId: z.string().min(1, 'Select an aircraft'),
  routeFrom: z.string().trim().min(1, 'Required').max(10, 'Too long'),
  routeTo: z.string().trim().min(1, 'Required').max(10, 'Too long'),
  totalTime: hoursField(),
  picTime: hoursField(),
  sicTime: hoursField(),
  dualTime: hoursField(),
  soloTime: hoursField(),
  nightTime: hoursField(),
  actualInstrument: hoursField(),
  simInstrument: hoursField(),
  dayLandings: landingsField(),
  nightLandings: landingsField(),
  // Of dayLandings, how many were to a full stop — required for tailwheel
  // currency credit (see CurrencyFlight.dayLandingsFullStop). Can't exceed
  // dayLandings; enforced below via .refine rather than a schema constraint,
  // since it's a relationship between two fields, not either field alone.
  dayLandingsFullStop: landingsField(),
  approaches: landingsField(),
  // Booleans rather than the rest of the form's string-field convention:
  // those strings exist to let an HTML number input hold intermediate
  // typing state ("1.", "") that isn't valid yet, which doesn't apply to a
  // checkbox — its DOM value is already a boolean.
  holding: z.boolean(),
  courseTracking: z.boolean(),
  remarks: z.string().optional(),
});

export const flightFormSchema = flightFormShape.refine(
  (data) => parseNumberValue(data.dayLandingsFullStop) <= parseNumberValue(data.dayLandings),
  {
    message: 'Cannot exceed day landings',
    path: ['dayLandingsFullStop'],
  },
);

export type FlightFormValues = z.infer<typeof flightFormShape>;

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
    routeFrom: '',
    routeTo: '',
    totalTime: '0',
    picTime: '0',
    sicTime: '0',
    dualTime: '0',
    soloTime: '0',
    nightTime: '0',
    actualInstrument: '0',
    simInstrument: '0',
    dayLandings: '0',
    nightLandings: '0',
    dayLandingsFullStop: '0',
    approaches: '0',
    holding: false,
    courseTracking: false,
    remarks: '',
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
