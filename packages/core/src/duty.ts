/**
 * Duty/rest elapsed-time helpers for the airline-profile home screen.
 *
 * This is deliberately NOT a 14 CFR Part 117 flight/duty/rest legality
 * engine — Part 117's flight duty period limits (keyed by report time and
 * number of flight segments), cumulative flight-time limits, and rest
 * facility requirements are far more involved than a home-screen widget
 * should attempt to encode correctly. These functions only measure elapsed
 * time between clock times a pilot has logged, the same descriptive,
 * no-legality-claim spirit as this app leaving BasicMed's operational
 * limitations untracked (see `basicMedCurrency` in `currency/rules.ts`).
 */

const MINUTES_PER_DAY = 24 * 60;

/**
 * Parses "HH:MM" (24-hour) to minutes since midnight. Throws on anything
 * else — same fail-loud contract as `flight-form.ts`'s `parseDateValue` for
 * a shared, now-authoritative time format, rather than silently treating a
 * malformed time as zero.
 */
export function parseTimeValue(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new RangeError(`Expected an HH:MM time, received "${value}"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** `date`'s calendar day combined with an "HH:MM" clock time, in local time. */
function withTime(date: Date, time: string): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setMinutes(parseTimeValue(time));
  return result;
}

/**
 * Elapsed hours of a single duty period. A release time at or before report
 * is treated as crossing midnight rather than as a negative duration — a
 * 22:00 report with a 06:00 release reads as an 8-hour duty period, matching
 * how an airline pilot would actually read their own schedule.
 */
export function dutyPeriodHours(dutyDate: Date, reportTime: string, releaseTime: string): number {
  const report = withTime(dutyDate, reportTime);
  const release = withTime(dutyDate, releaseTime);
  const releaseMs =
    release.getTime() <= report.getTime() ? release.getTime() + MINUTES_PER_DAY * 60_000 : release.getTime();
  return (releaseMs - report.getTime()) / 3_600_000;
}

/**
 * Elapsed rest hours between one duty period's release and the next duty
 * period's report. Out-of-order or overlapping records (a next report at or
 * before the previous release) report 0 rather than a negative number —
 * fails safe toward "no rest credited", the same under- rather than
 * over-reporting philosophy as `currency/rules.ts`.
 */
export function restHours(
  previousReleaseDate: Date,
  previousReleaseTime: string,
  nextReportDate: Date,
  nextReportTime: string,
): number {
  const previousRelease = withTime(previousReleaseDate, previousReleaseTime);
  const nextReport = withTime(nextReportDate, nextReportTime);
  return Math.max(0, (nextReport.getTime() - previousRelease.getTime()) / 3_600_000);
}
