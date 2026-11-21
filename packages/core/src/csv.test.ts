import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import {
  CSV_COLUMN_HEADERS,
  CSV_HEADER_ALIASES,
  CSV_PROPERTY_COLUMN_HEADERS,
  CSV_PROPERTY_HEADER_ALIASES,
  csvRowSchema,
  formatFlightsAsCsv,
  modelTextMatches,
  parseFlightsCsv,
  resolveCsvHeader,
  resolveCsvPropertyHeader,
  type FlightExportRow,
} from './csv.js';
import { FLIGHT_PROPERTY_TYPES } from './flight-properties.js';

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
    expect(rows[0]!.values.totalLandings).toBe('0');
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

  it('reports full-stop landings exceeding total landings', () => {
    const csv = [
      `${headerRow()},Total Landings,Day Landings Full Stop`,
      `${csvRow()},2,3`,
    ].join('\n');
    const { rows, errors } = parseFlightsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]!.message).toMatch(/Full-stop landings cannot exceed total landings/);
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
      totalLandings: '1',
      dayLandingsFullStop: '1',
      nightLandingsFullStop: '0',
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
      route: '',
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
      totalLandings: 1,
      dayLandingsFullStop: 1,
      nightLandingsFullStop: 0,
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
        'Route',
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
        'Total Landings',
        'Day Landings Full Stop',
        'Night Landings Full Stop',
        'Approaches',
        'Holding',
        'Course Tracking',
        'Remarks',
        'Flight Number',
        'PIC Name',
        'Safety Pilot Name',
        'Safety Pilot Time',
        'Ground Instruction Given',
        'Ground Instruction Received',
        'Passenger Count',
        'Fuel Added',
        'Tach Start',
        'Tach End',
        'Multi-Pilot Time',
        'NVG Time',
      ].join(','),
    );
    expect(headerLine).toBe(
      [...Object.values(CSV_COLUMN_HEADERS), ...CSV_PROPERTY_COLUMN_HEADERS].join(','),
    );
  });

  it('never lets a property column header or alias collide with a native column or alias', () => {
    const taken = new Set(
      Object.values(CSV_HEADER_ALIASES)
        .flat()
        .map((h) => h.trim().toLowerCase()),
    );
    for (const header of CSV_PROPERTY_COLUMN_HEADERS) {
      expect(taken.has(header.trim().toLowerCase())).toBe(false);
    }
    for (const alias of Object.values(CSV_PROPERTY_HEADER_ALIASES).flat()) {
      expect(taken.has(alias.trim().toLowerCase())).toBe(false);
    }
  });

  it('never lets one header alias resolve to two different properties', () => {
    const seen = new Map<string, string>();
    for (const [id, aliases] of Object.entries(CSV_PROPERTY_HEADER_ALIASES)) {
      for (const alias of aliases) {
        const key = alias.trim().toLowerCase();
        expect(seen.get(key) ?? id).toBe(id);
        seen.set(key, id);
      }
    }
  });

  it('lists every catalog property with its title first', () => {
    expect(Object.keys(CSV_PROPERTY_HEADER_ALIASES)).toEqual(FLIGHT_PROPERTY_TYPES.map((t) => t.id));
    for (const t of FLIGHT_PROPERTY_TYPES) {
      expect(CSV_PROPERTY_HEADER_ALIASES[t.id]![0]).toBe(t.title);
    }
  });

  it('writes one column per catalog property, present-or-blank per flight', () => {
    const csv = formatFlightsAsCsv([
      exportRow({
        properties: [
          { propertyId: 'flight_number', value: 'UA123' },
          { propertyId: 'fuel_added', value: '22.5' },
        ],
      }),
      exportRow(),
    ]);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.data[0]!['Flight Number']).toBe('UA123');
    expect(parsed.data[0]!['Fuel Added']).toBe('22.5');
    expect(parsed.data[0]!['Tach Start']).toBe('');
    expect(parsed.data[1]!['Flight Number']).toBe('');
    expect(parsed.data[1]!['Fuel Added']).toBe('');
  });

  it('quotes a string property value containing a comma', () => {
    const csv = formatFlightsAsCsv([
      exportRow({ properties: [{ propertyId: 'pic_name', value: 'Smith, Jane' }] }),
    ]);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.data[0]!['PIC Name']).toBe('Smith, Jane');
  });

  it('round-trips several properties exactly', () => {
    const properties = [
      { propertyId: 'flight_number', value: 'UA123' },
      { propertyId: 'pic_name', value: 'Smith, Jane' },
      { propertyId: 'passenger_count', value: '3' },
      { propertyId: 'fuel_added', value: '22.5' },
      { propertyId: 'nvg_time', value: '0.4' },
    ];
    const { rows, errors } = parseFlightsCsv(formatFlightsAsCsv([exportRow({ properties })]));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values.tailNumber).toBe('N12345');
    // Catalog order, not input order — compare as sets keyed by id.
    expect(new Map(rows[0]!.values.properties!.map((p) => [p.propertyId, p.value]))).toEqual(
      new Map(properties.map((p) => [p.propertyId, p.value])),
    );
    expect(rows[0]!.values.properties).toHaveLength(properties.length);
  });

  it('round-trips every catalog property', () => {
    const properties = FLIGHT_PROPERTY_TYPES.map((t) => ({
      propertyId: t.id,
      value: t.type === 'string' ? `text ${t.id}` : t.type === 'integer' ? '2' : '1.5',
    }));
    const { rows, errors } = parseFlightsCsv(formatFlightsAsCsv([exportRow({ properties })]));
    expect(errors).toEqual([]);
    expect(rows[0]!.values.properties).toEqual(properties);
  });

  it('imports a flight with no properties as properties: []', () => {
    const { rows, errors, ignoredColumns } = parseFlightsCsv(formatFlightsAsCsv([exportRow()]));
    expect(errors).toEqual([]);
    expect(rows[0]!.values.properties).toEqual([]);
    expect(ignoredColumns).toEqual([]);
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

  it('round-trips a full multi-stop route through the Route column', () => {
    const csv = formatFlightsAsCsv([exportRow({ route: 'KPAO KSQL KHWD KPAO' })]);
    const { rows } = parseFlightsCsv(csv);
    expect(rows[0]!.values.route).toBe('KPAO KSQL KHWD KPAO');
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

describe('parseFlightsCsv properties', () => {
  const BASE = 'Date,Tail Number,From,To,Total Time';
  const ROW = '2026-09-09,N12345,KPAO,KMRY,1.5';

  it('resolves property headers case- and whitespace-insensitively', () => {
    expect(resolveCsvPropertyHeader(' nvg time ')).toBe('nvg_time');
    expect(resolveCsvPropertyHeader('FLIGHT NUMBER')).toBe('flight_number');
    expect(resolveCsvPropertyHeader('Some Vendor Column')).toBeNull();
  });

  it('resolves the confirmed MyFlightbook titles and aliases', () => {
    expect(resolveCsvPropertyHeader('Name of PIC')).toBe('pic_name');
    expect(resolveCsvPropertyHeader('pic name')).toBe('pic_name');
    expect(resolveCsvPropertyHeader('Night Vision Time (Goggles)')).toBe('nvg_time');
    expect(resolveCsvPropertyHeader('NVG')).toBe('nvg_time');
  });

  it('reads property columns by variant header', () => {
    const csv = `${BASE}, nvg time ,FLIGHT NUMBER,Name of PIC\n${ROW},0.5, AA1 ,Jane Doe`;
    const { rows, errors, ignoredColumns } = parseFlightsCsv(csv);
    expect(errors).toEqual([]);
    expect(ignoredColumns).toEqual([]);
    expect(rows[0]!.values.properties).toEqual([
      { propertyId: 'flight_number', value: 'AA1' },
      { propertyId: 'pic_name', value: 'Jane Doe' },
      { propertyId: 'nvg_time', value: '0.5' },
    ]);
  });

  it('treats blank and whitespace-only property cells as no entry', () => {
    const csv = `${BASE},Flight Number,Passenger Count,Fuel Added\n${ROW},,  ,`;
    const { rows, errors } = parseFlightsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]!.values.properties).toEqual([]);
  });

  it('reports a malformed decimal against its row and still imports other rows', () => {
    const csv = `${BASE},Fuel Added\n${ROW},abc\n${ROW},12`;
    const { rows, errors } = parseFlightsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.row).toBe(3);
    expect(errors).toEqual([{ row: 2, message: 'Fuel Added: Enter a number' }]);
  });

  it('reports a malformed integer and a lone "." against their rows', () => {
    const csv = `${BASE},Passenger Count,Tach Start\n${ROW},2.5,.\n${ROW},2,10.5`;
    const { rows, errors } = parseFlightsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      {
        row: 2,
        message: 'Passenger Count: Enter a whole number; Tach Start: Enter a number',
      },
    ]);
  });

  it('reports an over-long string property', () => {
    const { rows, errors } = parseFlightsCsv(`${BASE},Flight Number\n${ROW},${'x'.repeat(201)}`);
    expect(rows).toHaveLength(0);
    expect(errors).toEqual([{ row: 2, message: 'Flight Number: Too long' }]);
  });

  it('reports unrecognized columns, once each, skipping blank headers', () => {
    const csv = `${BASE},Nose Number,Nose Number,,Fuel Added\n${ROW},x,y,z,5`;
    const { rows, errors, ignoredColumns } = parseFlightsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]!.values.properties).toEqual([{ propertyId: 'fuel_added', value: '5' }]);
    expect(ignoredColumns).toEqual([{ header: 'Nose Number', reason: 'unrecognized' }]);
  });

  it('keeps the first of two columns naming the same property and reports the other', () => {
    const csv = `${BASE},PIC Name,Name of PIC\n${ROW},First,Second`;
    const { rows, ignoredColumns } = parseFlightsCsv(csv);
    expect(rows[0]!.values.properties).toEqual([{ propertyId: 'pic_name', value: 'First' }]);
    expect(ignoredColumns).toEqual([{ header: 'Name of PIC', reason: 'duplicate' }]);
  });

  it('never reads an unrecognized header that spells an internal key', () => {
    const csv = 'Date,Tail Number,From,To,Total Time,routeTo\n2026-09-09,N1,KPAO,KMRY,1,KSFO';
    const { rows, ignoredColumns } = parseFlightsCsv(csv);
    expect(rows[0]!.values.routeTo).toBe('KMRY');
    expect(ignoredColumns).toEqual([{ header: 'routeTo', reason: 'unrecognized' }]);
  });
});
