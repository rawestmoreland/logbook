import { describe, expect, it } from 'vitest';

import { parseAircraftCsv, resolveAircraftCsvHeader } from './csv-aircraft.js';

describe('resolveAircraftCsvHeader', () => {
  it('matches the canonical native header', () => {
    expect(resolveAircraftCsvHeader('Tail Number')).toBe('tailNumber');
    expect(resolveAircraftCsvHeader('Manufacturer')).toBe('manufacturer');
    expect(resolveAircraftCsvHeader('Model')).toBe('model');
    expect(resolveAircraftCsvHeader('Instance Type')).toBe('instanceType');
  });

  it('matches a common alternate spelling, case- and whitespace-insensitively', () => {
    expect(resolveAircraftCsvHeader('registration')).toBe('tailNumber');
    expect(resolveAircraftCsvHeader('  Registration  ')).toBe('tailNumber');
    expect(resolveAircraftCsvHeader('Make')).toBe('manufacturer');
    expect(resolveAircraftCsvHeader('Aircraft Type')).toBe('model');
    expect(resolveAircraftCsvHeader('EquipmentType')).toBe('instanceType');
  });

  it('returns null for an unrecognized header', () => {
    expect(resolveAircraftCsvHeader('Some Vendor Specific Column')).toBeNull();
  });
});

describe('parseAircraftCsv', () => {
  it('parses a well-formed row using native headers', () => {
    const csv = [
      'Tail Number,Manufacturer,Model,Instance Type',
      'N12345,Cessna,172S,real',
    ].join('\n');
    const { rows, errors } = parseAircraftCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      row: 2,
      tailNumber: 'N12345',
      modelText: 'Cessna 172S',
      instanceType: 'real',
    });
  });

  it('parses using alias headers', () => {
    const csv = ['Registration,Make,Aircraft Type', 'n4573d,Cessna,172S'].join('\n');
    const { rows, errors } = parseAircraftCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]!.tailNumber).toBe('N4573D');
    expect(rows[0]!.modelText).toBe('Cessna 172S');
  });

  it('uppercases the tail number', () => {
    const csv = ['Tail Number,Model', 'n12345,172S'].join('\n');
    const { rows } = parseAircraftCsv(csv);
    expect(rows[0]!.tailNumber).toBe('N12345');
  });

  it('builds modelText from Model alone when Manufacturer is blank', () => {
    const csv = ['Tail Number,Model', 'N12345,Cessna 172S Skyhawk'].join('\n');
    const { rows } = parseAircraftCsv(csv);
    expect(rows[0]!.modelText).toBe('Cessna 172S Skyhawk');
  });

  it('leaves modelText blank when neither Manufacturer nor Model is given', () => {
    const csv = ['Tail Number', 'N12345'].join('\n');
    const { rows, errors } = parseAircraftCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]!.modelText).toBe('');
    expect(rows[0]!.instanceType).toBeUndefined();
  });

  it('reports a missing tail number instead of silently dropping the row', () => {
    const csv = ['Tail Number,Model', ',Cessna 172S'].join('\n');
    const { rows, errors } = parseAircraftCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ row: 2, message: 'Tail number is required' });
  });

  it('continues past a bad row and still parses the good ones', () => {
    const csv = ['Tail Number,Model', ',Cessna 172S', 'N12345,Cessna 172S'].join('\n');
    const { rows, errors } = parseAircraftCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('matches an instance type by its display label, case-insensitively', () => {
    const csv = ['Tail Number,Instance Type', 'N700RB,Certified ATD'].join('\n');
    const { rows } = parseAircraftCsv(csv);
    expect(rows[0]!.instanceType).toBe('certified_atd');
  });

  it('matches an instance type by its internal key', () => {
    const csv = ['Tail Number,Instance Type', 'N700RB,certified_atd'].join('\n');
    const { rows } = parseAircraftCsv(csv);
    expect(rows[0]!.instanceType).toBe('certified_atd');
  });

  it('leaves instanceType undefined for an unrecognized value', () => {
    const csv = ['Tail Number,Instance Type', 'N12345,some_future_device'].join('\n');
    const { rows } = parseAircraftCsv(csv);
    expect(rows[0]!.instanceType).toBeUndefined();
  });
});
