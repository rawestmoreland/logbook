/**
 * The X-axis side of the Analysis page: how flights are grouped into bars.
 * Modeled on MyFlightBook's Histogram.cs grouping modes — a rolling/calendar
 * time axis, a seasonality axis (position in the year/week regardless of
 * which year/week), and a categorical axis over the aircraft actually flown.
 *
 * Adding a grouping is adding one entry below — `aggregateFlights`
 * (`aggregate.ts`) doesn't special-case any of them.
 */

import { CATEGORY_CLASS_LABELS, AIRCRAFT_INSTANCE_TYPE_LABELS } from '../aircraft.js';
import { startOfDay } from '../currency/calendar.js';

import type { AnalysisFlight } from './fields.js';

/** One flight's assignment into a bucket: `key` identifies the bucket,
 * `label` is what the axis shows, `order` sorts chronological/seasonal
 * buckets into calendar order (ignored for categorical groupings — see
 * `aggregateFlights`, which sorts those by value instead). */
export type Bucket = {
  key: string;
  label: string;
  order: number;
};

export type BucketKind = 'chronological' | 'categorical';

export type BucketGrouping = {
  id: string;
  label: string;
  kind: BucketKind;
  bucketOf: (flight: AnalysisFlight) => Bucket;
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Monday of the ISO week containing `date`. */
function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export const BUCKET_GROUPINGS: Array<BucketGrouping> = [
  {
    id: 'year',
    label: 'Year',
    kind: 'chronological',
    bucketOf: (f) => {
      const year = f.date.getFullYear();
      return { key: String(year), label: String(year), order: year };
    },
  },
  {
    id: 'yearMonth',
    label: 'Month',
    kind: 'chronological',
    bucketOf: (f) => {
      const year = f.date.getFullYear();
      const month = f.date.getMonth();
      return {
        key: `${year}-${pad2(month + 1)}`,
        label: `${MONTH_ABBR[month]} ${year}`,
        order: year * 12 + month,
      };
    },
  },
  {
    id: 'week',
    label: 'Week',
    kind: 'chronological',
    bucketOf: (f) => {
      const monday = startOfWeek(f.date);
      return {
        key: `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`,
        label: `${MONTH_ABBR[monday.getMonth()]} ${monday.getDate()}, ${monday.getFullYear()}`,
        order: monday.getTime(),
      };
    },
  },
  {
    id: 'monthOfYear',
    label: 'Month of year',
    kind: 'chronological',
    bucketOf: (f) => {
      const month = f.date.getMonth();
      return { key: String(month), label: MONTH_ABBR[month] as string, order: month };
    },
  },
  {
    id: 'dayOfWeek',
    label: 'Day of week',
    kind: 'chronological',
    bucketOf: (f) => {
      const day = f.date.getDay();
      return { key: String(day), label: DAY_ABBR[day] as string, order: day };
    },
  },
  {
    id: 'tailNumber',
    label: 'Aircraft (tail number)',
    kind: 'categorical',
    bucketOf: (f) => ({ key: f.tailNumber, label: f.tailNumber, order: 0 }),
  },
  {
    id: 'aircraftModel',
    label: 'Aircraft model',
    kind: 'categorical',
    bucketOf: (f) => ({ key: f.aircraftModel, label: f.aircraftModel, order: 0 }),
  },
  {
    id: 'categoryClass',
    label: 'Category/class',
    kind: 'categorical',
    bucketOf: (f) => ({
      key: f.categoryClass,
      label: CATEGORY_CLASS_LABELS[f.categoryClass],
      order: 0,
    }),
  },
  {
    id: 'instanceType',
    label: 'Real vs. simulator',
    kind: 'categorical',
    bucketOf: (f) => ({
      key: f.instanceType,
      label: AIRCRAFT_INSTANCE_TYPE_LABELS[f.instanceType],
      order: 0,
    }),
  },
];

export function isBucketGroupingId(value: string): boolean {
  return BUCKET_GROUPINGS.some((g) => g.id === value);
}
