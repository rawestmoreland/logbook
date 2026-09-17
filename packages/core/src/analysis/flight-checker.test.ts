import { describe, expect, it } from 'vitest';
import { checkFlight, checkForDuplicateFlights, type CheckableFlight } from './flight-checker.js';

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
