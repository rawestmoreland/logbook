/**
 * The Y-axis side of the Analysis page: metrics summed per bucket. Modeled on
 * MyFlightBook's HistogramableValues, trimmed to the fields this app's
 * `flights` schema actually carries — no dual-given/CFI, ground-sim, or
 * cross-country fields exist here (see `flights.ts`'s `FlightsRecord`).
 *
 * Adding a field is adding one entry below, not a new branch anywhere else —
 * `aggregateFlights` (`aggregate.ts`) treats every field the same way.
 */

import type { AircraftInstanceType, CategoryClass } from '../aircraft.js';
import { startOfDay } from '../currency/calendar.js';

/** The slice of a flight the Analysis page's fields and bucket groupings
 * read — sums come from the flight fields, buckets from `categoryClass`/
 * `instanceType`/`tailNumber`/`aircraftModel`, same split as
 * `CurrencyFlight` in `currency/rules.ts`. */
export type AnalysisFlight = {
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
  approaches: number;
  dayLandings: number;
  dayLandingsFullStop: number;
  nightLandings: number;
  tailNumber: string;
  aircraftModel: string;
  categoryClass: CategoryClass;
  instanceType: AircraftInstanceType;
};

export type GraphableFieldUnit = 'hours' | 'count';

export type GraphableField = {
  id: string;
  label: string;
  unit: GraphableFieldUnit;
  /** Reduces a bucket's flights to the one number that bucket plots. Most
   * fields just sum a property; `flightCount`/`distinctFlightDays` reduce
   * the group itself instead of any one flight's value. */
  reduce: (flights: Array<AnalysisFlight>) => number;
};

function sumBy(selector: (flight: AnalysisFlight) => number): (flights: Array<AnalysisFlight>) => number {
  return (flights) => flights.reduce((sum, f) => sum + selector(f), 0);
}

export const GRAPHABLE_FIELDS: Array<GraphableField> = [
  { id: 'totalTime', label: 'Total time', unit: 'hours', reduce: sumBy((f) => f.totalTime) },
  { id: 'picTime', label: 'PIC time', unit: 'hours', reduce: sumBy((f) => f.picTime) },
  { id: 'sicTime', label: 'SIC time', unit: 'hours', reduce: sumBy((f) => f.sicTime) },
  { id: 'dualTime', label: 'Dual received', unit: 'hours', reduce: sumBy((f) => f.dualTime) },
  { id: 'soloTime', label: 'Solo time', unit: 'hours', reduce: sumBy((f) => f.soloTime) },
  { id: 'nightTime', label: 'Night time', unit: 'hours', reduce: sumBy((f) => f.nightTime) },
  { id: 'actualInstrument', label: 'Actual instrument', unit: 'hours', reduce: sumBy((f) => f.actualInstrument) },
  { id: 'simInstrument', label: 'Simulated instrument', unit: 'hours', reduce: sumBy((f) => f.simInstrument) },
  { id: 'approaches', label: 'Approaches', unit: 'count', reduce: sumBy((f) => f.approaches) },
  {
    id: 'totalLandings',
    label: 'Total landings',
    unit: 'count',
    reduce: sumBy((f) => f.dayLandings + f.nightLandings),
  },
  {
    id: 'dayLandingsFullStop',
    label: 'Day full-stop landings',
    unit: 'count',
    reduce: sumBy((f) => f.dayLandingsFullStop),
  },
  { id: 'nightLandings', label: 'Night full-stop landings', unit: 'count', reduce: sumBy((f) => f.nightLandings) },
  { id: 'flightCount', label: '# of flights', unit: 'count', reduce: (flights) => flights.length },
  {
    id: 'distinctFlightDays',
    label: '# of distinct flight days',
    unit: 'count',
    reduce: (flights) => new Set(flights.map((f) => startOfDay(f.date).getTime())).size,
  },
];

export function isGraphableFieldId(value: string): boolean {
  return GRAPHABLE_FIELDS.some((f) => f.id === value);
}
