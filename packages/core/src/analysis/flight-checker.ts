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
 * on when it runs).
 */

export type FlightCheckWarning = {
  /** Stable machine-readable id, e.g. 'pic_exceeds_total'. */
  code: string;
  /** Human-readable, ready to render as-is. */
  message: string;
};

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
};

/** Above this, a single flight is flagged as unusually long rather than wrong outright. */
export const UNUSUALLY_LONG_FLIGHT_HOURS = 18;

/** Single-flight checks — everything here is evaluable from one flight alone. */
export function checkFlight(flight: CheckableFlight, now: Date = new Date()): Array<FlightCheckWarning> {
  const warnings: Array<FlightCheckWarning> = [];

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

  if (flight.totalTime > 0 && flight.totalLandings === 0) {
    warnings.push({
      code: 'no_landings_logged',
      message: 'Flight has time logged but no landings — was a landing missed?',
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
    const key = [
      flight.date.toDateString(),
      flight.totalTime,
      flight.totalLandings,
      flight.tailNumber ?? '',
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
