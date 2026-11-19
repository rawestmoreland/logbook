import { describe, expect, it } from 'vitest';

import { defaultFlightFormValues, flightFormSchema } from './flight-form.js';
import {
  FLIGHT_PROPERTY_TYPES,
  flightPropertiesField,
  flightPropertyEntrySchema,
  getFlightPropertyType,
  parseStoredFlightProperties,
} from './flight-properties.js';

function validFlight() {
  return { ...defaultFlightFormValues(), aircraftId: 'abc', routeFrom: 'KPAO', routeTo: 'KSQL' };
}

describe('FLIGHT_PROPERTY_TYPES', () => {
  it('has unique ids and titles', () => {
    const ids = FLIGHT_PROPERTY_TYPES.map((t) => t.id);
    const titles = FLIGHT_PROPERTY_TYPES.map((t) => t.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('uses snake_case slugs and gives every entry a description', () => {
    for (const t of FLIGHT_PROPERTY_TYPES) {
      expect(t.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('declares the types the starter list calls for', () => {
    expect(FLIGHT_PROPERTY_TYPES).toHaveLength(12);
    expect(getFlightPropertyType('flight_number')?.type).toBe('string');
    expect(getFlightPropertyType('passenger_count')?.type).toBe('integer');
    expect(getFlightPropertyType('nvg_time')?.type).toBe('decimal');
  });
});

describe('flightPropertyEntrySchema', () => {
  it('accepts a valid entry of each value type', () => {
    expect(flightPropertyEntrySchema.safeParse({ propertyId: 'flight_number', value: 'UA 123' }).success).toBe(true);
    expect(flightPropertyEntrySchema.safeParse({ propertyId: 'fuel_added', value: '22.5' }).success).toBe(true);
    expect(flightPropertyEntrySchema.safeParse({ propertyId: 'passenger_count', value: '3' }).success).toBe(true);
  });

  it('rejects an unknown propertyId', () => {
    const result = flightPropertyEntrySchema.safeParse({ propertyId: 'nope', value: '1' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric decimal and a fractional integer', () => {
    const decimal = flightPropertyEntrySchema.safeParse({ propertyId: 'tach_start', value: '12a' });
    expect(decimal.success).toBe(false);
    if (!decimal.success) expect(decimal.error.issues[0]!.path).toEqual(['value']);

    const integer = flightPropertyEntrySchema.safeParse({ propertyId: 'passenger_count', value: '2.5' });
    expect(integer.success).toBe(false);
  });

  it('rejects an empty value and a lone decimal point', () => {
    expect(flightPropertyEntrySchema.safeParse({ propertyId: 'flight_number', value: '  ' }).success).toBe(false);
    expect(flightPropertyEntrySchema.safeParse({ propertyId: 'tach_start', value: '' }).success).toBe(false);
    expect(flightPropertyEntrySchema.safeParse({ propertyId: 'tach_start', value: '.' }).success).toBe(false);
  });

  it('caps string length', () => {
    expect(flightPropertyEntrySchema.safeParse({ propertyId: 'pic_name', value: 'x'.repeat(200) }).success).toBe(true);
    expect(flightPropertyEntrySchema.safeParse({ propertyId: 'pic_name', value: 'x'.repeat(201) }).success).toBe(false);
  });

  it('trims the value', () => {
    const result = flightPropertyEntrySchema.parse({ propertyId: 'pic_name', value: '  Jane  ' });
    expect(result.value).toBe('Jane');
  });
});

describe('flightPropertiesField', () => {
  it('rejects the same property added twice, pointing at the duplicate', () => {
    const result = flightPropertiesField().safeParse([
      { propertyId: 'tach_start', value: '1' },
      { propertyId: 'tach_start', value: '2' },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual([1, 'propertyId']);
  });
});

describe('flightFormSchema properties', () => {
  it('defaults to an empty list and is optional', () => {
    expect(defaultFlightFormValues().properties).toEqual([]);
    const { properties: _omit, ...without } = validFlight();
    expect(flightFormSchema.safeParse(without).success).toBe(true);
  });

  it('accepts valid properties and surfaces the entry path on a bad one', () => {
    const ok = flightFormSchema.safeParse({
      ...validFlight(),
      properties: [{ propertyId: 'flight_number', value: 'UA1' }],
    });
    expect(ok.success).toBe(true);

    const bad = flightFormSchema.safeParse({
      ...validFlight(),
      properties: [
        { propertyId: 'flight_number', value: 'UA1' },
        { propertyId: 'fuel_added', value: 'lots' },
      ],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]!.path).toEqual(['properties', 1, 'value']);
  });
});

describe('parseStoredFlightProperties', () => {
  it('treats null/undefined/non-arrays as no properties', () => {
    expect(parseStoredFlightProperties(null)).toEqual([]);
    expect(parseStoredFlightProperties(undefined)).toEqual([]);
    expect(parseStoredFlightProperties({})).toEqual([]);
  });

  it('keeps well-formed entries and drops malformed, unknown, and duplicate ones', () => {
    expect(
      parseStoredFlightProperties([
        { propertyId: 'flight_number', value: 'UA1' },
        { propertyId: 'removed_property', value: 'x' },
        { propertyId: 'fuel_added', value: 5 },
        'junk',
        null,
        { propertyId: 'flight_number', value: 'UA2' },
      ]),
    ).toEqual([{ propertyId: 'flight_number', value: 'UA1' }]);
  });
});
