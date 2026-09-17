/**
 * Groups flights into buckets and reduces each bucket to one number — the
 * engine behind the Analysis page's chart. Pure: takes an explicit flight
 * array and returns plain data, no chart library or rendering concerns here.
 */

import type { BucketGrouping } from './buckets.js';
import type { AnalysisFlight, GraphableField } from './fields.js';

export type AnalysisDataPoint = {
  key: string;
  label: string;
  value: number;
};

/**
 * Buckets `flights` by `grouping`, reduces each bucket with `field`, and
 * orders the result: chronological/seasonal groupings sort into calendar
 * order (`Bucket.order`, see `buckets.ts`), categorical groupings sort by
 * value descending — the largest slice reads first, matching a "compare
 * magnitude" bar chart's job (see the dataviz skill's choosing-a-form guide).
 */
export function aggregateFlights(
  flights: Array<AnalysisFlight>,
  field: GraphableField,
  grouping: BucketGrouping,
): Array<AnalysisDataPoint> {
  const groups = new Map<string, { label: string; order: number; flights: Array<AnalysisFlight> }>();
  for (const flight of flights) {
    const bucket = grouping.bucketOf(flight);
    let group = groups.get(bucket.key);
    if (!group) {
      group = { label: bucket.label, order: bucket.order, flights: [] };
      groups.set(bucket.key, group);
    }
    group.flights.push(flight);
  }

  const points = [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    value: field.reduce(group.flights),
    order: group.order,
  }));

  points.sort(grouping.kind === 'chronological' ? (a, b) => a.order - b.order : (a, b) => b.value - a.value);

  return points.map(({ key, label, value }) => ({ key, label, value }));
}

export type AnalysisDataPointWithAverage = AnalysisDataPoint & { runningAverage: number };

/** Overlays a cumulative running average onto already-ordered points —
 * meaningful for a chronological bucketing, where "average so far" tracks a
 * trend; the caller decides when that's the case (see the Analysis route,
 * which only offers the overlay for chronological groupings). */
export function withRunningAverage(points: Array<AnalysisDataPoint>): Array<AnalysisDataPointWithAverage> {
  let sum = 0;
  return points.map((point, i) => {
    sum += point.value;
    return { ...point, runningAverage: sum / (i + 1) };
  });
}
