import { describe, expect, it } from 'vitest';

import {
  CSV_COLUMN_HEADERS,
  csvRowSchema,
  formatFlightsAsCsv,
  modelTextMatches,
  parseFlightsCsv,
  resolveCsvHeader,
  type FlightExportRow,
} from './csv.js';

describe('resolveCsvHeader', () => {
  it('matches the canonical native header', () => {
    expect(resolveCsvHeader('Tail Number')).toBe('tailNumber');
    expect(resolveCsvHeader('Total Time')).toBe('totalTime');
  });

  it('matches a common alternate spelling, case- and whitespace-insensitively', () => {
    expect(resolveCsvHeader('registration')).toBe('tailNumber');
    expect(resolveCsvHeader('  Registration  ')).toBe('tailNumber');
    expect(resolveCsvHeader('Ident')).toBe('tailNumber');
    expect(resolveCsvHeader('Total Duration')).toBe('totalTime');
  });

  it('returns null for an unrecognized header', () => {
    expect(resolveCsvHeader('Some Vendor Specific Column')).toBeNull();
  });
});

function csvRow(overrides: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    Date: '2026-09-09',
    'Tail Number': 'N12345',
    Model: 'Cessna 172S',
    From: 'KPAO',
    To: 'KMRY',
    'Total Time': '1.5',
    PIC: '1.5',
    Remarks: 'A normal flight',
  };
  return Object.entries({ ...base, ...overrides })
    .map(([, v]) => v)
    .join(',');
}

function headerRow(overrides: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    Date: 'Date',
    'Tail Number': 'Tail Number',
    Model: 'Model',
    From: 'From',
    To: 'To',
    'Total Time': 'Total Time',
    PIC: 'PIC',
    Remarks: 'Remarks',
  };
  return Object.keys({ ...base, ...overrides }).join(',');
}

describe('parseFlightsCsv', () => {
  it('parses a well-formed row using native headers', () => {
    const csv = `${headerRow()}\n${csvRow()}`;
    const { rows, errors } = parseFlightsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values).toMatchObject({
      date: '2026-09-09',
      tailNumber: 'N12345',
      model: 'Cessna 172S',
      routeFrom: 'KPAO',
      routeTo: 'KMRY',
      totalTime: '1.5',
      picTime: '1.5',
      remarks: 'A normal flight',
    });
    expect(rows[0]!.row).toBe(2);
  });

  it('parses using alias headers (ForeFlight-ish spellings)', () => {
    const csv = [
      'Date Flown,Registration,Aircraft Type,Departure,Arrival,Total Duration',
      '2026-09-09,N12345,Cessna 172S,KPAO,KMRY,1.5',
    ].join('\n');
    const { rows, errors } = parseFlightsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values.tailNumber).toBe('N12345');
    expect(rows[0]!.values.totalTime).toBe('1.5');
  });

  it('defaults missing hours/landings columns to 0 and booleans to false', () => {
    const csv = `${headerRow()}\n${csvRow()}`;
    const { rows } = parseFlightsCsv(csv);
    expect(rows[0]!.values.nightTime).toBe('0');
    expect(rows[0]!.values.dayLandings).toBe('0');
    expect(rows[0]!.values.holding).toBe(false);
  });

  it('treats a blank tail number as anonymous rather than failing', () => {
    const csv = `${headerRow()}\n${csvRow({ 'Tail Number': '' })}`;
    const { rows, errors } = parseFlightsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]!.values.tailNumber).toBe('');
  });

  it('parses boolean columns from TRUE/FALSE and 1/0', () => {
    const csv = [
      `${headerRow()},Holding,Course Tracking`,
      `${csvRow()},TRUE,1`,
    ].join('\n');
    const { rows } = parseFlightsCsv(csv);
    expect(rows[0]!.values.holding).toBe(true);
    expect(rows[0]!.values.courseTracking).toBe(true);
  });

  it('reports an invalid date clearly instead of dropping the row silently', () => {
    const csv = `${headerRow()}\n${csvRow({ Date: 'not-a-date' })}`;
    const { rows, errors } = parseFlightsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.row).toBe(2);
    expect(errors[0]!.message).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a date that matches the YYYY-MM-DD shape but is not a real calendar date', () => {
    // A regression case: "2026-99-99" passes the shape regex (4/2/2 digits)
    // but isn't a real date — letting it through here means it only fails
    // later, deep inside commit, aborting the whole import instead of
    // reporting this one row.
    const csv = `${headerRow()}\n${csvRow({ Date: '2026-99-99' })}`;
    const { rows, errors } = parseFlightsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/not a real calendar date/);
  });

  it('reports dayLandingsFullStop exceeding dayLandings', () => {
    const csv = [
      `${headerRow()},Day Landings,Day Landings Full Stop`,
      `${csvRow()},2,3`,
    ].join('\n');
    const { rows, errors } = parseFlightsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]!.message).toMatch(/Cannot exceed day landings/);
  });

  it('continues past a bad row and still parses the good ones', () => {
    const csv = [headerRow(), csvRow({ Date: 'bad' }), csvRow()].join('\n');
    const { rows, errors } = parseFlightsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});

describe('csvRowSchema', () => {
  it('is the FlightFormValues shape with aircraftId swapped for tailNumber/model', () => {
    const result = csvRowSchema.safeParse({
      date: '2026-09-09',
      tailNumber: 'N12345',
      model: 'Cessna 172S',
      routeFrom: 'KPAO',
      routeTo: 'KMRY',
      totalTime: '1.5',
      picTime: '1.5',
      sicTime: '0',
      dualTime: '0',
      soloTime: '0',
      nightTime: '0',
      actualInstrument: '0',
      simInstrument: '0',
      crossCountryTime: '0',
      dualGivenTime: '0',
      groundSimTime: '0',
      dayLandings: '1',
      nightLandings: '0',
      dayLandingsFullStop: '1',
      approaches: '0',
      holding: false,
      courseTracking: false,
      remarks: '',
    });
    expect(result.success).toBe(true);
  });
});

describe('formatFlightsAsCsv / parseFlightsCsv round trip', () => {
  function exportRow(overrides: Partial<FlightExportRow> = {}): FlightExportRow {
    return {
      date: '2026-09-09',
      tailNumber: 'N12345',
      model: 'Cessna 172S',
      routeFrom: 'KPAO',
      routeTo: 'KMRY',
      totalTime: 1.5,
      picTime: 1.5,
      sicTime: 0,
      dualTime: 0,
      soloTime: 0,
      nightTime: 0,
      actualInstrument: 0,
      simInstrument: 0,
      crossCountryTime: 0,
      dualGivenTime: 0,
      groundSimTime: 0,
      dayLandings: 1,
      nightLandings: 0,
      dayLandingsFullStop: 1,
      approaches: 0,
      holding: false,
      courseTracking: false,
      remarks: '',
      ...overrides,
    };
  }

  it('writes the documented canonical header row', () => {
    const csv = formatFlightsAsCsv([exportRow()]);
    const headerLine = csv.split('\r\n')[0]!.split('\n')[0]!;
    expect(headerLine).toBe(
      [
        'Date',
        'Tail Number',
        'Model',
        'From',
        'To',
        'Total Time',
        'PIC',
        'SIC',
        'Dual',
        'Solo',
        'Night',
        'Actual Instrument',
        'Simulated Instrument',
        'Cross Country',
        'Dual Given',
        'Ground Sim',
        'Day Landings',
        'Night Landings',
        'Day Landings Full Stop',
        'Approaches',
        'Holding',
        'Course Tracking',
        'Remarks',
      ].join(','),
    );
    expect(headerLine).toBe(Object.values(CSV_COLUMN_HEADERS).join(','));
  });

  it('round-trips a field containing a comma and a newline through Remarks', () => {
    const csv = formatFlightsAsCsv([
      exportRow({ remarks: 'Diverted, then landed.\nGreat flight.' }),
    ]);
    const { rows, errors } = parseFlightsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]!.values.remarks).toBe('Diverted, then landed.\nGreat flight.');
  });

  it('round-trips numeric and boolean fields back to matching form values', () => {
    const csv = formatFlightsAsCsv([exportRow({ holding: true, courseTracking: true })]);
    const { rows } = parseFlightsCsv(csv);
    expect(rows[0]!.values.totalTime).toBe('1.5');
    expect(rows[0]!.values.holding).toBe(true);
    expect(rows[0]!.values.courseTracking).toBe(true);
    expect(rows[0]!.values.tailNumber).toBe('N12345');
  });
});

describe('modelTextMatches', () => {
  it('matches identical text regardless of case/punctuation', () => {
    expect(modelTextMatches('Cessna 172S', 'cessna-172s')).toBe(true);
  });

  it('matches when one description is a substring of the other', () => {
    expect(modelTextMatches('172S', 'Cessna 172S Skyhawk')).toBe(true);
    expect(modelTextMatches('172S Skyhawk', '172S')).toBe(true);
  });

  it('does not match unrelated models', () => {
    expect(modelTextMatches('Piper Warrior', 'Cessna 172S')).toBe(false);
  });

  it('treats blank CSV model text as a match (nothing to contradict)', () => {
    expect(modelTextMatches('', 'Cessna 172S')).toBe(true);
  });

  it('does not match real text against a blank description', () => {
    expect(modelTextMatches('Cessna 172S', '')).toBe(false);
  });
});
