import Papa from 'papaparse';
import { z } from 'zod';

import { flightFormShape, parseDateValue, parseNumberValue } from './flight-form.js';
import { FLIGHT_PROPERTY_TYPES, getFlightPropertyType } from './flight-properties.js';

import type { FlightPropertyEntry } from './flight-properties.js';

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
  'routeFrom',
  'routeTo',
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
  routeFrom: ['From', 'Departure', 'Origin'],
  routeTo: ['To', 'Arrival', 'Destination'],
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

/**
 * Extra accepted header spellings for property columns, beyond the
 * property's own `title` (which is always accepted and is what
 * `formatFlightsAsCsv` writes). Taken from MyFlightbook's `CSVImporter`
 * `PropNameAliases`, where a property column is matched by its
 * `CustomPropertyType.Title` plus the aliases listed against that title.
 *
 * Only add an entry once the spelling is confirmed against MyFlightbook's
 * importer code or a real MyFlightbook export — don't guess. Keyed by
 * `FlightPropertyType.id`.
 */
const MYFLIGHTBOOK_PROPERTY_HEADER_ALIASES: Readonly<Record<string, ReadonlyArray<string>>> = {
  // MyFlightbook's title is "Name of PIC"; "PIC Name" (our own title) is
  // one of its aliases too.
  pic_name: ['Name of PIC', 'pic_name', 'Captain'],
  // MyFlightbook's title is "Night Vision Time (Goggles)".
  nvg_time: ['Night Vision Time (Goggles)', 'NVG'],
};

/**
 * Accepted header spellings per property id, in the style of
 * `CSV_HEADER_ALIASES`: the property's title first (what export writes),
 * then MyFlightbook aliases. Every catalog property has an entry.
 */
export const CSV_PROPERTY_HEADER_ALIASES: Record<string, ReadonlyArray<string>> = Object.fromEntries(
  FLIGHT_PROPERTY_TYPES.map((t) => [t.id, [t.title, ...(MYFLIGHTBOOK_PROPERTY_HEADER_ALIASES[t.id] ?? [])]]),
);

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
 * `date`/`routeFrom`/`routeTo`/hours/landings fields all reuse the exact
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

/** Maps a raw CSV header cell to the id of the flight property it names
 * (by title or MyFlightbook alias, case- and whitespace-insensitive), or
 * `null`. Native columns are not considered here — see `resolveCsvHeader`. */
export function resolveCsvPropertyHeader(raw: string): string | null {
  const normalized = normalizeHeaderText(raw);
  for (const type of FLIGHT_PROPERTY_TYPES) {
    if (CSV_PROPERTY_HEADER_ALIASES[type.id]!.some((alias) => normalizeHeaderText(alias) === normalized)) {
      return type.id;
    }
  }
  return null;
}

// Parsed-row key for a property column. Namespaced so it can never collide
// with a native column key, and so an unrecognized header can't be mistaken
// for one (see `IGNORED_COLUMN_PREFIX`).
const PROPERTY_COLUMN_PREFIX = 'property:';
// Unrecognized and duplicate columns are renamed to this (plus the column
// index) so the row reader can never pick them up by accident — e.g. a
// header that happens to spell a native key like "routeFrom".
const IGNORED_COLUMN_PREFIX = 'ignored:';

const TRUTHY_CSV_VALUES = new Set(['true', '1', 'x', 'y', 'yes']);

function parseCsvBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY_CSV_VALUES.has(value.trim().toLowerCase());
}

export type CsvRowError = { row: number; message: string };
export type CsvParsedRow = { row: number; values: CsvRowValues };

/** A header the importer read but did not use — surfaced so a pilot can see
 * what didn't come across. `duplicate` means the header resolved to a column
 * that an earlier header already supplied; the first one wins. */
export type CsvIgnoredColumn = { header: string; reason: 'unrecognized' | 'duplicate' };

export type CsvParseResult = {
  rows: Array<CsvParsedRow>;
  errors: Array<CsvRowError>;
  ignoredColumns: Array<CsvIgnoredColumn>;
};

/**
 * Parses raw CSV text (already read client-side into a string — see
 * CLAUDE.md's note on why there's no file-upload plumbing here) into
 * validated rows plus per-row errors. A row that fails validation is
 * reported, not silently dropped or allowed to crash the whole import.
 */
export function parseFlightsCsv(csvText: string): CsvParseResult {
  const ignoredColumns: Array<CsvIgnoredColumn> = [];
  const seenTargets = new Set<string>();

  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header, index) => {
      const nativeKey = resolveCsvHeader(header);
      const propertyId = nativeKey ? null : resolveCsvPropertyHeader(header);
      const target = nativeKey ?? (propertyId ? `${PROPERTY_COLUMN_PREFIX}${propertyId}` : null);

      if (target && !seenTargets.has(target)) {
        seenTargets.add(target);
        return target;
      }
      // A blank header (e.g. a trailing comma) isn't worth reporting.
      const text = header.trim();
      if (text && !ignoredColumns.some((c) => c.header === text)) {
        ignoredColumns.push({ header: text, reason: target ? 'duplicate' : 'unrecognized' });
      }
      return `${IGNORED_COLUMN_PREFIX}${index}`;
    },
  });

  const rows: Array<CsvParsedRow> = [];
  const errors: Array<CsvRowError> = [];

  parsed.data.forEach((raw, index) => {
    // Row 1 is the header; data rows are 1-indexed from there for a pilot
    // reading their own spreadsheet.
    const rowNumber = index + 2;

    // A blank cell is "no entry" — the entry schema rejects an empty value.
    const properties: Array<FlightPropertyEntry> = [];
    for (const type of FLIGHT_PROPERTY_TYPES) {
      const value = (raw[`${PROPERTY_COLUMN_PREFIX}${type.id}`] ?? '').trim();
      if (value) properties.push({ propertyId: type.id, value });
    }

    const candidate = {
      date: (raw.date ?? '').trim(),
      tailNumber: (raw.tailNumber ?? '').trim().toUpperCase(),
      model: (raw.model ?? '').trim(),
      routeFrom: (raw.routeFrom ?? '').trim().toUpperCase(),
      routeTo: (raw.routeTo ?? '').trim().toUpperCase(),
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
      properties,
    };

    const result = csvRowSchema.safeParse(candidate);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => {
          // A property issue's path is ['properties', index, 'value']; name
          // the property, since "Enter a number" alone doesn't say which.
          const [head, index] = issue.path;
          if (head === 'properties' && typeof index === 'number') {
            const type = getFlightPropertyType(properties[index]?.propertyId ?? '');
            if (type) return `${type.title}: ${issue.message}`;
          }
          return issue.message;
        })
        .join('; ');
      errors.push({ row: rowNumber, message: message || 'Invalid row' });
      return;
    }
    rows.push({ row: rowNumber, values: result.data });
  });

  return { rows, errors, ignoredColumns };
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
  routeFrom: string;
  routeTo: string;
  route: string;
  holding: boolean;
  courseTracking: boolean;
  remarks: string;
  /** Custom flight properties — each catalog entry becomes its own export
   * column (present-or-blank per flight). Optional so callers with no
   * properties (e.g. the printable logbook) needn't set it. */
  properties?: Array<FlightPropertyEntry>;
};

/**
 * Property columns, one per `FLIGHT_PROPERTY_TYPES` entry, headed by the
 * property's title (MyFlightbook's own convention of a column per named
 * property). Deliberately not in `CSV_COLUMN_KEYS`/`CSV_HEADER_ALIASES`:
 * they're variable per catalog entry rather than fixed native fields.
 * `parseFlightsCsv` reads them back via `CSV_PROPERTY_HEADER_ALIASES`.
 */
export const CSV_PROPERTY_COLUMN_HEADERS: ReadonlyArray<string> = FLIGHT_PROPERTY_TYPES.map(
  (t) => t.title,
);

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
    const valuesById = new Map((row.properties ?? []).map((p) => [p.propertyId, p.value]));
    for (const type of FLIGHT_PROPERTY_TYPES) {
      record[type.title] = valuesById.get(type.id) ?? '';
    }
    return record;
  });

  return Papa.unparse(data, {
    columns: [...CSV_COLUMN_KEYS.map((key) => CSV_COLUMN_HEADERS[key]), ...CSV_PROPERTY_COLUMN_HEADERS],
  });
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
