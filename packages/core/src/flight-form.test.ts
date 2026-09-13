import { describe, expect, it } from 'vitest';
import { formatDateValue, parseDateValue, parseNumberValue } from './flight-form.js';

describe('parseDateValue', () => {
  it('parses to local midnight, not UTC', () => {
    const parsed = parseDateValue('2026-09-09');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(9);
    expect(parsed.getHours()).toBe(0);
  });

  it('round-trips through formatDateValue', () => {
    expect(formatDateValue(parseDateValue('2026-01-05'))).toBe('2026-01-05');
  });

  it('rejects a malformed string instead of returning an Invalid Date', () => {
    expect(() => parseDateValue('')).toThrow(RangeError);
    expect(() => parseDateValue('09/09/2026')).toThrow(RangeError);
    expect(() => parseDateValue('2026-09')).toThrow(RangeError);
  });

  it('rejects a date that does not exist rather than rolling it over', () => {
    // The Date constructor would quietly turn this into 3 March.
    expect(() => parseDateValue('2026-02-31')).toThrow(/not a real calendar date/);
    expect(() => parseDateValue('2026-13-01')).toThrow(/not a real calendar date/);
  });

  it('accepts a real leap day', () => {
    expect(parseDateValue('2028-02-29').getDate()).toBe(29);
  });
});

describe('parseNumberValue', () => {
  it('parses decimals and treats blank as zero', () => {
    expect(parseNumberValue('1.2')).toBe(1.2);
    expect(parseNumberValue('')).toBe(0);
    expect(parseNumberValue('abc')).toBe(0);
  });
});
