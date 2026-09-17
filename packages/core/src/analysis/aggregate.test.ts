import { describe, expect, it } from 'vitest';

import { aggregateFlights, withRunningAverage } from './aggregate.js';
import { BUCKET_GROUPINGS } from './buckets.js';
import { GRAPHABLE_FIELDS } from './fields.js';

import type { AnalysisFlight } from './fields.js';

const d = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day);
};

function flight(overrides: Partial<AnalysisFlight> & { date: Date }): AnalysisFlight {
  return {
    id: 'f1',
    totalTime: 0,
    picTime: 0,
    sicTime: 0,
    dualTime: 0,
    soloTime: 0,
    nightTime: 0,
    actualInstrument: 0,
    simInstrument: 0,
    approaches: 0,
    dayLandings: 0,
    dayLandingsFullStop: 0,
    nightLandings: 0,
    tailNumber: 'N12345',
    aircraftModel: 'Cessna 172',
    categoryClass: 'airplane_single_engine_land',
    instanceType: 'real',
    ...overrides,
  };
}

const fieldById = (id: string) => GRAPHABLE_FIELDS.find((f) => f.id === id)!;
const groupingById = (id: string) => BUCKET_GROUPINGS.find((g) => g.id === id)!;

describe('aggregateFlights', () => {
  it('sums a field per year, oldest first', () => {
    const flights = [
      flight({ id: '1', date: d('2025-03-01'), totalTime: 1.5 }),
      flight({ id: '2', date: d('2025-06-01'), totalTime: 2 }),
      flight({ id: '3', date: d('2024-01-01'), totalTime: 3 }),
    ];

    const points = aggregateFlights(flights, fieldById('totalTime'), groupingById('year'));

    expect(points).toEqual([
      { key: '2024', label: '2024', value: 3 },
      { key: '2025', label: '2025', value: 3.5 },
    ]);
  });

  it('buckets by calendar month across a year boundary', () => {
    const flights = [
      flight({ id: '1', date: d('2024-12-15'), totalTime: 1 }),
      flight({ id: '2', date: d('2025-01-05'), totalTime: 2 }),
    ];

    const points = aggregateFlights(flights, fieldById('totalTime'), groupingById('yearMonth'));

    expect(points).toEqual([
      { key: '2024-12', label: 'Dec 2024', value: 1 },
      { key: '2025-01', label: 'Jan 2025', value: 2 },
    ]);
  });

  it('buckets by ISO week, keyed on the Monday', () => {
    // 2026-03-04 is a Wednesday; its week starts Monday 2026-03-02.
    const flights = [flight({ id: '1', date: d('2026-03-04'), totalTime: 1 })];

    const points = aggregateFlights(flights, fieldById('totalTime'), groupingById('week'));

    expect(points).toEqual([{ key: '2026-03-02', label: 'Mar 2, 2026', value: 1 }]);
  });

  it('buckets seasonality by month-of-year regardless of the actual year', () => {
    const flights = [
      flight({ id: '1', date: d('2023-07-10'), totalTime: 1 }),
      flight({ id: '2', date: d('2025-07-20'), totalTime: 2 }),
    ];

    const points = aggregateFlights(flights, fieldById('totalTime'), groupingById('monthOfYear'));

    expect(points).toEqual([{ key: '6', label: 'Jul', value: 3 }]);
  });

  it('buckets seasonality by day-of-week', () => {
    // 2026-03-02 is a Monday.
    const flights = [flight({ id: '1', date: d('2026-03-02'), totalTime: 1 })];

    const points = aggregateFlights(flights, fieldById('totalTime'), groupingById('dayOfWeek'));

    expect(points).toEqual([{ key: '1', label: 'Mon', value: 1 }]);
  });

  it('sorts categorical groupings by value descending', () => {
    const flights = [
      flight({ id: '1', date: d('2025-01-01'), totalTime: 1, tailNumber: 'N111' }),
      flight({ id: '2', date: d('2025-01-02'), totalTime: 5, tailNumber: 'N222' }),
      flight({ id: '3', date: d('2025-01-03'), totalTime: 3, tailNumber: 'N222' }),
    ];

    const points = aggregateFlights(flights, fieldById('totalTime'), groupingById('tailNumber'));

    expect(points).toEqual([
      { key: 'N222', label: 'N222', value: 8 },
      { key: 'N111', label: 'N111', value: 1 },
    ]);
  });

  it('groups by category/class using its display label', () => {
    const flights = [
      flight({ id: '1', date: d('2025-01-01'), totalTime: 1, categoryClass: 'glider' }),
      flight({ id: '2', date: d('2025-01-02'), totalTime: 2, categoryClass: 'airplane_single_engine_land' }),
    ];

    const points = aggregateFlights(flights, fieldById('totalTime'), groupingById('categoryClass'));

    expect(points).toEqual([
      { key: 'airplane_single_engine_land', label: 'Airplane Single-Engine Land', value: 2 },
      { key: 'glider', label: 'Glider', value: 1 },
    ]);
  });

  it('counts flights and distinct flight days rather than summing a property', () => {
    const flights = [
      flight({ id: '1', date: d('2025-01-01'), totalTime: 1 }),
      flight({ id: '2', date: d('2025-01-01'), totalTime: 1 }),
      flight({ id: '3', date: d('2025-01-02'), totalTime: 1 }),
    ];

    expect(aggregateFlights(flights, fieldById('flightCount'), groupingById('year'))).toEqual([
      { key: '2025', label: '2025', value: 3 },
    ]);
    expect(aggregateFlights(flights, fieldById('distinctFlightDays'), groupingById('year'))).toEqual([
      { key: '2025', label: '2025', value: 2 },
    ]);
  });

  it('sums total landings across day and night', () => {
    const flights = [flight({ id: '1', date: d('2025-01-01'), dayLandings: 2, nightLandings: 1 })];

    expect(aggregateFlights(flights, fieldById('totalLandings'), groupingById('year'))).toEqual([
      { key: '2025', label: '2025', value: 3 },
    ]);
  });

  it('returns nothing for an empty flight list', () => {
    expect(aggregateFlights([], fieldById('totalTime'), groupingById('year'))).toEqual([]);
  });
});

describe('withRunningAverage', () => {
  it('computes a cumulative average over ordered points', () => {
    const points = aggregateFlights(
      [
        flight({ id: '1', date: d('2023-01-01'), totalTime: 10 }),
        flight({ id: '2', date: d('2024-01-01'), totalTime: 20 }),
        flight({ id: '3', date: d('2025-01-01'), totalTime: 30 }),
      ],
      fieldById('totalTime'),
      groupingById('year'),
    );

    expect(withRunningAverage(points)).toEqual([
      { key: '2023', label: '2023', value: 10, runningAverage: 10 },
      { key: '2024', label: '2024', value: 20, runningAverage: 15 },
      { key: '2025', label: '2025', value: 30, runningAverage: 20 },
    ]);
  });

  it('is a no-op on an empty list', () => {
    expect(withRunningAverage([])).toEqual([]);
  });
});
