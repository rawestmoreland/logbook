import { describe, expect, it } from 'vitest';
import { dutyPeriodHours, parseTimeValue, restHours } from './duty.js';

describe('parseTimeValue', () => {
  it('parses a valid HH:MM time to minutes since midnight', () => {
    expect(parseTimeValue('00:00')).toBe(0);
    expect(parseTimeValue('06:30')).toBe(390);
    expect(parseTimeValue('23:59')).toBe(1439);
  });

  it('throws on a malformed time', () => {
    expect(() => parseTimeValue('24:00')).toThrow(RangeError);
    expect(() => parseTimeValue('6:30')).toThrow(RangeError);
    expect(() => parseTimeValue('not a time')).toThrow(RangeError);
  });
});

describe('dutyPeriodHours', () => {
  const day = new Date(2026, 0, 15);

  it('computes a same-day duty period', () => {
    expect(dutyPeriodHours(day, '06:00', '14:30')).toBeCloseTo(8.5);
  });

  it('treats a release at or before report as crossing midnight', () => {
    expect(dutyPeriodHours(day, '22:00', '06:00')).toBeCloseTo(8);
    expect(dutyPeriodHours(day, '10:00', '10:00')).toBeCloseTo(24);
  });
});

describe('restHours', () => {
  it('computes rest between a release and the next report, same day', () => {
    const day = new Date(2026, 0, 15);
    expect(restHours(day, '14:00', day, '18:00')).toBeCloseTo(4);
  });

  it('computes rest spanning a calendar day boundary', () => {
    const releaseDay = new Date(2026, 0, 15);
    const reportDay = new Date(2026, 0, 16);
    expect(restHours(releaseDay, '22:00', reportDay, '06:00')).toBeCloseTo(8);
  });

  it('fails safe to zero for an out-of-order or overlapping record', () => {
    const day = new Date(2026, 0, 15);
    expect(restHours(day, '18:00', day, '14:00')).toBe(0);
  });
});
