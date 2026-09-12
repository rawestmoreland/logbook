import { z } from 'zod';

// `date` is entered as plain text rather than a Date object — it keeps the
// input portable across web/native without a native date-picker dependency
// and matches how pilots actually fill out a paper logbook.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^\d*\.?\d*$/;
const INTEGER_PATTERN = /^\d*$/;

const hoursField = () => z.string().trim().regex(DECIMAL_PATTERN, 'Enter a number');
const landingsField = () => z.string().trim().regex(INTEGER_PATTERN, 'Enter a whole number');

export const flightFormSchema = z.object({
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
  remarks: z.string().optional(),
});

export type FlightFormValues = z.infer<typeof flightFormSchema>;

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
    remarks: '',
  };
}

/** Parses "YYYY-MM-DD" as a local-midnight Date (never UTC — avoids the
 * date rolling back a day for pilots west of UTC). */
export function parseDateValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Parses a form hours/landings field back to a number, defaulting to 0 for
 * an empty or otherwise unparseable string (schema already constrains the
 * shape, so this is just the empty-string case). */
export function parseNumberValue(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
