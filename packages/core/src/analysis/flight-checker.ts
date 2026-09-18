/**
 * "Check Flights" — a batch-mode data validation pass over the logbook.
 *
 * This surfaces warnings, not errors: nothing here blocks saving or editing a
 * flight, it just flags entries worth a second look. The canonical case is a
 * missed decimal point — 14.0 logged instead of 1.4 — which silently inflates
 * PIC/dual/night/etc. time far past what the flight's total could support.
 *
 * Every function is pure and takes explicit flights; no I/O, no `new Date()`
 * defaults baked in (the caller passes `now` for the future-date check so this
 * stays testable and doesn't silently answer a different question depending
 * on when it runs). `checkCrossCountryDistance` is the one exception to "no
 * I/O": it still takes no I/O itself, but it needs airport coordinates the
 * caller has already resolved (see its own doc comment).
 */

import { nauticalMilesBetween, type Coordinates } from '../airports.js';
import type { AircraftInstanceType } from '../aircraft.js';
import { routeWaypointIdents } from '../route.js';

export type FlightCheckWarning = {
  /** Stable machine-readable id, e.g. 'pic_exceeds_total'. */
  code: string;
  /** Human-readable, ready to render as-is. */
  message: string;
};

/**
 * Groups the individual warning codes above into a small, human-scale set
 * of categories a UI can offer as checkboxes — one source of truth so any
 * client can let the pilot narrow which checks run without duplicating the
 * grouping logic (see `CHECK_CATEGORIES`).
 */
export type CheckCategoryId =
  | 'time_totals'
  | 'landings'
  | 'logic_conflicts'
  | 'date_duration'
  | 'duplicates'
  | 'cross_country';

export type CheckCategory = {
  id: CheckCategoryId;
  label: string;
  codes: ReadonlyArray<string>;
};

export const CHECK_CATEGORIES: ReadonlyArray<CheckCategory> = [
  {
    id: 'time_totals',
    label: 'Time totals',
    codes: ['time_field_exceeds_total', 'instrument_exceeds_total', 'pic_sic_exceeds_total'],
  },
  {
    id: 'landings',
    label: 'Landings',
    codes: ['full_stop_landings_exceed_total', 'night_landings_exceed_total'],
  },
  {
    id: 'logic_conflicts',
    label: 'Logic conflicts',
    codes: ['solo_and_dual', 'dual_received_and_given'],
  },
  {
    id: 'date_duration',
    label: 'Date & duration anomalies',
    codes: ['future_date', 'unusually_long_flight'],
  },
  {
    id: 'duplicates',
    label: 'Duplicate flights',
    codes: ['duplicate_flight'],
  },
  {
    id: 'cross_country',
    label: 'Cross-country distance',
    codes: ['cross_country_below_threshold', 'cross_country_not_logged'],
  },
];

/**
 * Maps each warning code to the `FlightFormValues` field name(s) worth
 * surfacing for an inline fix — lets a UI (Check Flights' expandable
 * accordion) show just the inputs relevant to a warning instead of the
 * whole flight form. `duplicate_flight` has no entry: fixing a duplicate
 * means deciding which flight to edit or delete, not editing a single
 * field, so it still routes to the full flight page.
 */
export const WARNING_CODE_FIELDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  time_field_exceeds_total: ['totalTime', 'picTime', 'sicTime', 'dualTime', 'nightTime', 'crossCountryTime'],
  instrument_exceeds_total: ['totalTime', 'actualInstrument', 'simInstrument'],
  pic_sic_exceeds_total: ['totalTime', 'picTime', 'sicTime'],
  solo_and_dual: ['soloTime', 'dualTime'],
  dual_received_and_given: ['dualTime', 'dualGivenTime'],
  full_stop_landings_exceed_total: ['totalLandings', 'dayLandingsFullStop', 'nightLandingsFullStop'],
  night_landings_exceed_total: ['totalLandings', 'nightLandingsFullStop'],
  future_date: ['date'],
  unusually_long_flight: ['totalTime'],
  cross_country_below_threshold: ['crossCountryTime', 'routeFrom', 'routeTo', 'route'],
  cross_country_not_logged: ['crossCountryTime', 'routeFrom', 'routeTo', 'route'],
};

/** Display order for `fieldsForWarnings`' output — stable regardless of
 * which warnings fired or in what order, so a flight with multiple
 * warnings doesn't reshuffle its fix form on every render. */
const FIELD_ORDER: ReadonlyArray<string> = [
  'date',
  'routeFrom',
  'routeTo',
  'route',
  'totalTime',
  'picTime',
  'sicTime',
  'dualTime',
  'soloTime',
  'nightTime',
  'actualInstrument',
  'simInstrument',
  'crossCountryTime',
  'dualGivenTime',
  'totalLandings',
  'dayLandingsFullStop',
  'nightLandingsFullStop',
];

/**
 * The union of fields worth showing to fix every warning in the list, e.g.
 * for Check Flights' inline accordion — a flight with both a time warning
 * and a cross-country warning gets both sets of fields, deduplicated and in
 * a stable order.
 */
export function fieldsForWarnings(warnings: ReadonlyArray<FlightCheckWarning>): Array<string> {
  const fields = new Set<string>();
  for (const warning of warnings) {
    for (const field of WARNING_CODE_FIELDS[warning.code] ?? []) fields.add(field);
  }
  return FIELD_ORDER.filter((field) => fields.has(field));
}

export type CheckableFlight = {
  id: string;
  date: Date;
  totalTime: number;
  picTime: number;
  sicTime: number;
  dualTime: number;
  soloTime: number;
  nightTime: number;
  actualInstrument: number;
  simInstrument: number;
  crossCountryTime: number;
  dualGivenTime: number;
  totalLandings: number;
  dayLandingsFullStop: number;
  nightLandingsFullStop: number;
  approaches: number;
  /** Threaded through for duplicate detection; unrelated to single-flight checks. */
  tailNumber?: string | null;
  /**
   * Threaded through for duplicate detection, so two flights on the same
   * route aren't the only ones distinguishable — unrelated to single-flight
   * checks. Falls back to `[routeFrom, routeTo]` when `route` is empty, same
   * as `routeWaypointIdents` itself.
   */
  routeFrom?: string | null;
  routeTo?: string | null;
  route?: string | null;
  /**
   * Real aircraft vs. simulator/ATD (see `AircraftInstanceType` in
   * `aircraft.ts`). A device session legitimately logs dual-received (or
   * other) time with `totalTime === 0` — device time isn't "total time" in
   * the 61.51 sense — which `time_field_exceeds_total` would otherwise read
   * as the decimal-point typo it exists to catch. Defaults to `'real'` when
   * absent, so callers that don't have this data still get the original,
   * stricter behavior.
   */
  instanceType?: AircraftInstanceType;
};

/** Above this, a single flight is flagged as unusually long rather than wrong outright. */
export const UNUSUALLY_LONG_FLIGHT_HOURS = 18;

/** Single-flight checks — everything here is evaluable from one flight alone. */
export function checkFlight(flight: CheckableFlight, now: Date = new Date()): Array<FlightCheckWarning> {
  const warnings: Array<FlightCheckWarning> = [];

  // A device session (simulator/ATD) legitimately logs sub-fields — dual
  // received, most commonly — against a `totalTime` of 0, since device time
  // isn't "total time" in the 61.51 sense. That's not the decimal-point-typo
  // shape this check exists to catch, so device sessions are exempt when
  // `totalTime` is 0. A real-aircraft flight with the same field values is
  // still a typo and still gets flagged — `instanceType` defaults to `'real'`
  // when the caller doesn't have it, preserving the original strict behavior.
  const isZeroTotalDeviceSession = flight.totalTime === 0 && (flight.instanceType ?? 'real') !== 'real';

  if (!isZeroTotalDeviceSession) {
    const timeFieldsExceedingTotal: Array<[string, number]> = [
      ['PIC', flight.picTime],
      ['SIC', flight.sicTime],
      ['dual received', flight.dualTime],
      ['night', flight.nightTime],
      ['cross-country', flight.crossCountryTime],
    ];
    for (const [label, value] of timeFieldsExceedingTotal) {
      if (value > flight.totalTime) {
        warnings.push({
          code: 'time_field_exceeds_total',
          message: `${label} time (${value}) exceeds total time (${flight.totalTime}) — check for a misplaced decimal point.`,
        });
      }
    }
  }

  if (flight.actualInstrument + flight.simInstrument > flight.totalTime) {
    warnings.push({
      code: 'instrument_exceeds_total',
      message: `Actual + simulated instrument time (${flight.actualInstrument + flight.simInstrument}) exceeds total time (${flight.totalTime}).`,
    });
  }

  if (flight.picTime + flight.sicTime > flight.totalTime) {
    warnings.push({
      code: 'pic_sic_exceeds_total',
      message: `PIC + SIC time (${flight.picTime + flight.sicTime}) exceeds total time (${flight.totalTime}) — can't be sole PIC and SIC on the same flight.`,
    });
  }

  if (flight.soloTime > 0 && flight.dualTime > 0) {
    warnings.push({
      code: 'solo_and_dual',
      message: 'Flight logs both solo time and dual received time — these are mutually exclusive.',
    });
  }

  if (flight.dualTime > 0 && flight.dualGivenTime > 0) {
    warnings.push({
      code: 'dual_received_and_given',
      message: "Flight logs both dual received and dual given — can't be receiving and giving instruction at once.",
    });
  }

  if (flight.dayLandingsFullStop + flight.nightLandingsFullStop > flight.totalLandings) {
    warnings.push({
      code: 'full_stop_landings_exceed_total',
      message: `Day + night full-stop landings (${flight.dayLandingsFullStop + flight.nightLandingsFullStop}) exceed total landings (${flight.totalLandings}).`,
    });
  }

  if (flight.nightLandingsFullStop > flight.totalLandings) {
    warnings.push({
      code: 'night_landings_exceed_total',
      message: `Night full-stop landings (${flight.nightLandingsFullStop}) exceed total landings (${flight.totalLandings}).`,
    });
  }

  if (flight.date.getTime() > now.getTime()) {
    warnings.push({
      code: 'future_date',
      message: `Flight is dated ${flight.date.toDateString()}, which is in the future.`,
    });
  }

  if (flight.totalTime > UNUSUALLY_LONG_FLIGHT_HOURS) {
    warnings.push({
      code: 'unusually_long_flight',
      message: `Total time (${flight.totalTime}) is unusually long for a single flight — double check it's correct.`,
    });
  }

  return warnings;
}

/** Cross-flight checks — currently just duplicate detection. */
export function checkForDuplicateFlights(flights: Array<CheckableFlight>): Map<string, Array<FlightCheckWarning>> {
  const warningsByFlightId = new Map<string, Array<FlightCheckWarning>>();

  const groups = new Map<string, Array<CheckableFlight>>();
  for (const flight of flights) {
    const routeIdents = routeWaypointIdents(flight.routeFrom ?? '', flight.routeTo ?? '', flight.route);
    const key = [
      flight.date.toDateString(),
      flight.totalTime,
      flight.totalLandings,
      flight.tailNumber ?? '',
      routeIdents.join('>'),
    ].join('|');
    const group = groups.get(key);
    if (group) {
      group.push(flight);
    } else {
      groups.set(key, [flight]);
    }
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const flight of group) {
      const others = group.filter((other) => other.id !== flight.id);
      warningsByFlightId.set(flight.id, [
        {
          code: 'duplicate_flight',
          message: `Possible duplicate of flight${others.length > 1 ? 's' : ''} ${others
            .map((other) => other.id)
            .join(', ')} — same date, total time, and landings.`,
        },
      ]);
    }
  }

  return warningsByFlightId;
}

/** The 61.1(b)(3)(ii) reading of "cross-country" — landing more than this
 * many nautical miles, straight-line, from the point of departure. This is
 * the distance-gated definition used for ATP/1500-hour time-building, not
 * the broader "landed at any other point" definition every certificate
 * level otherwise qualifies under — a flight under this threshold can still
 * be legitimate cross-country time for other purposes, so this only warns,
 * never blocks. */
export const CROSS_COUNTRY_NM_THRESHOLD = 50;

export type CheckableFlightRoute = {
  id: string;
  crossCountryTime: number;
  /**
   * Ordered coordinates for the flight's route, resolved by the caller
   * (`routeWaypointIdents` in `route.ts` turns `routeFrom`/`route`/`routeTo`
   * into idents; an airport lookup turns those into coordinates). An
   * airport that couldn't be resolved — unknown ident, private strip not in
   * the dataset — is simply left out rather than blocking the whole route;
   * `maxDistanceFromOriginNm` runs on whatever did resolve.
   */
  waypoints: ReadonlyArray<Coordinates>;
};

/**
 * How far a route gets from its first waypoint, in nautical miles — not the
 * total distance flown, the farthest single point from the origin, which is
 * what the 61.1(b)(3)(ii) definition actually measures. `null` when fewer
 * than two waypoints resolved — not enough to say anything.
 */
export function maxDistanceFromOriginNm(waypoints: ReadonlyArray<Coordinates>): number | null {
  if (waypoints.length < 2) return null;
  const [origin, ...rest] = waypoints as [Coordinates, ...Array<Coordinates>];
  return Math.max(...rest.map((point) => nauticalMilesBetween(origin, point)));
}

/**
 * Cross-flight in the same sense as `checkForDuplicateFlights`: not that it
 * compares flights against each other, but that it needs data beyond the
 * flight's own fields — airport coordinates the caller resolves — so it
 * can't live in `checkFlight`.
 */
export function checkCrossCountryDistance(
  flights: ReadonlyArray<CheckableFlightRoute>,
): Map<string, Array<FlightCheckWarning>> {
  const warningsByFlightId = new Map<string, Array<FlightCheckWarning>>();

  for (const flight of flights) {
    const distance = maxDistanceFromOriginNm(flight.waypoints);
    if (distance === null) continue;

    if (flight.crossCountryTime > 0 && distance < CROSS_COUNTRY_NM_THRESHOLD) {
      warningsByFlightId.set(flight.id, [
        {
          code: 'cross_country_below_threshold',
          message: `Cross-country time is logged, but the farthest point on the route is only ${distance.toFixed(1)}nm from the origin — under the ${CROSS_COUNTRY_NM_THRESHOLD}nm 61.1 cross-country threshold.`,
        },
      ]);
    } else if (flight.crossCountryTime === 0 && distance >= CROSS_COUNTRY_NM_THRESHOLD) {
      warningsByFlightId.set(flight.id, [
        {
          code: 'cross_country_not_logged',
          message: `The route's farthest point is ${distance.toFixed(1)}nm from the origin, past the ${CROSS_COUNTRY_NM_THRESHOLD}nm 61.1 cross-country threshold, but no cross-country time is logged.`,
        },
      ]);
    }
  }

  return warningsByFlightId;
}
