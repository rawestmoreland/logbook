import Papa from 'papaparse';

import { AIRCRAFT_INSTANCE_TYPES, AIRCRAFT_INSTANCE_TYPE_LABELS, isAircraftInstanceType } from './aircraft.js';

import type { AircraftInstanceType } from './aircraft.js';

/**
 * A bare aircraft-list CSV, for bulk-adding tails to a fleet without any
 * flight data (the `/aircraft` page's importer — see CLAUDE.md's import
 * notes). Distinct from `csv.ts`'s flight CSV: there's no date/route/hours
 * here, just enough to resolve each tail to a catalog model, the same way a
 * flight CSV's free-text `Model` column does.
 *
 * Accepted columns (header row required, order doesn't matter):
 *   - Tail Number (aliases: Registration, Ident, AircraftID) — required
 *   - Manufacturer (alias: Make) — optional
 *   - Model (aliases: Aircraft Type, Type) — optional, but needed for
 *     `findConfidentModelMatch`/`findAircraftModelAlias` to have anything to
 *     go on; a tail with no Manufacturer/Model text just falls through to
 *     manual resolution, same as an unrecognized flight-CSV model.
 *   - Instance Type (aliases: Type of Aircraft, EquipmentType) — optional,
 *     matched case-insensitively against either the internal key (e.g.
 *     "certified_atd") or its display label (e.g. "Certified ATD"); an
 *     unrecognized or blank value just leaves the resolution UI's default.
 */
export const AIRCRAFT_CSV_COLUMN_KEYS = ['tailNumber', 'manufacturer', 'model', 'instanceType'] as const;

export type AircraftCsvColumnKey = (typeof AIRCRAFT_CSV_COLUMN_KEYS)[number];

export const AIRCRAFT_CSV_HEADER_ALIASES: Record<AircraftCsvColumnKey, ReadonlyArray<string>> = {
  tailNumber: ['Tail Number', 'Registration', 'Ident', 'AircraftID'],
  manufacturer: ['Manufacturer', 'Make'],
  model: ['Model', 'Aircraft Type', 'Type'],
  instanceType: ['Instance Type', 'Type of Aircraft', 'EquipmentType'],
};

function normalizeHeaderText(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Maps a raw CSV header cell to the canonical column it aliases, or `null`
 * for a column this importer doesn't recognize (left as-is and ignored). */
export function resolveAircraftCsvHeader(raw: string): AircraftCsvColumnKey | null {
  const normalized = normalizeHeaderText(raw);
  for (const key of AIRCRAFT_CSV_COLUMN_KEYS) {
    if (AIRCRAFT_CSV_HEADER_ALIASES[key].some((alias) => normalizeHeaderText(alias) === normalized)) {
      return key;
    }
  }
  return null;
}

function parseInstanceTypeValue(raw: string | undefined): AircraftInstanceType | undefined {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (isAircraftInstanceType(normalized)) return normalized;
  return AIRCRAFT_INSTANCE_TYPES.find((t) => AIRCRAFT_INSTANCE_TYPE_LABELS[t].toLowerCase() === normalized);
}

export type AircraftCsvRow = {
  row: number;
  tailNumber: string;
  /** Free-text model description built from the Manufacturer/Model columns
   * (joined the same way `convertForeFlightCsv` joins ForeFlight's Make and
   * Model) — fed straight into `findConfidentModelMatch`/
   * `findAircraftModelAlias`, same as a flight CSV row's `model` field. */
  modelText: string;
  instanceType?: AircraftInstanceType;
};

export type AircraftCsvRowError = { row: number; message: string };

export type AircraftCsvParseResult = {
  rows: Array<AircraftCsvRow>;
  errors: Array<AircraftCsvRowError>;
};

const TAIL_NUMBER_HEADER_LIST = AIRCRAFT_CSV_HEADER_ALIASES.tailNumber.join(', ');

/**
 * Parses raw CSV text (already read client-side into a string) into aircraft
 * rows plus per-row errors — a row missing its one required field (Tail
 * Number) is reported, not silently dropped.
 *
 * If the header row itself doesn't contain anything this parser recognizes
 * as a Tail Number column, every data row would otherwise fail the same
 * "Tail number is required" check individually — a wall of identical
 * per-row errors that buries the actual problem (the file's headers, not
 * its data). Detecting that case up front and reporting it once, against
 * the header row, is much more actionable.
 */
export function parseAircraftCsv(csvText: string): AircraftCsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => resolveAircraftCsvHeader(header) ?? header,
  });

  if (!parsed.meta.fields?.includes('tailNumber' satisfies AircraftCsvColumnKey)) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `No Tail Number column found — expected one of: ${TAIL_NUMBER_HEADER_LIST}.`,
        },
      ],
    };
  }

  const rows: Array<AircraftCsvRow> = [];
  const errors: Array<AircraftCsvRowError> = [];

  parsed.data.forEach((raw, index) => {
    // Row 1 is the header; data rows are 1-indexed from there for a pilot
    // reading their own spreadsheet.
    const rowNumber = index + 2;

    const tailNumber = (raw.tailNumber ?? '').trim().toUpperCase();
    if (!tailNumber) {
      errors.push({ row: rowNumber, message: 'Tail number is required' });
      return;
    }

    const manufacturer = (raw.manufacturer ?? '').trim();
    const model = (raw.model ?? '').trim();
    const modelText = [manufacturer, model].filter(Boolean).join(' ');
    const instanceType = parseInstanceTypeValue(raw.instanceType);

    rows.push({ row: rowNumber, tailNumber, modelText, instanceType });
  });

  return { rows, errors };
}
