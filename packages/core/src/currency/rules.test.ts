import { describe, expect, it } from 'vitest';
import {
  basicMedCurrency,
  dayPassengerCurrency,
  easaMedicalCurrency,
  easaMedicalDurationMonths,
  easaNightPicCurrency,
  easaRecencyCurrency,
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
    totalLandings: 0,
    nightLandingsFullStop: 0,
    ...over,
  };
}

describe('dayPassengerCurrency — 61.57(a)(1)', () => {
  it('is current on three landings inside 90 days', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'a', date: d('2026-09-09'), totalLandings: 1 }),
        flight({ id: 'b', date: d('2026-08-20'), totalLandings: 1 }),
        flight({ id: 'c', date: d('2026-07-30'), totalLandings: 1 }),
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
        flight({ id: 'a', date: d('2026-09-09'), totalLandings: 1 }),
        flight({ id: 'b', date: d('2026-08-20'), totalLandings: 1 }),
        flight({ id: 'old', date: d('2026-05-01'), totalLandings: 9 }),
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
      [flight({ id: 'a', date: d('2026-06-14'), totalLandings: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(at90.have).toBe(3);
    expect(at90.daysRemaining).toBe(0);

    const at91 = dayPassengerCurrency(
      [flight({ id: 'a', date: d('2026-06-13'), totalLandings: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(at91.have).toBe(0);
    expect(at91.state).toBe('expired');
  });

  it('credits night full-stop landings toward the day requirement', () => {
    // 61.57(b) adds a requirement; it does not replace 61.57(a).
    const r = dayPassengerCurrency(
      [flight({ id: 'a', date: d('2026-09-09'), totalLandings: 3, nightLandingsFullStop: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('current');
    expect(r.have).toBe(3);
  });

  it('ignores landings in a different class', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'sea', date: d('2026-09-09'), totalLandings: 5, categoryClass: 'airplane_single_engine_sea' }),
        flight({ id: 'land', date: d('2026-09-08'), totalLandings: 1 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(1);
    expect(r.state).toBe('expired');
  });

  it('requires landings in type when a type rating applies', () => {
    const flights = [
      flight({ id: 'cj', date: d('2026-09-09'), totalLandings: 3, typeRating: 'CE-525' }),
      flight({ id: 'other', date: d('2026-09-08'), totalLandings: 3, typeRating: 'CE-510' }),
    ];
    expect(dayPassengerCurrency(flights, ASOF, 'airplane_single_engine_land', 'CE-525').have).toBe(3);
    expect(dayPassengerCurrency(flights, ASOF, 'airplane_single_engine_land', 'LR-45').have).toBe(0);
  });

  it('does not credit tailwheel landings that are not proven full stop', () => {
    // Fails safe: 61.57(a)(1)(ii) needs full-stop landings and we cannot prove it.
    const unproven = dayPassengerCurrency(
      [flight({ id: 'cub', date: d('2026-09-09'), totalLandings: 5, tailwheel: true })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(unproven.have).toBe(0);

    const proven = dayPassengerCurrency(
      [flight({ id: 'cub', date: d('2026-09-09'), totalLandings: 5, dayLandingsFullStop: 3, tailwheel: true })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(proven.have).toBe(3);
    expect(proven.state).toBe('current');
  });

  it('reports the flights carrying the currency, newest first', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'old', date: d('2026-07-30'), totalLandings: 1 }),
        flight({ id: 'new', date: d('2026-09-09'), totalLandings: 1 }),
        flight({ id: 'mid', date: d('2026-08-20'), totalLandings: 1 }),
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
      [flight({ id: 'sim', date: d('2026-09-09'), totalLandings: 5, instanceType: 'certified_atd' })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(0);
    expect(r.state).toBe('expired');
  });

  it('only credits the real-aircraft flights out of a mix of real and simulator', () => {
    const r = dayPassengerCurrency(
      [
        flight({ id: 'sim', date: d('2026-09-09'), totalLandings: 9, instanceType: 'uncertified_sim' }),
        flight({ id: 'real-a', date: d('2026-09-08'), totalLandings: 2 }),
        flight({ id: 'real-b', date: d('2026-09-07'), totalLandings: 1 }),
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
      [flight({ id: 'a', date: d('2026-09-09'), totalLandings: 9, nightLandingsFullStop: 0 })],
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
        flight({ id: 'a', date: d('2026-09-06'), nightLandingsFullStop: 1 }),
        flight({ id: 'b', date: d('2026-08-18'), nightLandingsFullStop: 1 }),
        flight({ id: 'c', date: d('2026-08-04'), nightLandingsFullStop: 2 }),
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
      [flight({ id: 'a', date: d('2026-06-20'), nightLandingsFullStop: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.expiresOn).toEqual(d('2026-09-18'));
    expect(r.daysRemaining).toBe(6);
    expect(r.state).toBe('expiring');
  });

  it('gives no credit for night landings flown in a simulator or ATD', () => {
    const r = nightPassengerCurrency(
      [flight({ id: 'sim', date: d('2026-09-09'), nightLandingsFullStop: 3, instanceType: 'certified_ifr_landings_sim' })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(0);
    expect(r.state).toBe('expired');
  });
});

describe('easaRecencyCurrency — FCL.060(b)(1)', () => {
  it('is current on three landings inside 90 days', () => {
    const r = easaRecencyCurrency(
      [
        flight({ id: 'a', date: d('2026-09-09'), totalLandings: 1 }),
        flight({ id: 'b', date: d('2026-08-20'), totalLandings: 1 }),
        flight({ id: 'c', date: d('2026-07-30'), totalLandings: 1 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('current');
    expect(r.have).toBe(3);
    expect(r.expiresOn).toEqual(d('2026-10-28'));
  });

  it('unifies day and night landings into a single count, unlike 61.57(a)/(b)', () => {
    const r = easaRecencyCurrency(
      [
        flight({ id: 'a', date: d('2026-09-09'), totalLandings: 1 }),
        flight({ id: 'b', date: d('2026-08-20'), totalLandings: 2, nightLandingsFullStop: 2 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(3);
    expect(r.state).toBe('current');
  });

  it('expires when only two landings remain in the window', () => {
    const r = easaRecencyCurrency(
      [
        flight({ id: 'a', date: d('2026-09-09'), totalLandings: 1 }),
        flight({ id: 'b', date: d('2026-08-20'), totalLandings: 1 }),
        flight({ id: 'old', date: d('2026-05-01'), totalLandings: 9 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('expired');
    expect(r.have).toBe(2);
    expect(r.action).toBe('1 more take-off and landing required');
  });

  it('counts a landing exactly 90 days old and drops one at 91', () => {
    const at90 = easaRecencyCurrency(
      [flight({ id: 'a', date: d('2026-06-14'), totalLandings: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(at90.have).toBe(3);
    expect(at90.daysRemaining).toBe(0);

    const at91 = easaRecencyCurrency(
      [flight({ id: 'a', date: d('2026-06-13'), totalLandings: 3 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(at91.have).toBe(0);
    expect(at91.state).toBe('expired');
  });

  it('ignores landings in a different class', () => {
    const r = easaRecencyCurrency(
      [
        flight({ id: 'sea', date: d('2026-09-09'), totalLandings: 5, categoryClass: 'airplane_single_engine_sea' }),
        flight({ id: 'land', date: d('2026-09-08'), totalLandings: 1 }),
      ],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(1);
    expect(r.state).toBe('expired');
  });

  it('requires landings in type when a type rating applies', () => {
    const flights = [
      flight({ id: 'cj', date: d('2026-09-09'), totalLandings: 3, typeRating: 'CE-525' }),
      flight({ id: 'other', date: d('2026-09-08'), totalLandings: 3, typeRating: 'CE-510' }),
    ];
    expect(easaRecencyCurrency(flights, ASOF, 'airplane_single_engine_land', 'CE-525').have).toBe(3);
    expect(easaRecencyCurrency(flights, ASOF, 'airplane_single_engine_land', 'LR-45').have).toBe(0);
  });

  it('gives no credit for landings flown in a simulator or ATD, fail-safe on unmodeled FFS credit', () => {
    // FCL.060(b)(1) does allow FFS credit, but this app can't tell an FFS
    // apart from the FAA-flavored ATD/sim tiers it tracks, so it fails safe
    // and gives no credit at all rather than over-crediting a device that
    // might not qualify.
    const r = easaRecencyCurrency(
      [flight({ id: 'sim', date: d('2026-09-09'), totalLandings: 5, instanceType: 'certified_ifr_landings_sim' })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(0);
    expect(r.state).toBe('expired');
  });
});

describe('easaNightPicCurrency — FCL.060(b)(2)', () => {
  it('requires only one night landing in the preceding 90 days', () => {
    const r = easaNightPicCurrency(
      [flight({ id: 'a', date: d('2026-09-09'), nightLandingsFullStop: 1 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.state).toBe('current');
    expect(r.have).toBe(1);
    expect(r.expiresOn).toEqual(d('2026-12-08'));
  });

  it('is not satisfied by day landings alone', () => {
    const r = easaNightPicCurrency(
      [flight({ id: 'a', date: d('2026-09-09'), totalLandings: 9 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(r.have).toBe(0);
    expect(r.state).toBe('expired');
    expect(r.action).toBe('1 more night take-off and landing required');
  });

  it('drops the landing once it ages past 90 days', () => {
    const at90 = easaNightPicCurrency(
      [flight({ id: 'a', date: d('2026-06-14'), nightLandingsFullStop: 1 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(at90.have).toBe(1);

    const at91 = easaNightPicCurrency(
      [flight({ id: 'a', date: d('2026-06-13'), nightLandingsFullStop: 1 })],
      ASOF,
      'airplane_single_engine_land',
    );
    expect(at91.have).toBe(0);
    expect(at91.state).toBe('expired');
  });

  it('gives no credit for a night landing flown in a simulator or ATD', () => {
    const r = easaNightPicCurrency(
      [flight({ id: 'sim', date: d('2026-09-09'), nightLandingsFullStop: 3, instanceType: 'certified_ifr_landings_sim' })],
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

  describe('61.57(d) grace period and IPC', () => {
    it('restores currency on solo approaches flown inside the grace window', () => {
      const r = instrumentCurrency(
        [
          // Currency lapses 31 Jul 2025 (6 months after this flight); the
          // 61.57(d) grace period runs to 31 Jan 2026.
          ifr('lapsed', '2025-01-15', 6),
          // Requalified solo, still inside the grace window.
          ifr('restored', '2025-10-01', 6),
        ],
        d('2025-10-15'),
        'airplane_single_engine_land',
      );
      expect(r.state).toBe('current');
      expect(r.expiresOn).toEqual(d('2026-04-30'));
    });

    it('is NOT restored by solo approaches flown after the grace window has closed', () => {
      const r = instrumentCurrency(
        [
          // Lapses 31 Jul 2025; grace period closes 31 Jan 2026.
          ifr('lapsed', '2025-01-15', 6),
          // Six approaches, holding, and tracking — but too late: the grace
          // period is already closed, so this cannot restore currency.
          ifr('too-late', '2026-03-01', 6),
        ],
        d('2026-03-05'),
        'airplane_single_engine_land',
      );
      expect(r.state).toBe('expired');
      expect(r.expiresOn).toBeNull();
      expect(r.action).toBe(
        'Past the 61.57(d) grace period — an instrument proficiency check (IPC) is required; approaches alone no longer restore currency',
      );
    });

    it('is restored by a dated IPC flown after the grace window closed, with a fresh 6-month clock', () => {
      const r = instrumentCurrency(
        [ifr('lapsed', '2025-01-15', 6)], // lapses 31 Jul 2025; grace closes 31 Jan 2026
        d('2026-06-10'),
        'airplane_single_engine_land',
        d('2026-06-01'), // IPC flown well after the grace period closed
      );
      expect(r.state).toBe('current');
      expect(r.expiresOn).toEqual(d('2026-12-31'));
    });

    it('gives an IPC no effect when it is dated before the lapse it would need to cure', () => {
      const r = instrumentCurrency(
        [ifr('lapsed', '2025-01-15', 6)], // lapses 31 Jul 2025; grace closes 31 Jan 2026
        d('2026-06-01'), // well past the grace period, never restored
        'airplane_single_engine_land',
        d('2020-01-01'), // long before the lapse — spent, not a cure
      );
      expect(r.state).toBe('expired');
      expect(r.expiresOn).toBeNull();
      expect(r.action).toBe(
        'Past the 61.57(d) grace period — an instrument proficiency check (IPC) is required; approaches alone no longer restore currency',
      );
    });

    it('requires an IPC when no flight ever carried all three elements at once, and the stale activity is past the 12-month window', () => {
      // Mirrors imported logbook data: approaches and holds are logged, but
      // course tracking never is (the ForeFlight CSV importer always writes
      // `courseTracking: false`, since ForeFlight has no such column), so
      // `instrumentAnchor` can never reconstruct a moment of full (c)(1)
      // compliance. Without the fallback this would just report "needs
      // approaches, holding, tracking" forever, no matter how stale.
      const r = instrumentCurrency(
        [flight({ id: 'old', date: d('2024-01-05'), approaches: 6, holding: true, courseTracking: false })],
        d('2026-09-12'),
        'airplane_single_engine_land',
      );
      expect(r.state).toBe('expired');
      expect(r.expiresOn).toBeNull();
      expect(r.action).toBe(
        'Past the 61.57(d) grace period — an instrument proficiency check (IPC) is required; approaches alone no longer restore currency',
      );
    });

    it('does not require an IPC for the same incomplete data when it is still recent', () => {
      const r = instrumentCurrency(
        [flight({ id: 'recent', date: d('2026-08-20'), approaches: 6, holding: true, courseTracking: false })],
        d('2026-09-12'),
        'airplane_single_engine_land',
      );
      expect(r.state).toBe('expired');
      expect(r.action).toBe('Needs intercepting and tracking courses');
    });

    it('does not require an IPC for a pilot with no instrument activity on record at all', () => {
      const r = instrumentCurrency([], d('2026-09-12'), 'airplane_single_engine_land');
      expect(r.state).toBe('expired');
      expect(r.action).toBe('Needs 6 more approaches, holding procedures, intercepting and tracking courses');
    });
  });
});

describe('flightReviewCurrency — 61.56', () => {
  it('runs 24 calendar months to the end of the month', () => {
    const r = flightReviewCurrency(d('2026-07-14'), null, ASOF);
    expect(r.expiresOn).toEqual(d('2028-07-31'));
    expect(r.state).toBe('current');
  });

  it('is expired with no review on record', () => {
    const r = flightReviewCurrency(null, null, ASOF);
    expect(r.state).toBe('expired');
    expect(r.expiresOn).toBeNull();
  });

  it('is expired once the window has closed', () => {
    const r = flightReviewCurrency(d('2024-06-10'), null, ASOF);
    expect(r.state).toBe('expired');
    expect(r.action).toBe('A flight review is required before acting as pilot in command');
  });

  it('61.56(d): a checkride alone satisfies currency the same as a flight review', () => {
    const r = flightReviewCurrency(null, d('2026-07-14'), ASOF);
    expect(r.expiresOn).toEqual(d('2028-07-31'));
    expect(r.state).toBe('current');
    expect(r.have).toBe(1);
  });

  it('61.56(d): takes the more recent of a checkride and a flight review when the checkride is newer', () => {
    const r = flightReviewCurrency(d('2024-01-05'), d('2026-07-14'), ASOF);
    expect(r.expiresOn).toEqual(d('2028-07-31'));
    expect(r.state).toBe('current');
  });

  it('61.56(d): takes the more recent of a checkride and a flight review when the review is newer', () => {
    const r = flightReviewCurrency(d('2026-07-14'), d('2024-01-05'), ASOF);
    expect(r.expiresOn).toEqual(d('2028-07-31'));
    expect(r.state).toBe('current');
  });

  it('61.56(d): an old checkride does not save a lapsed flight review', () => {
    const r = flightReviewCurrency(d('2024-06-10'), d('2023-01-01'), ASOF);
    expect(r.state).toBe('expired');
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
    const r = medicalCurrency(d('2025-09-15'), 'second', 45, ASOF, 'second');
    expect(r.expiresOn).toEqual(d('2026-09-30'));
    expect(r.state).toBe('expiring');
  });

  it('defaults privilegesNeeded to third class', () => {
    const r = medicalCurrency(d('2025-03-02'), 'third', 38, ASOF);
    expect(r.expiresOn).toEqual(d('2030-03-31'));
    expect(r.state).toBe('current');
  });

  describe('step-down (61.23(d)(1)-(3))', () => {
    // First-class, age 45 at exam (>=40, so first-class privileges are only
    // good for 6 months — distinct from the second-class tier's flat 12,
    // which is what opens a gap between them to test).
    const issued = d('2026-01-15');

    it('a first class past its own 6-month window is still current for second-class privileges', () => {
      const first = medicalCurrency(issued, 'first', 45, ASOF, 'first');
      expect(first.expiresOn).toEqual(d('2026-07-31'));
      expect(first.state).toBe('expired');

      const second = medicalCurrency(issued, 'first', 45, ASOF, 'second');
      expect(second.expiresOn).toEqual(d('2027-01-31'));
      expect(second.state).toBe('current');
    });

    it('past the second-class window but within the third-class window is current for third-class privileges', () => {
      const asOf = d('2027-06-01');
      const second = medicalCurrency(issued, 'first', 45, asOf, 'second');
      expect(second.state).toBe('expired');

      const third = medicalCurrency(issued, 'first', 45, asOf, 'third');
      expect(third.expiresOn).toEqual(d('2028-01-31'));
      expect(third.state).toBe('current');
    });

    it('past all three tiers reads expired', () => {
      const asOf = d('2028-06-01');
      const r = medicalCurrency(issued, 'first', 45, asOf, 'third');
      expect(r.state).toBe('expired');
      expect(r.expiresOn).toEqual(d('2028-01-31'));
    });

    it('a second-class medical past its own window steps down to third-class privileges', () => {
      const secondIssued = d('2025-06-10');
      const asOf = d('2026-08-01');

      const second = medicalCurrency(secondIssued, 'second', 35, asOf, 'second');
      expect(second.state).toBe('expired');

      const third = medicalCurrency(secondIssued, 'second', 35, asOf, 'third');
      expect(third.expiresOn).toEqual(d('2030-06-30'));
      expect(third.state).toBe('current');
    });

    it('a third-class medical has no tier above it to step down from', () => {
      const thirdIssued = d('2025-03-02');
      // Third-class privileges behave exactly as before the step-down model.
      const third = medicalCurrency(thirdIssued, 'third', 38, ASOF, 'third');
      expect(third.expiresOn).toEqual(d('2030-03-31'));
      expect(third.state).toBe('current');

      // A third-class certificate never grants second- or first-class
      // privileges, at any age — fails safe rather than reporting currency
      // it doesn't have.
      expect(medicalCurrency(thirdIssued, 'third', 38, ASOF, 'second').state).toBe('expired');
      expect(medicalCurrency(thirdIssued, 'third', 38, ASOF, 'first').state).toBe('expired');
    });
  });
});

describe('basicMedCurrency — 14 CFR 68', () => {
  it('is current when both the course and exam windows are open', () => {
    // Exam (48 months) expires before the course (24 months) here, so it's
    // the binding requirement.
    const r = basicMedCurrency(d('2025-06-15'), d('2023-01-10'), ASOF);
    expect(r.state).toBe('current');
    expect(r.have).toBe(2);
    expect(r.need).toBe(2);
    expect(r.expiresOn).toEqual(d('2027-01-31'));
  });

  it('is expired when the course has lapsed but the exam has not', () => {
    const r = basicMedCurrency(d('2023-01-01'), d('2025-06-01'), ASOF);
    expect(r.state).toBe('expired');
    expect(r.have).toBe(1);
    expect(r.expiresOn).toEqual(d('2025-01-31'));
  });

  it('is expired when the exam has lapsed but the course has not', () => {
    const r = basicMedCurrency(d('2025-06-01'), d('2020-01-01'), ASOF);
    expect(r.state).toBe('expired');
    expect(r.have).toBe(1);
    expect(r.expiresOn).toEqual(d('2024-01-31'));
  });

  it('bands as expiring when the course window is the one closing soon', () => {
    const r = basicMedCurrency(d('2024-09-05'), d('2023-01-01'), ASOF);
    expect(r.expiresOn).toEqual(d('2026-09-30'));
    expect(r.state).toBe('expiring');
    expect(r.have).toBe(2);
  });

  it('bands as expiring when the exam window is the one closing soon', () => {
    const r = basicMedCurrency(d('2025-06-01'), d('2022-09-05'), ASOF);
    expect(r.expiresOn).toEqual(d('2026-09-30'));
    expect(r.state).toBe('expiring');
    expect(r.have).toBe(2);
  });

  it('reads null dates as not current without throwing', () => {
    const r = basicMedCurrency(null, null, ASOF);
    expect(r.state).toBe('expired');
    expect(r.have).toBe(0);
    expect(r.expiresOn).toBeNull();
    expect(r.daysRemaining).toBeNull();
  });

  it('reads a single missing date as not current even if the other is current', () => {
    const courseOnly = basicMedCurrency(d('2025-06-01'), null, ASOF);
    expect(courseOnly.state).toBe('expired');
    expect(courseOnly.have).toBe(1);
    expect(courseOnly.expiresOn).toBeNull();

    const examOnly = basicMedCurrency(null, d('2023-01-01'), ASOF);
    expect(examOnly.state).toBe('expired');
    expect(examOnly.have).toBe(1);
    expect(examOnly.expiresOn).toBeNull();
  });
});

describe('easaMedicalDurationMonths — MED.A.045', () => {
  it('gives 60 months under 40 and 24 months 40-49, for both classes', () => {
    expect(easaMedicalDurationMonths('lapl', 38)).toBe(60);
    expect(easaMedicalDurationMonths('class2', 38)).toBe(60);
    expect(easaMedicalDurationMonths('lapl', 40)).toBe(24);
    expect(easaMedicalDurationMonths('class2', 40)).toBe(24);
    expect(easaMedicalDurationMonths('lapl', 49)).toBe(24);
    expect(easaMedicalDurationMonths('class2', 49)).toBe(24);
  });

  it('gives Class 2 12 months at 50+, but LAPL has no third tier and stays at 24', () => {
    expect(easaMedicalDurationMonths('class2', 50)).toBe(12);
    expect(easaMedicalDurationMonths('class2', 65)).toBe(12);
    expect(easaMedicalDurationMonths('lapl', 50)).toBe(24);
    expect(easaMedicalDurationMonths('lapl', 65)).toBe(24);
  });
});

describe('easaMedicalCurrency — MED.A.045', () => {
  it('expires on the exam anniversary date, not the end of the calendar month', () => {
    // Contrast with medicalCurrency's 61.23(d), which explicitly extends
    // to month-end — MED.A.045 doesn't.
    const r = easaMedicalCurrency(d('1990-05-20'), d('2025-03-02'), 'lapl', ASOF);
    expect(r.expiresOn).toEqual(d('2030-03-02'));
    expect(r.state).toBe('current');
  });

  it('at exactly 40, steps down to the 24-month band for both classes', () => {
    const birthdate = d('1985-01-10');
    const issued = d('2025-01-10'); // holder turns 40 exactly on exam day
    expect(easaMedicalCurrency(birthdate, issued, 'lapl', ASOF).expiresOn).toEqual(d('2027-01-10'));
    expect(easaMedicalCurrency(birthdate, issued, 'class2', ASOF).expiresOn).toEqual(d('2027-01-10'));
  });

  it('does not truncate mid-term at the ordinary age-40 crossing — duration is fixed at the exam', () => {
    // Examined at 39: a nominal 60-month certificate. If MED.A.045 instead
    // truncated at every age-boundary crossing, this would drop to the
    // 24-month band the moment the holder turns 40 partway through. It
    // doesn't — see easaMedicalDurationMonths's doc comment.
    const birthdate = d('1990-01-01');
    const issued = d('2029-06-01'); // holder is 39 at exam
    const r = easaMedicalCurrency(birthdate, issued, 'lapl', d('2031-01-01')); // holder is 41 here
    expect(r.state).toBe('current');
  });

  it("applies MED.A.045's absolute age-42 cessation cap on top of the fixed duration", () => {
    // Same 39-at-exam certificate as above: its nominal 60 months would run
    // to 2034-06-01, but a certificate examined under 40 additionally
    // ceases to be valid once its holder turns 42 — 2032-01-01 here — which
    // is earlier, so that's the real expiry.
    const birthdate = d('1990-01-01');
    const issued = d('2029-06-01');
    const r = easaMedicalCurrency(birthdate, issued, 'lapl', ASOF);
    expect(r.expiresOn).toEqual(d('2032-01-01'));
  });

  it('applies the Class 2 age-51 cessation cap for a 40-49 exam, but LAPL has no such cap', () => {
    const birthdate = d('1976-03-01');
    const issued = d('2025-09-01'); // holder is 49 at exam

    const class2 = easaMedicalCurrency(birthdate, issued, 'class2', ASOF);
    expect(class2.expiresOn).toEqual(d('2027-03-01'));

    // LAPL's 40+ band never steps down again, so nothing caps it — the
    // nominal 24-month duration governs outright.
    const lapl = easaMedicalCurrency(birthdate, issued, 'lapl', ASOF);
    expect(lapl.expiresOn).toEqual(d('2027-09-01'));
  });

  it('warns inside the 30-day expiring band', () => {
    const r = easaMedicalCurrency(d('1990-01-01'), d('2021-09-20'), 'lapl', ASOF);
    expect(r.expiresOn).toEqual(d('2026-09-20'));
    expect(r.state).toBe('expiring');
  });

  it('reads a missing birthdate or issue date as not current, without throwing', () => {
    const r = easaMedicalCurrency(null, null, 'class2', ASOF);
    expect(r.state).toBe('expired');
    expect(r.have).toBe(0);
    expect(r.expiresOn).toBeNull();
    expect(r.daysRemaining).toBeNull();

    const birthdateOnly = easaMedicalCurrency(d('1990-01-01'), null, 'lapl', ASOF);
    expect(birthdateOnly.have).toBe(0);
    expect(birthdateOnly.expiresOn).toBeNull();

    const issuedOnly = easaMedicalCurrency(null, d('2023-01-01'), 'lapl', ASOF);
    expect(issuedOnly.have).toBe(0);
    expect(issuedOnly.expiresOn).toBeNull();
  });
});
