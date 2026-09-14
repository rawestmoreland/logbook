import Papa from 'papaparse';

import { CSV_COLUMN_HEADERS, CSV_COLUMN_KEYS } from './csv.js';

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
 * Reshapes a ForeFlight multi-table export into our native single-table CSV
 * text, ready for `parseFlightsCsv`. Throws with a user-facing message if a
 * Flights Table can't be located.
 */
export function convertForeFlightCsv(csvText: string): string {
  const parsed = Papa.parse<Array<string>>(csvText, { header: false, skipEmptyLines: false });
  const rows = parsed.data;

  let i = 0;

  // --- Aircraft Table: tail number -> "Make Model" text, since the
  // Flights Table below references aircraft by tail only. ---
  const modelByTail = new Map<string, string>();
  while (i < rows.length && cell(rows[i], 0).toLowerCase() !== 'aircraft table') i++;
  if (i < rows.length) {
    i++; // past the marker row
    while (i < rows.length && isDataTypeRow(rows[i] ?? [])) i++;
    const aircraftHeader = rows[i] ?? [];
    i++;
    const idCol = headerIndex(aircraftHeader, 'AircraftID');
    const makeCol = headerIndex(aircraftHeader, 'Make');
    const modelCol = headerIndex(aircraftHeader, 'Model');
    while (i < rows.length) {
      const row = rows[i] ?? [];
      const id = cell(row, idCol);
      // Ends on a blank separator row, or (if there isn't one) directly on
      // the "Flights Table" marker row itself.
      if (!id || id.toLowerCase() === 'flights table') break;
      const text = [cell(row, makeCol), cell(row, modelCol)].filter(Boolean).join(' ');
      if (text) modelByTail.set(id.toUpperCase(), text);
      i++;
    }
  }

  // --- Flights Table ---
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
    dayLandingsFullStop: headerIndex(header, 'DayLandingsFullStop'),
    nightLandingsFullStop: headerIndex(header, 'NightLandingsFullStop'),
    holds: headerIndex(header, 'Holds'),
    dualReceived: headerIndex(header, 'DualReceived'),
    pilotComments: headerIndex(header, 'PilotComments'),
  };
  // ForeFlight logs each approach as its own descriptor column
  // (Approach1..Approach6) rather than a single count.
  const approachCols = Array.from({ length: 6 }, (_, n) => headerIndex(header, `Approach${n + 1}`));

  const outHeader = CSV_COLUMN_KEYS.map((key) => CSV_COLUMN_HEADERS[key]);
  const outRows = flightRows.map((row) => {
    const tail = cell(row, col.aircraftId).toUpperCase();
    // ForeFlight only tracks landings *to a full stop*, not a separate
    // touch-and-go count — the full-stop figure is the closest honest
    // reading of "day/night landings" it exports, so it fills both our
    // total and full-stop columns (leaving the total at 0 while a nonzero
    // full-stop count came through would trip our own "full stop can't
    // exceed total" rule).
    const dayFullStop = cell(row, col.dayLandingsFullStop);
    const nightFullStop = cell(row, col.nightLandingsFullStop);
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
      dayLandings: dayFullStop,
      nightLandings: nightFullStop,
      dayLandingsFullStop: dayFullStop,
      approaches: String(approaches),
      // ForeFlight logs a hold *count*, not a boolean, and has no
      // equivalent of "course tracking" at all.
      holding: holds > 0 ? 'TRUE' : 'FALSE',
      courseTracking: 'FALSE',
      remarks: cell(row, col.pilotComments),
    };
    return CSV_COLUMN_KEYS.map((key) => values[key]);
  });

  return Papa.unparse([outHeader, ...outRows]);
}
