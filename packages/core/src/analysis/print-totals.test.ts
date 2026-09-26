import { describe, expect, it } from 'vitest';

import { computePrintRunningTotals } from './print-totals.js';

import type { PrintRunningTotals, PrintTotalsFlight } from './print-totals.js';

function flight(overrides: Partial<PrintTotalsFlight<{ id: string }>> = {}): PrintTotalsFlight<{ id: string }> {
  return {
    id: 'f1',
    totalTime: 0,
    picTime: 0,
    dualTime: 0,
    crossCountryTime: 0,
    ...overrides,
  };
}

describe('computePrintRunningTotals', () => {
  it('returns nothing for an empty logbook and no starting totals', () => {
    expect(computePrintRunningTotals([], null)).toEqual([]);
  });

  it('runs the total from zero when there are no starting totals', () => {
    const flights = [
      flight({ id: '1', totalTime: 1.5, picTime: 1.5 }),
      flight({ id: '2', totalTime: 2, picTime: 1, dualTime: 1 }),
    ];

    const result = computePrintRunningTotals(flights, null);

    expect(result).toEqual([
      expect.objectContaining({
        id: '1',
        runningTotal: { totalTime: 1.5, picTime: 1.5, dualTime: 0, crossCountryTime: 0 },
      }),
      expect.objectContaining({
        id: '2',
        runningTotal: { totalTime: 3.5, picTime: 2.5, dualTime: 1, crossCountryTime: 0 },
      }),
    ]);
  });

  it('starts the running total from the carried-forward starting totals', () => {
    const flights = [flight({ id: '1', totalTime: 2, crossCountryTime: 1 })];
    const startingTotals: PrintRunningTotals = { totalTime: 100, picTime: 90, dualTime: 5, crossCountryTime: 20 };

    const result = computePrintRunningTotals(flights, startingTotals);

    expect(result).toEqual([
      expect.objectContaining({
        id: '1',
        runningTotal: { totalTime: 102, picTime: 90, dualTime: 5, crossCountryTime: 21 },
      }),
    ]);
  });

  it('accumulates the running total across several flights', () => {
    const flights = [
      flight({ id: '1', totalTime: 1, picTime: 1 }),
      flight({ id: '2', totalTime: 2, dualTime: 2 }),
      flight({ id: '3', totalTime: 0.5, crossCountryTime: 0.5 }),
    ];

    const result = computePrintRunningTotals(flights, null);

    expect(result.map((r) => r.runningTotal.totalTime)).toEqual([1, 3, 3.5]);
    expect(result[2]?.runningTotal).toEqual({ totalTime: 3.5, picTime: 1, dualTime: 2, crossCountryTime: 0.5 });
  });

  it('preserves every field of the original flight alongside the running total', () => {
    const flights = [flight({ id: '1', totalTime: 1 })];

    const result = computePrintRunningTotals(flights, null);

    expect(result[0]).toMatchObject({ id: '1', totalTime: 1 });
  });
});
