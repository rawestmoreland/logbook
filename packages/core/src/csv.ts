import Papa from 'papaparse';
import { z } from 'zod';

import { flightFormShape, parseDateValue, parseNumberValue } from './flight-form.js';

/**
 * Canonical CSV column order (also the export format — this is a round trip,
 * not a one-way dump). `Tail Number`/`Model` stand in for `aircraftId`: the
 * importer resolves them against the shared aircraft/model catalog rather
 * than requiring a PocketBase record id in the file.
 */
export const CSV_COLUMN_KEYS = [
  'date',
  'tailNumber',
  'model',
  'route',
  'totalTime',
  'picTime',
  'sicTime',
  'dualTime',
  'soloTime',
  'nightTime',
  'actualInstrument',
  'simInstrument',
  'crossCountryTime',
  'dualGivenTime',
  'groundSimTime',
  'totalLandings',
  'dayLandingsFullStop',
  'nightLandingsFullStop',
  'approaches',
  'holding',
  'courseTracking',
  'remarks',
] as const;

export type CsvColumnKey = (typeof CSV_COLUMN_KEYS)[number];

/**
 * Accepted header spellings per column, canonical name first (the first
 * entry is what `formatFlightsAsCsv` writes back out). Modeled on
 * MyFlightbook's `CSVImporter` alias-array pattern, but scoped to our own
 * native headers plus a small handful of common alternates — not the dozen
 * third-party-export-tool spellings MyFlightbook covers.
 */
export const CSV_HEADER_ALIASES: Record<CsvColumnKey, ReadonlyArray<string>> = {
  date: ['Date', 'Date Flown', 'FlightDate'],
  tailNumber: ['Tail Number', 'Registration', 'Ident', 'AircraftID'],
  model: ['Model', 'Aircraft Type', 'Type'],
  route: ['Route', 'Full Route'],
  totalTime: ['Total Time', 'Total Duration', 'TotalTime'],
  picTime: ['PIC', 'PIC Time', 'Pilot in Command'],
  sicTime: ['SIC', 'SIC Time', 'Second in Command'],
  dualTime: ['Dual', 'Dual Received', 'DualReceived'],
  soloTime: ['Solo', 'Solo Time'],
  nightTime: ['Night', 'Night Time'],
  actualInstrument: ['Actual Instrument', 'Actual Inst', 'IMC', 'ActualInstrument'],
  simInstrument: ['Simulated Instrument', 'Sim Instrument', 'Hood', 'SimulatedInstrument'],
  crossCountryTime: ['Cross Country', 'Cross Country Time', 'XC', 'CrossCountry'],
  dualGivenTime: ['Dual Given', 'Dual Given Time', 'DualGiven', 'CFI'],
  groundSimTime: ['Ground Sim', 'Ground Sim Time', 'GroundSim', 'GroundTrainer'],
  totalLandings: ['Total Landings', 'Landings'],
  dayLandingsFullStop: ['Day Landings Full Stop', 'Full Stop Landings', 'FS Day Landings'],
  nightLandingsFullStop: ['Night Landings Full Stop', 'Night Full Stop Landings', 'FS Night Landings'],
  approaches: ['Approaches', 'Inst App', 'IAP'],
  holding: ['Holding', 'Holds', 'Hold'],
  courseTracking: ['Course Tracking', 'Tracking'],
  remarks: ['Remarks', 'Comments', 'Notes'],
};

export const CSV_COLUMN_HEADERS: Record<CsvColumnKey, string> = Object.fromEntries(
  CSV_COLUMN_KEYS.map((key) => [key, CSV_HEADER_ALIASES[key][0]]),
) as Record<CsvColumnKey, string>;

const HOUR_FIELDS = [
  'totalTime',
  'picTime',
  'sicTime',
  'dualTime',
  'soloTime',
  'nightTime',
  'actualInstrument',
  'simInstrument',
  'crossCountryTime',
  'dualGivenTime',
  'groundSimTime',
] as const satisfies ReadonlyArray<CsvColumnKey>;

const LANDING_FIELDS = [
  'totalLandings',
  'dayLandingsFullStop',
  'nightLandingsFullStop',
  'approaches',
] as const satisfies ReadonlyArray<CsvColumnKey>;

/**
 * `date`/`route`/hours/landings fields all reuse the exact
 * validators `flightFormSchema` already applies — a CSV row is a
 * `FlightFormValues` with `aircraftId` swapped for free-text
 * `tailNumber`/`model`, so the shapes line up everywhere except that one
 * field.
 */
const csvRowShape = flightFormShape.omit({ aircraftId: true }).extend({
  tailNumber: z.string().trim(),
  model: z.string().trim(),
});

export const csvRowSchema = csvRowShape.superRefine((data, ctx) => {
  if (
    parseNumberValue(data.dayLandingsFullStop) + parseNumberValue(data.nightLandingsFullStop) >
    parseNumberValue(data.totalLandings)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Full-stop landings cannot exceed total landings',
      path: ['dayLandingsFullStop'],
    });
  }

  // The `date` field's regex (shared with `flightFormSchema`) only checks
  // digit shape, not that the date is real — a native `<input type="date">`
  // can't produce "2026-99-99", but arbitrary CSV text can, and letting it
  // through here would only fail later when `parseDateValue` throws during
  // commit, aborting the whole import instead of reporting one bad row.
  try {
    parseDateValue(data.date);
  } catch (err) {
    ctx.addIssue({
      code: 'custom',
      message: err instanceof Error ? err.message : 'Not a real calendar date',
      path: ['date'],
    });
  }
});

export type CsvRowValues = z.infer<typeof csvRowShape>;

function normalizeHeaderText(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Maps a raw CSV header cell to the canonical column it aliases, or `null`
 * for a column this importer doesn't recognize (left as-is and ignored). */
export function resolveCsvHeader(raw: string): CsvColumnKey | null {
  const normalized = normalizeHeaderText(raw);
  for (const key of CSV_COLUMN_KEYS) {
    if (CSV_HEADER_ALIASES[key].some((alias) => normalizeHeaderText(alias) === normalized)) {
      return key;
    }
  }
  return null;
}

const TRUTHY_CSV_VALUES = new Set(['true', '1', 'x', 'y', 'yes']);

function parseCsvBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY_CSV_VALUES.has(value.trim().toLowerCase());
}

export type CsvRowError = { row: number; message: string };
export type CsvParsedRow = { row: number; values: CsvRowValues };

export type CsvParseResult = {
  rows: Array<CsvParsedRow>;
  errors: Array<CsvRowError>;
};

/**
 * Parses raw CSV text (already read client-side into a string — see
 * CLAUDE.md's note on why there's no file-upload plumbing here) into
 * validated rows plus per-row errors. A row that fails validation is
 * reported, not silently dropped or allowed to crash the whole import.
 */
export function parseFlightsCsv(csvText: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => resolveCsvHeader(header) ?? header,
  });

  const rows: Array<CsvParsedRow> = [];
  const errors: Array<CsvRowError> = [];

  parsed.data.forEach((raw, index) => {
    // Row 1 is the header; data rows are 1-indexed from there for a pilot
    // reading their own spreadsheet.
    const rowNumber = index + 2;

    const candidate = {
      date: (raw.date ?? '').trim(),
      tailNumber: (raw.tailNumber ?? '').trim().toUpperCase(),
      model: (raw.model ?? '').trim(),
      route: (raw.route ?? '').trim().toUpperCase(),
      totalTime: (raw.totalTime ?? '0').trim() || '0',
      picTime: (raw.picTime ?? '0').trim() || '0',
      sicTime: (raw.sicTime ?? '0').trim() || '0',
      dualTime: (raw.dualTime ?? '0').trim() || '0',
      soloTime: (raw.soloTime ?? '0').trim() || '0',
      nightTime: (raw.nightTime ?? '0').trim() || '0',
      actualInstrument: (raw.actualInstrument ?? '0').trim() || '0',
      simInstrument: (raw.simInstrument ?? '0').trim() || '0',
      crossCountryTime: (raw.crossCountryTime ?? '0').trim() || '0',
      dualGivenTime: (raw.dualGivenTime ?? '0').trim() || '0',
      groundSimTime: (raw.groundSimTime ?? '0').trim() || '0',
      totalLandings: (raw.totalLandings ?? '0').trim() || '0',
      dayLandingsFullStop: (raw.dayLandingsFullStop ?? '0').trim() || '0',
      nightLandingsFullStop: (raw.nightLandingsFullStop ?? '0').trim() || '0',
      approaches: (raw.approaches ?? '0').trim() || '0',
      holding: parseCsvBoolean(raw.holding),
      courseTracking: parseCsvBoolean(raw.courseTracking),
      remarks: raw.remarks ?? '',
    };

    const result = csvRowSchema.safeParse(candidate);
    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join('; ');
      errors.push({ row: rowNumber, message: message || 'Invalid row' });
      return;
    }
    rows.push({ row: rowNumber, values: result.data });
  });

  return { rows, errors };
}

/** Row shape `formatFlightsAsCsv` writes out — numeric/boolean fields as
 * their real types rather than the form's string encoding, since export
 * sources from stored flight records, not form state. */
export type FlightExportRow = {
  [K in (typeof HOUR_FIELDS)[number] | (typeof LANDING_FIELDS)[number]]: number;
} & {
  date: string;
  tailNumber: string;
  model: string;
  route: string;
  holding: boolean;
  courseTracking: boolean;
  remarks: string;
};

/**
 * Formats flights for export, quoting/escaping handled by papaparse rather
 * than hand-rolled (a `Remarks` field containing a comma or newline is the
 * classic case this would get wrong by hand).
 */
export function formatFlightsAsCsv(rows: Array<FlightExportRow>): string {
  const data = rows.map((row) => {
    const record: Record<string, string> = {};
    for (const key of CSV_COLUMN_KEYS) {
      const header = CSV_COLUMN_HEADERS[key];
      const value = row[key];
      if (typeof value === 'boolean') {
        record[header] = value ? 'TRUE' : 'FALSE';
      } else {
        record[header] = String(value);
      }
    }
    return record;
  });

  return Papa.unparse(data, { columns: CSV_COLUMN_KEYS.map((key) => CSV_COLUMN_HEADERS[key]) });
}

function normalizeModelText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Loose match between a CSV row's free-text `Model` and a resolved model's
 * display description (e.g. "Cessna 172S" vs "172S Skyhawk") — mirrors
 * MyFlightbook's `AircraftImportMatchRow.NormalizeModel` comparison. An
 * empty CSV model text is treated as a match (nothing to contradict), since
 * the importer only needs this to flag rows worth a second look, not to
 * gate whether an already-known tail gets used.
 */
export function modelTextMatches(csvModel: string, resolvedDescription: string): boolean {
  const a = normalizeModelText(csvModel);
  if (!a) return true;
  const b = normalizeModelText(resolvedDescription);
  if (!b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
