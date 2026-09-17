import Papa from 'papaparse';

import { CSV_COLUMN_HEADERS, CSV_COLUMN_KEYS } from './csv.js';

import type { AircraftInstanceType } from './aircraft.js';
import type { AircraftCsvParseResult } from './csv-aircraft.js';
import type { CsvColumnKey } from './csv.js';

/**
 * ForeFlight's logbook CSV export isn't one table, it's two, back to back
 * in the same file: an "Aircraft Table" (the pilot's/school's fleet, keyed
 * by tail number, carrying make/model) followed by a "Flights Table" (one
 * row per flight, referencing aircraft by tail only — no model column of
 * its own). `parseFlightsCsv` expects a single header row followed by data
 * rows, so this reshapes a ForeFlight export into that native shape first
 * — detection/adaptation lives here, isolated from the native parser.
 */
export function isForeFlightCsv(csvText: string): boolean {
  const firstLine = csvText.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.trim().toLowerCase().startsWith('foreflight');
}

// Older ForeFlight exports insert a row of column *types* ("Text", "hhmm",
// "Decimal", "Boolean") between a table's marker row and its real header
// row — skip it if present, same as MyFlightbook's ForeFlight importer.
const DATA_TYPE_CELL = /^(text|hhmm|decimal|boolean)$/i;
function isDataTypeRow(row: ReadonlyArray<string>): boolean {
  return row.some((c) => DATA_TYPE_CELL.test(c.trim()));
}

function cell(row: ReadonlyArray<string> | undefined, index: number): string {
  if (!row || index < 0 || index >= row.length) return '';
  return (row[index] ?? '').trim();
}

function headerIndex(header: ReadonlyArray<string>, name: string): number {
  return header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
}

/**
 * Maps ForeFlight's `EquipmentType` Aircraft Table column to our
 * `AircraftInstanceType`. ForeFlight's own taxonomy (an "aircraft" flag plus
 * device-class codes like "aatd"/"ffs"/"ftd") doesn't line up 1:1 with the
 * FAA-currency-rule taxonomy this app keys off, so this is a defensible best
 * guess, not a certified mapping — the caller surfaces it as a pre-selected
 * suggestion in the resolution UI, never applies it silently:
 *   - "aatd" (Advanced Aviation Training Device) -> certified_atd, since
 *     that's literally what an AATD is.
 *   - "ffs" (Full Flight Simulator) -> certified_ifr_landings_sim, since an
 *     FFS is the device class most likely to be approved for full-stop
 *     landing credit as well as IFR currency.
 *   - "ftd" (Flight Training Device) -> certified_ifr_sim, a device class
 *     typically approved for IFR approaches/holds but not landings.
 *   - "aircraft", blank (older ForeFlight exports have no EquipmentType
 *     column at all), and anything else unrecognized all default to `real`
 *     — the safe choice, since misreading an absent/unknown column as "this
 *     is a simulator" would wrongly flag every real aircraft in an export
 *     that simply predates this column.
 */
export function foreflightEquipmentTypeToInstanceType(equipmentType: string): AircraftInstanceType {
  switch (equipmentType.trim().toLowerCase()) {
    case 'aatd':
      return 'certified_atd';
    case 'ffs':
      return 'certified_ifr_landings_sim';
    case 'ftd':
      return 'certified_ifr_sim';
    default:
      return 'real';
  }
}

export type ConvertForeFlightCsvResult = {
  csvText: string;
  /** Per-tail suggested `AircraftInstanceType`, derived from the Aircraft
   * Table's `EquipmentType` column — a hint for the resolution UI to
   * pre-select, keyed by (uppercased) tail number. Instance type is a
   * per-aircraft property, not a per-flight one, and the native CSV shape
   * has no column for it, so it travels as this side channel alongside the
   * converted CSV rather than as a pseudo-column. */
  instanceTypeHintByTail: Map<string, AircraftInstanceType>;
};

type ForeFlightAircraftTableRow = {
  /** 1-based line number within the whole export, for user-facing "Row N"
   * references from the aircraft-only importer (see
   * `extractForeFlightAircraftTable`) — the Aircraft Table has no header-
   * relative row numbering of its own the way a single-table CSV does. */
  row: number;
  tailNumber: string;
  modelText: string;
  instanceType: AircraftInstanceType;
};

/**
 * Scans a ForeFlight export's parsed rows for its Aircraft Table section and
 * returns one row per tail, tolerating the same quirks `convertForeFlightCsv`
 * always has (an optional legacy data-type row, a missing blank separator
 * before "Flights Table"). Shared by `convertForeFlightCsv` (which only
 * needs the Make/Model text and the `EquipmentType` hint, keyed by tail) and
 * `extractForeFlightAircraftTable` (which needs the whole Aircraft Table as
 * importable rows, ignoring the Flights Table entirely) so the section-
 * scanning logic isn't duplicated between the two.
 */
function parseForeFlightAircraftTable(rows: ReadonlyArray<ReadonlyArray<string>>): {
  aircraftRows: Array<ForeFlightAircraftTableRow>;
  /** Index to resume scanning from (e.g. for a Flights Table search) —
   * either a blank separator row or the "Flights Table" marker itself. */
  nextIndex: number;
} {
  const aircraftRows: Array<ForeFlightAircraftTableRow> = [];

  let i = 0;
  while (i < rows.length && cell(rows[i], 0).toLowerCase() !== 'aircraft table') i++;
  if (i >= rows.length) return { aircraftRows, nextIndex: i };

  i++; // past the marker row
  while (i < rows.length && isDataTypeRow(rows[i] ?? [])) i++;
  const aircraftHeader = rows[i] ?? [];
  i++;
  const idCol = headerIndex(aircraftHeader, 'AircraftID');
  const makeCol = headerIndex(aircraftHeader, 'Make');
  const modelCol = headerIndex(aircraftHeader, 'Model');
  const equipmentTypeCol = headerIndex(aircraftHeader, 'EquipmentType');

  while (i < rows.length) {
    const row = rows[i] ?? [];
    const id = cell(row, idCol);
    // Ends on a blank separator row, or (if there isn't one) directly on
    // the "Flights Table" marker row itself.
    if (!id || id.toLowerCase() === 'flights table') break;
    aircraftRows.push({
      row: i + 1,
      tailNumber: id.toUpperCase(),
      modelText: [cell(row, makeCol), cell(row, modelCol)].filter(Boolean).join(' '),
      instanceType: foreflightEquipmentTypeToInstanceType(cell(row, equipmentTypeCol)),
    });
    i++;
  }

  return { aircraftRows, nextIndex: i };
}

/**
 * Parses just a ForeFlight export's Aircraft Table into importable aircraft
 * rows, for the `/aircraft` page's aircraft-only importer — the Flights
 * Table (if present at all) is never read. A pilot can hand this the same
 * full logbook export `convertForeFlightCsv` would use for a flights import,
 * or just the Aircraft Table section on its own; either way only the fleet
 * list comes out. Returns no rows (not an error) if there's no Aircraft
 * Table to find, same as a native aircraft CSV with a header but no data
 * rows.
 */
export function extractForeFlightAircraftTable(csvText: string): AircraftCsvParseResult {
  const parsed = Papa.parse<Array<string>>(csvText, { header: false, skipEmptyLines: false });
  const { aircraftRows } = parseForeFlightAircraftTable(parsed.data);
  return {
    rows: aircraftRows.map((r) => ({
      row: r.row,
      tailNumber: r.tailNumber,
      modelText: r.modelText,
      instanceType: r.instanceType,
    })),
    errors: [],
  };
}

/**
 * Reshapes a ForeFlight multi-table export into our native single-table CSV
 * text, ready for `parseFlightsCsv`. Throws with a user-facing message if a
 * Flights Table can't be located.
 */
export function convertForeFlightCsv(csvText: string): ConvertForeFlightCsvResult {
  const parsed = Papa.parse<Array<string>>(csvText, { header: false, skipEmptyLines: false });
  const rows = parsed.data;

  // --- Aircraft Table: tail number -> "Make Model" text, since the
  // Flights Table below references aircraft by tail only. ---
  const { aircraftRows, nextIndex } = parseForeFlightAircraftTable(rows);
  const modelByTail = new Map<string, string>();
  const instanceTypeHintByTail = new Map<string, AircraftInstanceType>();
  for (const r of aircraftRows) {
    if (r.modelText) modelByTail.set(r.tailNumber, r.modelText);
    instanceTypeHintByTail.set(r.tailNumber, r.instanceType);
  }

  // --- Flights Table ---
  let i = nextIndex;
  while (i < rows.length && !cell(rows[i], 0).toLowerCase().startsWith('flights table')) i++;
  if (i >= rows.length) {
    throw new Error('Could not find a "Flights Table" section in this ForeFlight export.');
  }
  i++; // past the marker row
  while (i < rows.length && isDataTypeRow(rows[i] ?? [])) i++;
  const header = (rows[i] ?? []).map((h) => h.trim());
  i++;
  const flightRows = rows
    .slice(i)
    .filter((row) => cell(row, 0) !== '' || (row?.length ?? 0) > 1);

  const col = {
    date: headerIndex(header, 'Date'),
    aircraftId: headerIndex(header, 'AircraftID'),
    from: headerIndex(header, 'From'),
    to: headerIndex(header, 'To'),
    totalTime: headerIndex(header, 'TotalTime'),
    pic: headerIndex(header, 'PIC'),
    sic: headerIndex(header, 'SIC'),
    night: headerIndex(header, 'Night'),
    solo: headerIndex(header, 'Solo'),
    actualInstrument: headerIndex(header, 'ActualInstrument'),
    simulatedInstrument: headerIndex(header, 'SimulatedInstrument'),
    allLandings: headerIndex(header, 'AllLandings'),
    dayLandingsFullStop: headerIndex(header, 'DayLandingsFullStop'),
    nightLandingsFullStop: headerIndex(header, 'NightLandingsFullStop'),
    holds: headerIndex(header, 'Holds'),
    dualReceived: headerIndex(header, 'DualReceived'),
    crossCountry: headerIndex(header, 'CrossCountry'),
    dualGiven: headerIndex(header, 'DualGiven'),
    simulatedFlight: headerIndex(header, 'SimulatedFlight'),
    pilotComments: headerIndex(header, 'PilotComments'),
  };
  // ForeFlight logs each approach as its own descriptor column
  // (Approach1..Approach6) rather than a single count.
  const approachCols = Array.from({ length: 6 }, (_, n) => headerIndex(header, `Approach${n + 1}`));

  const outHeader = CSV_COLUMN_KEYS.map((key) => CSV_COLUMN_HEADERS[key]);
  const outRows = flightRows.map((row) => {
    const tail = cell(row, col.aircraftId).toUpperCase();
    // `AllLandings` is ForeFlight's true total — it includes touch-and-goes,
    // which `DayLandingsFullStop`/`NightLandingsFullStop` don't count at
    // all. Summing just the full-stop columns instead (as this used to)
    // undercounts any flight with touch-and-goes, and reads as zero
    // landings entirely for a flight that was all pattern work.
    const dayFullStop = cell(row, col.dayLandingsFullStop);
    const nightFullStop = cell(row, col.nightLandingsFullStop);
    const totalLandings = cell(row, col.allLandings) || '0';
    const holds = Number(cell(row, col.holds) || '0');
    const approaches = approachCols.filter((idx) => cell(row, idx) !== '').length;

    const values: Record<CsvColumnKey, string> = {
      date: cell(row, col.date),
      tailNumber: tail,
      model: modelByTail.get(tail) ?? '',
      routeFrom: cell(row, col.from),
      routeTo: cell(row, col.to),
      totalTime: cell(row, col.totalTime),
      picTime: cell(row, col.pic),
      sicTime: cell(row, col.sic),
      dualTime: cell(row, col.dualReceived),
      soloTime: cell(row, col.solo),
      nightTime: cell(row, col.night),
      actualInstrument: cell(row, col.actualInstrument),
      simInstrument: cell(row, col.simulatedInstrument),
      crossCountryTime: cell(row, col.crossCountry),
      dualGivenTime: cell(row, col.dualGiven),
      // ForeFlight splits simulator time (`SimulatedFlight`) from ground
      // instruction (`GroundTraining`, no flight-hours equivalent); our
      // "ground sim" field means device/simulator time (see the
      // `GroundTrainer` alias in csv.ts), so it maps from the former.
      groundSimTime: cell(row, col.simulatedFlight),
      totalLandings,
      dayLandingsFullStop: dayFullStop,
      nightLandingsFullStop: nightFullStop,
      approaches: String(approaches),
      // ForeFlight logs a hold *count*, not a boolean, and has no
      // equivalent of "course tracking" at all.
      holding: holds > 0 ? 'TRUE' : 'FALSE',
      courseTracking: 'FALSE',
      remarks: cell(row, col.pilotComments),
    };
    return CSV_COLUMN_KEYS.map((key) => values[key]);
  });

  return {
    csvText: Papa.unparse([outHeader, ...outRows]),
    instanceTypeHintByTail,
  };
}
