import { describe, expect, it } from 'vitest';
import {
  checkCrossCountryDistance,
  checkFlight,
  checkForDuplicateFlights,
  CHECK_CATEGORIES,
  CROSS_COUNTRY_NM_THRESHOLD,
  maxDistanceFromOriginNm,
  type CheckableFlight,
  type CheckableFlightRoute,
} from './flight-checker.js';

const d = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day);
};

const NOW = d('2026-09-17');

function flight(over: Partial<CheckableFlight> & Pick<CheckableFlight, 'id' | 'date'>): CheckableFlight {
  return {
    totalTime: 1,
    picTime: 0,
    sicTime: 0,
    dualTime: 0,
    soloTime: 0,
    nightTime: 0,
    actualInstrument: 0,
    simInstrument: 0,
    crossCountryTime: 0,
    dualGivenTime: 0,
    totalLandings: 1,
    dayLandingsFullStop: 1,
    nightLandingsFullStop: 0,
    approaches: 0,
    ...over,
  };
}

describe('checkFlight', () => {
  it('has no warnings for a clean flight', () => {
    const warnings = checkFlight(flight({ id: 'a', date: d('2026-09-01') }), NOW);
    expect(warnings).toEqual([]);
  });

  it('flags PIC time exceeding total time — the decimal-point bug', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1.4, picTime: 14 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('time_field_exceeds_total');
  });

  it('flags SIC, dual, night, and cross-country individually exceeding total', () => {
    for (const field of ['sicTime', 'dualTime', 'nightTime', 'crossCountryTime'] as const) {
      const warnings = checkFlight(
        flight({ id: 'a', date: d('2026-09-01'), totalTime: 1, [field]: 2 }),
        NOW,
      );
      expect(warnings.map((w) => w.code)).toContain('time_field_exceeds_total');
    }
  });

  it('flags actual + simulated instrument exceeding total', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1, actualInstrument: 0.6, simInstrument: 0.6 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('instrument_exceeds_total');
  });

  it('flags PIC + SIC exceeding total', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1, picTime: 0.6, sicTime: 0.6 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('pic_sic_exceeds_total');
  });

  it('flags solo and dual received on the same flight', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1, soloTime: 0.5, dualTime: 0.5 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('solo_and_dual');
  });

  it('flags dual received and dual given on the same flight', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1, dualTime: 0.5, dualGivenTime: 0.5 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('dual_received_and_given');
  });

  it('flags day + night full-stop landings exceeding total landings', () => {
    const warnings = checkFlight(
      flight({
        id: 'a',
        date: d('2026-09-01'),
        totalLandings: 1,
        dayLandingsFullStop: 1,
        nightLandingsFullStop: 1,
      }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('full_stop_landings_exceed_total');
  });

  it('flags night full-stop landings alone exceeding total landings', () => {
    const warnings = checkFlight(
      flight({
        id: 'a',
        date: d('2026-09-01'),
        totalLandings: 1,
        dayLandingsFullStop: 0,
        nightLandingsFullStop: 2,
      }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('night_landings_exceed_total');
  });

  it('does not flag time logged with no landings — pilot-monitoring legs legitimately have none', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1, totalLandings: 0, dayLandingsFullStop: 0 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).not.toContain('no_landings_logged');
  });

  it('flags a future-dated flight', () => {
    const warnings = checkFlight(flight({ id: 'a', date: d('2026-10-01') }), NOW);
    expect(warnings.map((w) => w.code)).toContain('future_date');
  });

  it('does not flag a flight dated today', () => {
    const warnings = checkFlight(flight({ id: 'a', date: NOW }), NOW);
    expect(warnings.map((w) => w.code)).not.toContain('future_date');
  });

  it('flags an unusually long flight', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 20, totalLandings: 1 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('unusually_long_flight');
  });

  it('does not flag a long but plausible ferry flight just under the threshold', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 17, totalLandings: 1 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).not.toContain('unusually_long_flight');
  });

  it('does not flag dual time exceeding total time for an AATD-only session', () => {
    const warnings = checkFlight(
      flight({
        id: 'a',
        date: d('2026-09-01'),
        totalTime: 0,
        dualTime: 1.5,
        instanceType: 'certified_atd',
      }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).not.toContain('time_field_exceeds_total');
  });

  it('still flags the same field values as a typo for a real-aircraft flight', () => {
    const warnings = checkFlight(
      flight({
        id: 'a',
        date: d('2026-09-01'),
        totalTime: 0,
        dualTime: 1.5,
        instanceType: 'real',
      }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('time_field_exceeds_total');
  });

  it('still flags a zero-total flight with no instanceType at all (defaults to real)', () => {
    const warnings = checkFlight(
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 0, dualTime: 1.5 }),
      NOW,
    );
    expect(warnings.map((w) => w.code)).toContain('time_field_exceeds_total');
  });
});

describe('checkForDuplicateFlights', () => {
  it('flags two flights with the same date, total time, landings, and tail number', () => {
    const flights = [
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1, tailNumber: 'N12345' }),
      flight({ id: 'b', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1, tailNumber: 'N12345' }),
    ];
    const result = checkForDuplicateFlights(flights);
    expect(result.get('a')?.map((w) => w.code)).toEqual(['duplicate_flight']);
    expect(result.get('b')?.map((w) => w.code)).toEqual(['duplicate_flight']);
    expect(result.get('a')?.[0]?.message).toContain('b');
    expect(result.get('b')?.[0]?.message).toContain('a');
  });

  it('does not flag flights that differ by route', () => {
    const flights = [
      flight({
        id: 'a',
        date: d('2026-09-01'),
        totalTime: 1.4,
        totalLandings: 1,
        tailNumber: 'N12345',
        routeFrom: 'KPAO',
        routeTo: 'KSQL',
      }),
      flight({
        id: 'b',
        date: d('2026-09-01'),
        totalTime: 1.4,
        totalLandings: 1,
        tailNumber: 'N12345',
        routeFrom: 'KPAO',
        routeTo: 'KHWD',
      }),
    ];
    const result = checkForDuplicateFlights(flights);
    expect(result.size).toBe(0);
  });

  it('still flags flights with the same route (or none logged) as duplicates', () => {
    const flights = [
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1, tailNumber: 'N12345' }),
      flight({ id: 'b', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1, tailNumber: 'N12345' }),
    ];
    const result = checkForDuplicateFlights(flights);
    expect(result.get('a')?.map((w) => w.code)).toEqual(['duplicate_flight']);
    expect(result.get('b')?.map((w) => w.code)).toEqual(['duplicate_flight']);
  });

  it('does not flag flights that differ by tail number', () => {
    const flights = [
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1, tailNumber: 'N12345' }),
      flight({ id: 'b', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1, tailNumber: 'N67890' }),
    ];
    const result = checkForDuplicateFlights(flights);
    expect(result.size).toBe(0);
  });

  it('does not flag flights that differ by date, total time, or landings', () => {
    const flights = [
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1 }),
      flight({ id: 'b', date: d('2026-09-02'), totalTime: 1.4, totalLandings: 1 }),
      flight({ id: 'c', date: d('2026-09-01'), totalTime: 1.5, totalLandings: 1 }),
      flight({ id: 'd', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 2 }),
    ];
    const result = checkForDuplicateFlights(flights);
    expect(result.size).toBe(0);
  });

  it('names all other members of a triplicate group', () => {
    const flights = [
      flight({ id: 'a', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1 }),
      flight({ id: 'b', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1 }),
      flight({ id: 'c', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1 }),
    ];
    const result = checkForDuplicateFlights(flights);
    expect(result.get('a')?.[0]?.message).toContain('b');
    expect(result.get('a')?.[0]?.message).toContain('c');
  });
});

// A degree of latitude, and a degree of longitude at the equator, are both
// ~60nm — the nautical mile's original definition — so these make convenient
// round-number fixtures without needing real airport coordinates.
const ORIGIN = { lat: 0, lon: 0 };
const NEAR_30NM = { lat: 0, lon: 0.5 };
const FAR_60NM = { lat: 0, lon: 1 };

function flightRoute(over: Partial<CheckableFlightRoute> & Pick<CheckableFlightRoute, 'id'>): CheckableFlightRoute {
  return {
    crossCountryTime: 0,
    waypoints: [],
    ...over,
  };
}

describe('maxDistanceFromOriginNm', () => {
  it('returns null for fewer than two waypoints', () => {
    expect(maxDistanceFromOriginNm([])).toBeNull();
    expect(maxDistanceFromOriginNm([ORIGIN])).toBeNull();
  });

  it('returns the farthest waypoint from the first one, not the total route length', () => {
    // Origin -> far -> near: the farthest point from the origin is still
    // "far", even though it isn't the last leg flown.
    const distance = maxDistanceFromOriginNm([ORIGIN, FAR_60NM, NEAR_30NM]);
    expect(distance).toBeCloseTo(60.04, 1);
  });
});

describe('checkCrossCountryDistance', () => {
  it('flags cross-country time logged on a route that never leaves the threshold', () => {
    const result = checkCrossCountryDistance([
      flightRoute({ id: 'a', crossCountryTime: 1.4, waypoints: [ORIGIN, NEAR_30NM] }),
    ]);
    expect(result.get('a')?.map((w) => w.code)).toEqual(['cross_country_below_threshold']);
  });

  it('does not flag cross-country time on a route that clears the threshold', () => {
    const result = checkCrossCountryDistance([
      flightRoute({ id: 'a', crossCountryTime: 1.4, waypoints: [ORIGIN, FAR_60NM] }),
    ]);
    expect(result.has('a')).toBe(false);
  });

  it('flags a route past the threshold with no cross-country time logged', () => {
    const result = checkCrossCountryDistance([
      flightRoute({ id: 'a', crossCountryTime: 0, waypoints: [ORIGIN, FAR_60NM] }),
    ]);
    expect(result.get('a')?.map((w) => w.code)).toEqual(['cross_country_not_logged']);
  });

  it('does not flag a local flight with no cross-country time logged', () => {
    const result = checkCrossCountryDistance([
      flightRoute({ id: 'a', crossCountryTime: 0, waypoints: [ORIGIN, NEAR_30NM] }),
    ]);
    expect(result.has('a')).toBe(false);
  });

  it('skips a flight whose route could not be resolved to at least two airports', () => {
    const result = checkCrossCountryDistance([
      flightRoute({ id: 'a', crossCountryTime: 0, waypoints: [] }),
      flightRoute({ id: 'b', crossCountryTime: 5, waypoints: [ORIGIN] }),
    ]);
    expect(result.size).toBe(0);
  });

  it('exports the threshold used to decide "far enough"', () => {
    expect(CROSS_COUNTRY_NM_THRESHOLD).toBe(50);
  });
});

describe('CHECK_CATEGORIES', () => {
  it('covers every code the check functions can produce, each in exactly one category', () => {
    const singleFlightCodes = [
      ...checkFlight(
        flight({
          id: 'a',
          date: d('2026-10-01'),
          totalTime: 1,
          picTime: 2,
          sicTime: 2,
          dualTime: 0.5,
          soloTime: 0.5,
          actualInstrument: 2,
          simInstrument: 2,
          dualGivenTime: 0.5,
          totalLandings: 1,
          dayLandingsFullStop: 2,
          nightLandingsFullStop: 2,
        }),
        NOW,
      ),
      ...checkFlight(flight({ id: 'f', date: d('2026-09-01'), totalTime: 20, totalLandings: 1 }), NOW),
    ].map((w) => w.code);

    const duplicateFlights = [
      flight({ id: 'b', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1 }),
      flight({ id: 'c', date: d('2026-09-01'), totalTime: 1.4, totalLandings: 1 }),
    ];
    const duplicateCodes = [...checkForDuplicateFlights(duplicateFlights).values()].flatMap((ws) =>
      ws.map((w) => w.code),
    );

    const crossCountryCodes = [
      ...checkCrossCountryDistance([
        flightRoute({ id: 'd', crossCountryTime: 1.4, waypoints: [ORIGIN, NEAR_30NM] }),
        flightRoute({ id: 'e', crossCountryTime: 0, waypoints: [ORIGIN, FAR_60NM] }),
      ]).values(),
    ].flatMap((ws) => ws.map((w) => w.code));

    const producedCodes = new Set([...singleFlightCodes, ...duplicateCodes, ...crossCountryCodes]);
    // Sanity check on the fixture itself — if this shrinks, the fixture
    // above stopped exercising every code and the completeness assertion
    // below would pass vacuously.
    expect(producedCodes.size).toBeGreaterThanOrEqual(12);

    for (const code of producedCodes) {
      const categoriesContainingCode = CHECK_CATEGORIES.filter((category) => category.codes.includes(code));
      expect(categoriesContainingCode, `code "${code}" should appear in exactly one category`).toHaveLength(1);
    }
  });
});
