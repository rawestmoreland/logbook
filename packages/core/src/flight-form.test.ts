import { describe, expect, it } from 'vitest';
import {
  defaultFlightFormValues,
  defaultStartingTotalsFormValues,
  flightFormSchema,
  formatDateValue,
  parseDateValue,
  parseNumberValue,
  STARTING_TOTALS_DATE,
  startingTotalsFormSchema,
} from './flight-form.js';

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

function validFlightFormValues() {
  return {
    ...defaultFlightFormValues(),
    aircraftId: 'aircraft1',
    routeFrom: 'KPAO',
    routeTo: 'KMRY',
  };
}

describe('flightFormSchema', () => {
  it('accepts the currency fields at their defaults', () => {
    const result = flightFormSchema.safeParse(validFlightFormValues());
    expect(result.success).toBe(true);
  });

  it('accepts a valid combination of the new fields', () => {
    const result = flightFormSchema.safeParse({
      ...validFlightFormValues(),
      totalLandings: '3',
      dayLandingsFullStop: '3',
      approaches: '4',
      holding: true,
      courseTracking: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts cross-country/dual-given/ground-sim time as ordinary hours fields', () => {
    const result = flightFormSchema.safeParse({
      ...validFlightFormValues(),
      crossCountryTime: '2.5',
      dualGivenTime: '1.3',
      groundSimTime: '0.5',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-numeric cross-country/dual-given/ground-sim time', () => {
    const result = flightFormSchema.safeParse({
      ...validFlightFormValues(),
      crossCountryTime: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects full-stop landings exceeding total landings', () => {
    const result = flightFormSchema.safeParse({
      ...validFlightFormValues(),
      totalLandings: '2',
      dayLandingsFullStop: '3',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'dayLandingsFullStop');
      expect(issue?.message).toBe('Full-stop landings cannot exceed total landings');
    }
  });

  it('rejects a non-boolean holding/courseTracking value', () => {
    const result = flightFormSchema.safeParse({
      ...validFlightFormValues(),
      holding: 'true',
    });
    expect(result.success).toBe(false);
  });
});

describe('STARTING_TOTALS_DATE', () => {
  it('parses as a valid calendar date', () => {
    expect(() => parseDateValue(STARTING_TOTALS_DATE)).not.toThrow();
  });

  it('sits well outside every currency lookback window', () => {
    // The longest window any currency rule looks back is 61.56's 24
    // calendar months; comfortably clearing a century confirms this date
    // can never fall inside any of them without hard-coding each rule's
    // window length here.
    const years = new Date().getFullYear() - parseDateValue(STARTING_TOTALS_DATE).getFullYear();
    expect(years).toBeGreaterThan(100);
  });
});

describe('startingTotalsFormSchema', () => {
  it('accepts the defaults', () => {
    const result = startingTotalsFormSchema.safeParse(defaultStartingTotalsFormValues());
    expect(result.success).toBe(true);
  });

  it('accepts a populated carry-forward snapshot', () => {
    const result = startingTotalsFormSchema.safeParse({
      ...defaultStartingTotalsFormValues(),
      totalTime: '312.4',
      picTime: '150',
      dualTime: '162.4',
      nightTime: '20.1',
      totalLandings: '210',
      dayLandingsFullStop: '180',
      nightLandingsFullStop: '25',
      approaches: '12',
    });
    expect(result.success).toBe(true);
  });

  it('has no aircraft/route/holding fields — a carry-forward snapshot, not a flight', () => {
    const values = defaultStartingTotalsFormValues();
    expect(values).not.toHaveProperty('aircraftId');
    expect(values).not.toHaveProperty('routeFrom');
    expect(values).not.toHaveProperty('holding');
  });

  it('rejects full-stop landings exceeding total landings', () => {
    const result = startingTotalsFormSchema.safeParse({
      ...defaultStartingTotalsFormValues(),
      totalLandings: '2',
      dayLandingsFullStop: '3',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'dayLandingsFullStop');
      expect(issue?.message).toBe('Full-stop landings cannot exceed total landings');
    }
  });

  it('rejects a non-numeric hours field', () => {
    const result = startingTotalsFormSchema.safeParse({
      ...defaultStartingTotalsFormValues(),
      totalTime: 'abc',
    });
    expect(result.success).toBe(false);
  });
});
