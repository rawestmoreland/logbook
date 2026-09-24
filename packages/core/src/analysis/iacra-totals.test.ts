import { describe, expect, it } from 'vitest';

import { computeIacraTotals } from './iacra-totals.js';

import type { AnalysisFlight } from './fields.js';
import type { IacraTotalsRow } from './iacra-totals.js';

function flight(overrides: Partial<AnalysisFlight> = {}): AnalysisFlight {
  return {
    id: 'f1',
    date: new Date(2025, 0, 1),
    totalTime: 0,
    picTime: 0,
    sicTime: 0,
    dualTime: 0,
    soloTime: 0,
    nightTime: 0,
    actualInstrument: 0,
    simInstrument: 0,
    crossCountryTime: 0,
    dualGivenTime: 0,
    groundSimTime: 0,
    approaches: 0,
    totalLandings: 0,
    dayLandingsFullStop: 0,
    nightLandingsFullStop: 0,
    tailNumber: 'N12345',
    aircraftModel: 'Cessna 172',
    categoryClass: 'airplane_single_engine_land',
    instanceType: 'real',
    ...overrides,
  };
}

function row(overrides: Partial<IacraTotalsRow> = {}): IacraTotalsRow {
  return {
    totalTime: 0,
    picTime: 0,
    sicTime: 0,
    dualTime: 0,
    soloTime: 0,
    nightTime: 0,
    actualInstrument: 0,
    simInstrument: 0,
    crossCountryTime: 0,
    dualGivenTime: 0,
    groundSimTime: 0,
    approaches: 0,
    totalLandings: 0,
    dayLandingsFullStop: 0,
    nightLandingsFullStop: 0,
    flightCount: 0,
    ...overrides,
  };
}

describe('computeIacraTotals', () => {
  it('returns nothing for an empty logbook and no prior totals', () => {
    const result = computeIacraTotals([], null);
    expect(result.categoryRows).toEqual([]);
    expect(result.priorTotals).toBeNull();
    expect(result.grandTotal).toEqual(row());
  });

  it('groups flights by category/class', () => {
    const flights = [
      flight({ id: '1', categoryClass: 'airplane_single_engine_land', totalTime: 1.5, picTime: 1.5 }),
      flight({ id: '2', categoryClass: 'airplane_single_engine_land', totalTime: 2, picTime: 2 }),
      flight({ id: '3', categoryClass: 'glider', totalTime: 0.5 }),
    ];

    const result = computeIacraTotals(flights, null);

    expect(result.categoryRows).toEqual([
      expect.objectContaining({
        categoryClass: 'airplane_single_engine_land',
        isSimulator: false,
        totalTime: 3.5,
        picTime: 3.5,
        flightCount: 2,
      }),
      expect.objectContaining({
        categoryClass: 'glider',
        isSimulator: false,
        totalTime: 0.5,
        flightCount: 1,
      }),
    ]);
  });

  it('never surfaces a category/class the pilot has not flown', () => {
    const flights = [flight({ categoryClass: 'airplane_single_engine_land' })];

    const result = computeIacraTotals(flights, null);

    expect(result.categoryRows).toHaveLength(1);
    expect(result.categoryRows.some((r) => r.categoryClass === 'rotorcraft_helicopter')).toBe(false);
  });

  it('splits simulator/ATD time from real-aircraft time within the same category/class', () => {
    const flights = [
      flight({ id: '1', categoryClass: 'airplane_single_engine_land', instanceType: 'real', totalTime: 10 }),
      flight({ id: '2', categoryClass: 'airplane_single_engine_land', instanceType: 'certified_atd', totalTime: 2 }),
    ];

    const result = computeIacraTotals(flights, null);

    expect(result.categoryRows).toEqual([
      expect.objectContaining({ categoryClass: 'airplane_single_engine_land', isSimulator: false, totalTime: 10 }),
      expect.objectContaining({ categoryClass: 'airplane_single_engine_land', isSimulator: true, totalTime: 2 }),
    ]);
  });

  it('keeps prior totals out of every category/class row, folding it only into the grand total', () => {
    const flights = [flight({ categoryClass: 'airplane_single_engine_land', totalTime: 10, picTime: 8 })];
    const priorTotals = row({ totalTime: 100, picTime: 90, flightCount: 0 });

    const result = computeIacraTotals(flights, priorTotals);

    expect(result.priorTotals).toEqual(priorTotals);
    expect(result.categoryRows.every((r) => r.totalTime !== 100)).toBe(true);
    expect(result.grandTotal.totalTime).toBe(110);
    expect(result.grandTotal.picTime).toBe(98);
    expect(result.grandTotal.flightCount).toBe(1);
  });

  it('sums the grand total as exactly the category rows plus prior totals', () => {
    const flights = [
      flight({ id: '1', categoryClass: 'airplane_single_engine_land', totalTime: 3, nightTime: 1, approaches: 2 }),
      flight({ id: '2', categoryClass: 'glider', totalTime: 1, crossCountryTime: 1 }),
      flight({
        id: '3',
        categoryClass: 'airplane_single_engine_land',
        instanceType: 'certified_atd',
        totalTime: 0.5,
      }),
    ];
    const priorTotals = row({ totalTime: 50, dualGivenTime: 20 });

    const result = computeIacraTotals(flights, priorTotals);

    const summedFromRows = result.categoryRows.reduce(
      (sum, r) => ({
        totalTime: sum.totalTime + r.totalTime,
        picTime: sum.picTime + r.picTime,
        sicTime: sum.sicTime + r.sicTime,
        dualTime: sum.dualTime + r.dualTime,
        soloTime: sum.soloTime + r.soloTime,
        nightTime: sum.nightTime + r.nightTime,
        actualInstrument: sum.actualInstrument + r.actualInstrument,
        simInstrument: sum.simInstrument + r.simInstrument,
        crossCountryTime: sum.crossCountryTime + r.crossCountryTime,
        dualGivenTime: sum.dualGivenTime + r.dualGivenTime,
        groundSimTime: sum.groundSimTime + r.groundSimTime,
        approaches: sum.approaches + r.approaches,
        totalLandings: sum.totalLandings + r.totalLandings,
        dayLandingsFullStop: sum.dayLandingsFullStop + r.dayLandingsFullStop,
        nightLandingsFullStop: sum.nightLandingsFullStop + r.nightLandingsFullStop,
        flightCount: sum.flightCount + r.flightCount,
      }),
      priorTotals,
    );

    expect(result.grandTotal).toEqual(summedFromRows);
  });
});
