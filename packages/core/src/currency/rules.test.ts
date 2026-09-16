import { describe, expect, it } from 'vitest';
import {
  dayPassengerCurrency,
  flightReviewCurrency,
  instrumentCurrency,
  medicalCurrency,
  medicalDurationMonths,
  nightPassengerCurrency,
  type CurrencyFlight,
} from './rules.js';

const d = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day);
};

const ASOF = d('2026-09-12');

function flight(over: Partial<CurrencyFlight> & Pick<CurrencyFlight, 'id' | 'date'>): CurrencyFlight {
  return {
    categoryClass: 'airplane_single_engine_land',
    instanceType: 'real',
    dayLandings: 0,
    nightLandings: 0,
    ...over,
  };
}

describe('dayPassengerCurrency — 61.57(a)(1)', () => {
  it('is current on three landings inside 90 days', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'a', date: d('2026-09-09'), dayLandings: 1 }),
        flight({ id: 'b', date: d('2026-08-20'), dayLandings: 1 }),
        flight({ id: 'c', date: d('2026-07-30'), dayLandings: 1 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('current');
    expect(r.have).toBe(3);
    // The OLDEST of the three is what breaks first: 30 Jul + 90 = 28 Oct.
    expect(r.expiresOn).toEqual(d('2026-10-28'));
    expect(r.daysRemaining).toBe(46);
  });

  it('expires when only two landings remain in the window', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'a', date: d('2026-09-09'), dayLandings: 1 }),
        flight({ id: 'b', date: d('2026-08-20'), dayLandings: 1 }),
        flight({ id: 'old', date: d('2026-05-01'), dayLandings: 9 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('expired');
    expect(r.have).toBe(2);
    expect(r.action).toBe('1 more takeoff and landing required');
  });

  it('counts a landing exactly 90 days old and drops one at 91', () => {
    const at90 = dayPassengerCurrency(
      [flight({ id: 'a', date: d('2026-06-14'), dayLandings: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(at90.have).toBe(3);
    expect(at90.daysRemaining).toBe(0);

    const at91 = dayPassengerCurrency(
      [flight({ id: 'a', date: d('2026-06-13'), dayLandings: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(at91.have).toBe(0);
    expect(at91.state).toBe('expired');
  });

  it('credits night full-stop landings toward the day requirement', () => {
    // 61.57(b) adds a requirement; it does not replace 61.57(a).
    const r = dayPassengerCurrency(
      [flight({ id: 'a', date: d('2026-09-09'), nightLandings: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('current');
    expect(r.have).toBe(3);
  });

  it('ignores landings in a different class', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'sea', date: d('2026-09-09'), dayLandings: 5, categoryClass: 'airplane_single_engine_sea' }),
        flight({ id: 'land', date: d('2026-09-08'), dayLandings: 1 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(1);
    expect(r.state).toBe('expired');
  });

  it('requires landings in type when a type rating applies', () => {
    const flights = [
      flight({ id: 'cj', date: d('2026-09-09'), dayLandings: 3, typeRating: 'CE-525' }),
      flight({ id: 'other', date: d('2026-09-08'), dayLandings: 3, typeRating: 'CE-510' }),
    ];
    expect(dayPassengerCurrency(flights, ASOF, 'airplane_single_engine_land', 'CE-525').have).toBe(3);
    expect(dayPassengerCurrency(flights, ASOF, 'airplane_single_engine_land', 'LR-45').have).toBe(0);
  });

  it('does not credit tailwheel landings that are not proven full stop', () => {
    // Fails safe: 61.57(a)(1)(ii) needs full-stop landings and we cannot prove it.
    const unproven = dayPassengerCurrency(
      [flight({ id: 'cub', date: d('2026-09-09'), dayLandings: 5, tailwheel: true })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(unproven.have).toBe(0);

    const proven = dayPassengerCurrency(
      [flight({ id: 'cub', date: d('2026-09-09'), dayLandings: 5, dayLandingsFullStop: 3, tailwheel: true })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(proven.have).toBe(3);
    expect(proven.state).toBe('current');
  });

  it('reports the flights carrying the currency, newest first', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'old', date: d('2026-07-30'), dayLandings: 1 }),
        flight({ id: 'new', date: d('2026-09-09'), dayLandings: 1 }),
        flight({ id: 'mid', date: d('2026-08-20'), dayLandings: 1 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.qualifying.map((q) => q.flightId)).toEqual(['new', 'mid', 'old']);
    expect(r.qualifying[0]?.agesOutOn).toEqual(d('2026-12-08'));
  });

  it('gives no credit for landings flown in a simulator or ATD', () => {
    // 61.57(a)(1) has no FTD/ATD credit provision, unlike (c) for instrument.
    const r = dayPassengerCurrency(
      [flight({ id: 'sim', date: d('2026-09-09'), dayLandings: 5, instanceType: 'certified_atd' })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(0);
    expect(r.state).toBe('expired');
  });

  it('only credits the real-aircraft flights out of a mix of real and simulator', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'sim', date: d('2026-09-09'), dayLandings: 9, instanceType: 'uncertified_sim' }),
        flight({ id: 'real-a', date: d('2026-09-08'), dayLandings: 2 }),
        flight({ id: 'real-b', date: d('2026-09-07'), dayLandings: 1 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(3);
    expect(r.state).toBe('current');
    expect(r.qualifying.map((q) => q.flightId)).toEqual(['real-a', 'real-b']);
  });
});

describe('nightPassengerCurrency — 61.57(b)', () => {
  it('counts only full-stop night landings', () => {
    const r = nightPassengerCurrency(
      [flight({ id: 'a', date: d('2026-09-09'), dayLandings: 9, nightLandings: 0 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(0);
    expect(r.state).toBe('expired');
    expect(r.action).toBe('3 more full-stop night landings required');
  });

  it('expires on the oldest of the three counted landings', () => {
    const r = nightPassengerCurrency(
      [
        flight({ id: 'a', date: d('2026-09-06'), nightLandings: 1 }),
        flight({ id: 'b', date: d('2026-08-18'), nightLandings: 1 }),
        flight({ id: 'c', date: d('2026-08-04'), nightLandings: 2 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(4);
    expect(r.expiresOn).toEqual(d('2026-11-02'));
    expect(r.state).toBe('current');
  });

  it('flags expiring inside the 30-day warning band', () => {
    const r = nightPassengerCurrency(
      [flight({ id: 'a', date: d('2026-06-20'), nightLandings: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.expiresOn).toEqual(d('2026-09-18'));
    expect(r.daysRemaining).toBe(6);
    expect(r.state).toBe('expiring');
  });

  it('gives no credit for night landings flown in a simulator or ATD', () => {
    const r = nightPassengerCurrency(
      [flight({ id: 'sim', date: d('2026-09-09'), nightLandings: 3, instanceType: 'certified_ifr_landings_sim' })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(0);
    expect(r.state).toBe('expired');
  });
});

describe('instrumentCurrency — 61.57(c)(1)', () => {
  const ifr = (id: string, date: string, approaches: number) =>
    flight({ id, date: d(date), approaches, holding: true, courseTracking: true });

  it('expires at the END of the sixth calendar month, not on a rolling date', () => {
    // The bug this test exists to prevent: approaches flown 05 Apr are good
    // through 31 Oct, not 05 Oct. Twenty-six extra days of legality.
    const r = instrumentCurrency([ifr('a', '2026-04-05', 6)], ASOF, 'airplane_single_engine_land');
    expect(r.expiresOn).toEqual(d('2026-10-31'));
    expect(r.expiresOn).not.toEqual(d('2026-10-05'));
    expect(r.state).toBe('current');
  });

  it('expires on whichever of approaches, holding or tracking lapses first', () => {
    const r = instrumentCurrency(
      [
        flight({ id: 'recent', date: d('2026-08-01'), approaches: 6 }),
        flight({ id: 'tasks', date: d('2026-04-10'), holding: true, courseTracking: true }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    // Approaches last to 28 Feb 2027, but the holding/tracking tasks lapse 31 Oct.
    expect(r.expiresOn).toEqual(d('2026-10-31'));
  });

  it('is not current on approaches alone', () => {
    const r = instrumentCurrency(
      [flight({ id: 'a', date: d('2026-08-01'), approaches: 8 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('expired');
    expect(r.have).toBe(8);
    expect(r.action).toBe('Needs holding procedures, intercepting and tracking courses');
  });

  it('accumulates approaches across flights', () => {
    const r = instrumentCurrency(
      [ifr('a', '2026-08-01', 2), ifr('b', '2026-07-04', 2), ifr('c', '2026-06-15', 2)],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(6);
    expect(r.state).toBe('current');
    expect(r.expiresOn).toEqual(d('2026-12-31'));
  });

  it('names what is short when approaches are missing', () => {
    const r = instrumentCurrency([ifr('a', '2026-08-01', 4)], ASOF, 'airplane_single_engine_land');
    expect(r.state).toBe('expired');
    expect(r.action).toBe('Needs 2 more approaches');
  });

  it('matches on category, so a multi-engine approach counts for a single', () => {
    const r = instrumentCurrency(
      [flight({ id: 'me', date: d('2026-08-01'), approaches: 6, holding: true, courseTracking: true, categoryClass: 'airplane_multi_engine_land' })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('current');
  });

  it('does not count a helicopter approach toward airplane currency', () => {
    const r = instrumentCurrency(
      [flight({ id: 'heli', date: d('2026-08-01'), approaches: 6, holding: true, courseTracking: true, categoryClass: 'rotorcraft_helicopter' })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('expired');
    expect(r.have).toBe(0);
  });

  it('drops approaches once the calendar window closes', () => {
    // Flown in Feb; for a September flight the window is Mar–Aug, so it is gone.
    const r = instrumentCurrency([ifr('a', '2026-02-20', 6)], ASOF, 'airplane_single_engine_land');
    expect(r.have).toBe(0);
    expect(r.state).toBe('expired');
  });

  it('still credits a simulator/ATD flight\'s approaches, holding, and tracking', () => {
    // 61.57(c) explicitly allows FTD/ATD credit, unlike (a)/(b) — the
    // instance-type restriction added for passenger currency must not leak here.
    const r = instrumentCurrency(
      [flight({ id: 'sim', date: d('2026-08-01'), approaches: 6, holding: true, courseTracking: true, instanceType: 'certified_ifr_sim' })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('current');
    expect(r.have).toBe(6);
  });
});

describe('flightReviewCurrency — 61.56', () => {
  it('runs 24 calendar months to the end of the month', () => {
    const r = flightReviewCurrency(d('2026-07-14'), ASOF);
    expect(r.expiresOn).toEqual(d('2028-07-31'));
    expect(r.state).toBe('current');
  });

  it('is expired with no review on record', () => {
    const r = flightReviewCurrency(null, ASOF);
    expect(r.state).toBe('expired');
    expect(r.expiresOn).toBeNull();
  });

  it('is expired once the window has closed', () => {
    const r = flightReviewCurrency(d('2024-06-10'), ASOF);
    expect(r.state).toBe('expired');
    expect(r.action).toBe('A flight review is required before acting as pilot in command');
  });
});

describe('medicalCurrency — 61.23', () => {
  it('gives a third class 60 months under 40 and 24 at 40 or over', () => {
    expect(medicalDurationMonths('third', 38)).toBe(60);
    expect(medicalDurationMonths('third', 40)).toBe(24);
  });

  it('gives a first class 12 months under 40 and 6 at 40 or over', () => {
    expect(medicalDurationMonths('first', 39)).toBe(12);
    expect(medicalDurationMonths('first', 41)).toBe(6);
  });

  it('gives a second class 12 months regardless of age', () => {
    expect(medicalDurationMonths('second', 25)).toBe(12);
    expect(medicalDurationMonths('second', 55)).toBe(12);
  });

  it('expires at the end of the calendar month', () => {
    const r = medicalCurrency(d('2025-03-02'), 'third', 38, ASOF);
    expect(r.expiresOn).toEqual(d('2030-03-31'));
    expect(r.state).toBe('current');
  });

  it('warns inside the 30-day band', () => {
    const r = medicalCurrency(d('2025-09-15'), 'second', 45, ASOF);
    expect(r.expiresOn).toEqual(d('2026-09-30'));
    expect(r.state).toBe('expiring');
  });
});
