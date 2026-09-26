import type { CurrencyData, CurrencyResultData } from '#/lib/server/currency'

/**
 * The single nearest upcoming currency deadline across every rule the
 * server computed — passenger-carrying, instrument, flight review, and
 * medical. Shared by the Currency page's "Next deadline" chip and the
 * sidebar's at-a-glance status, so the two never disagree on which rule is
 * closest to lapsing.
 */
export function nextCurrencyDeadline(data: CurrencyData): CurrencyResultData | undefined {
  const allResults: Array<CurrencyResultData> = [
    ...data.passenger.flatMap((p) => p.results),
    ...data.instrument.map((i) => i.result),
    data.review,
    ...(data.medical ? [data.medical] : []),
  ]

  return allResults
    .filter((r) => r.daysRemaining !== null && r.expiresOn !== null)
    .sort((a, b) => (a.daysRemaining as number) - (b.daysRemaining as number))
    .at(0)
}

/** Colorblind-validated status dot color, keyed by a currency result's state — see styles.css. */
export const CURRENCY_STATE_DOT_CLASS: Record<CurrencyResultData['state'], string> = {
  current: 'bg-status-good',
  expiring: 'bg-status-warn',
  expired: 'bg-status-bad',
}
