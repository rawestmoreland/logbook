/**
 * Running cumulative totals for the printable logbook view
 * (`apps/web/src/routes/_authed/print-logbook.tsx`) — each flight row gets a
 * "running total" snapshot as of that flight, the way a paper logbook's
 * right-hand total-time column reads down the page, starting from the
 * pilot's carried-forward starting totals (if any).
 *
 * This is deliberately a single running-total column rather than
 * MyFlightbook's page-based `LogbookPrintedPage` model (per-page "totals
 * forward / this page / to date" subtotals): the browser's print engine
 * decides page breaks, not this app, so there's no reliable point in the
 * data to subtotal at. A running total sidesteps that entirely — whatever
 * page a row lands on, the number already printed on it is correct on its
 * own, with no page-boundary bookkeeping required.
 */

export type PrintRunningTotals = {
  totalTime: number;
  picTime: number;
  dualTime: number;
  crossCountryTime: number;
};

export type PrintTotalsFlight<T> = T & PrintRunningTotals;

export type PrintTotalsRow<T> = PrintTotalsFlight<T> & {
  /** Cumulative total as of (and including) this flight. */
  runningTotal: PrintRunningTotals;
};

function zeroRunningTotals(): PrintRunningTotals {
  return { totalTime: 0, picTime: 0, dualTime: 0, crossCountryTime: 0 };
}

/**
 * `flights` must already be ordered oldest first — the same order a paper
 * logbook is filled in, and the order `getFlightsForPrint` already sorts by.
 */
export function computePrintRunningTotals<T>(
  flights: ReadonlyArray<PrintTotalsFlight<T>>,
  startingTotals: PrintRunningTotals | null,
): Array<PrintTotalsRow<T>> {
  let running = startingTotals ?? zeroRunningTotals();

  return flights.map((flight) => {
    running = {
      totalTime: running.totalTime + flight.totalTime,
      picTime: running.picTime + flight.picTime,
      dualTime: running.dualTime + flight.dualTime,
      crossCountryTime: running.crossCountryTime + flight.crossCountryTime,
    };
    return { ...flight, runningTotal: running };
  });
}
