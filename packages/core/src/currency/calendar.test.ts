import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  endOfCalendarMonthsAfter,
  monthsBetween,
  startOfDay,
} from './calendar.js';

const d = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day);
};

describe('endOfCalendarMonthsAfter', () => {
  it('expires at the end of the month, not on a rolling date', () => {
    // 61.57(c): an approach flown mid-March is good through the END of September.
    expect(endOfCalendarMonthsAfter(d('2026-03-15'), 6)).toEqual(d('2026-09-30'));
  });

  it('gives the same expiry for every day of the source month', () => {
    const first = endOfCalendarMonthsAfter(d('2026-03-01'), 6);
    const last = endOfCalendarMonthsAfter(d('2026-03-31'), 6);
    expect(first).toEqual(last);
    expect(first).toEqual(d('2026-09-30'));
  });

  it('crosses the year boundary', () => {
    expect(endOfCalendarMonthsAfter(d('2026-10-04'), 6)).toEqual(d('2027-04-30'));
  });

  it('lands correctly on short months', () => {
    expect(endOfCalendarMonthsAfter(d('2025-08-31'), 6)).toEqual(d('2026-02-28'));
  });

  it('handles a leap February', () => {
    expect(endOfCalendarMonthsAfter(d('2027-08-31'), 6)).toEqual(d('2028-02-29'));
  });

  it('handles the 24-month flight review window', () => {
    // 61.56: reviewed 14 Jul 2026 -> good through 31 Jul 2028.
    expect(endOfCalendarMonthsAfter(d('2026-07-14'), 24)).toEqual(d('2028-07-31'));
  });

  it('handles the 60-month third-class medical window', () => {
    expect(endOfCalendarMonthsAfter(d('2025-03-02'), 60)).toEqual(d('2030-03-31'));
  });
});

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween(d('2026-09-09'), d('2026-12-08'))).toBe(90);
  });

  it('is zero on the same date regardless of time of day', () => {
    const morning = new Date(2026, 8, 9, 6, 30);
    const night = new Date(2026, 8, 9, 23, 45);
    expect(daysBetween(morning, night)).toBe(0);
  });

  it('goes negative backwards', () => {
    expect(daysBetween(d('2026-09-09'), d('2026-09-08'))).toBe(-1);
  });

  it('survives a spring-forward DST boundary', () => {
    // 8 Mar 2026 is a US DST transition; a naive ms/86400000 would give 89.96 -> 89.
    expect(daysBetween(d('2026-03-01'), d('2026-03-31'))).toBe(30);
  });
});

describe('addDays', () => {
  it('lands 90 days out across month boundaries', () => {
    expect(addDays(d('2026-09-09'), 90)).toEqual(d('2026-12-08'));
    expect(addDays(d('2026-08-04'), 90)).toEqual(d('2026-11-02'));
  });

  it('crosses a leap day', () => {
    expect(addDays(d('2028-02-28'), 1)).toEqual(d('2028-02-29'));
  });
});

describe('monthsBetween', () => {
  it('rounds down to whole months', () => {
    expect(monthsBetween(d('2026-09-12'), d('2028-07-31'))).toBe(22);
  });

  it('is zero within the same month', () => {
    expect(monthsBetween(d('2026-09-01'), d('2026-09-30'))).toBe(0);
  });
});

describe('startOfDay', () => {
  it('strips the time', () => {
    expect(startOfDay(new Date(2026, 8, 9, 17, 42, 13))).toEqual(d('2026-09-09'));
  });
});
