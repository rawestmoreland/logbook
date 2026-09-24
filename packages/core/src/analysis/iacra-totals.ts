/**
 * Aggregates a pilot's flights into the shape of FAA Form 8710-1 / IACRA's
 * "Record of Pilot Time" worksheet: one row per aircraft category/class, a
 * separate row for the pilot's pre-app carry-forward totals, and a grand
 * total across both. Pure aggregation, no eligibility/pass-fail logic — see
 * `aggregate.ts` for the sibling that reduces the same flight shape for the
 * Analysis page's charts instead.
 *
 * A category/class row is further split on whether the time was logged in a
 * real aircraft or a simulator/ATD (`AnalysisFlight.instanceType`):
 * IACRA's Aeronautical Experience grid keeps device time out of a category's
 * real-aircraft column — e.g. ATD time flown in a single-engine device is
 * entered as its own "ATD-SEL" line, not folded into Airplane SEL — so
 * merging the two here would hand a pilot a number they'd have to manually
 * re-split before transcribing it.
 */

import { CATEGORY_CLASSES } from '../aircraft.js';

import type { CategoryClass } from '../aircraft.js';
import type { AnalysisFlight } from './fields.js';

export type IacraTotalsRow = {
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
  groundSimTime: number;
  approaches: number;
  totalLandings: number;
  dayLandingsFullStop: number;
  nightLandingsFullStop: number;
  flightCount: number;
};

export type IacraCategoryRow = IacraTotalsRow & {
  categoryClass: CategoryClass;
  /** True for a row totaling simulator/ATD/FTD time logged in this
   * category/class rather than a real aircraft — see this file's doc
   * comment for why that's a separate row rather than a flag on the same
   * one. */
  isSimulator: boolean;
};

export type IacraTotalsResult = {
  /** Ordered per `CATEGORY_CLASSES`, real-aircraft row before its
   * simulator/ATD counterpart; a category/class/device combination the
   * pilot has never logged is omitted rather than rendered as a zero row. */
  categoryRows: Array<IacraCategoryRow>;
  /** The pilot's starting-totals carry-forward, if they've entered one —
   * `null` when they haven't. Never attributed to a category/class: the
   * starting-totals `flights` row has no `aircraft` (see
   * `saveStartingTotals`), so there is nothing to resolve a category/class
   * from — it folds into `grandTotal` on its own line instead. */
  priorTotals: IacraTotalsRow | null;
  /** `categoryRows` and `priorTotals` combined — what a pilot's true
   * lifetime total looks like across every field this worksheet tracks. */
  grandTotal: IacraTotalsRow;
};

function zeroRow(): IacraTotalsRow {
  return {
    totalTime: 0,
    picTime: 0,
    sicTime: 0,
    dualTime: 0,
    soloTime: 0,
    nightTime: 0,
    actualInstrument: 0,
    simInstrument: 0,
    crossCountryTime: 0,
    dualGivenTime: 0,
    groundSimTime: 0,
    approaches: 0,
    totalLandings: 0,
    dayLandingsFullStop: 0,
    nightLandingsFullStop: 0,
    flightCount: 0,
  };
}

function addRow(a: IacraTotalsRow, b: IacraTotalsRow): IacraTotalsRow {
  return {
    totalTime: a.totalTime + b.totalTime,
    picTime: a.picTime + b.picTime,
    sicTime: a.sicTime + b.sicTime,
    dualTime: a.dualTime + b.dualTime,
    soloTime: a.soloTime + b.soloTime,
    nightTime: a.nightTime + b.nightTime,
    actualInstrument: a.actualInstrument + b.actualInstrument,
    simInstrument: a.simInstrument + b.simInstrument,
    crossCountryTime: a.crossCountryTime + b.crossCountryTime,
    dualGivenTime: a.dualGivenTime + b.dualGivenTime,
    groundSimTime: a.groundSimTime + b.groundSimTime,
    approaches: a.approaches + b.approaches,
    totalLandings: a.totalLandings + b.totalLandings,
    dayLandingsFullStop: a.dayLandingsFullStop + b.dayLandingsFullStop,
    nightLandingsFullStop: a.nightLandingsFullStop + b.nightLandingsFullStop,
    flightCount: a.flightCount + b.flightCount,
  };
}

function addFlight(row: IacraTotalsRow, f: AnalysisFlight): IacraTotalsRow {
  return addRow(row, {
    totalTime: f.totalTime,
    picTime: f.picTime,
    sicTime: f.sicTime,
    dualTime: f.dualTime,
    soloTime: f.soloTime,
    nightTime: f.nightTime,
    actualInstrument: f.actualInstrument,
    simInstrument: f.simInstrument,
    crossCountryTime: f.crossCountryTime,
    dualGivenTime: f.dualGivenTime,
    groundSimTime: f.groundSimTime,
    approaches: f.approaches,
    totalLandings: f.totalLandings,
    dayLandingsFullStop: f.dayLandingsFullStop,
    nightLandingsFullStop: f.nightLandingsFullStop,
    flightCount: 1,
  });
}

const CATEGORY_CLASS_ORDER = new Map(CATEGORY_CLASSES.map((c, i) => [c, i]));

export function computeIacraTotals(
  flights: Array<AnalysisFlight>,
  priorTotals: IacraTotalsRow | null,
): IacraTotalsResult {
  const groups = new Map<string, IacraCategoryRow>();
  for (const flight of flights) {
    const isSimulator = flight.instanceType !== 'real';
    const key = `${flight.categoryClass}|${isSimulator}`;
    const existing = groups.get(key) ?? { ...zeroRow(), categoryClass: flight.categoryClass, isSimulator };
    groups.set(key, { ...addFlight(existing, flight), categoryClass: flight.categoryClass, isSimulator });
  }

  const categoryRows = [...groups.values()].sort((a, b) => {
    const byCategory = CATEGORY_CLASS_ORDER.get(a.categoryClass)! - CATEGORY_CLASS_ORDER.get(b.categoryClass)!;
    return byCategory !== 0 ? byCategory : Number(a.isSimulator) - Number(b.isSimulator);
  });

  const grandTotal = categoryRows.reduce((sum, row) => addRow(sum, row), priorTotals ?? zeroRow());

  return { categoryRows, priorTotals, grandTotal };
}
