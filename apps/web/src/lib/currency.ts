import { parseDateValue } from '@logbook/core'

import type { CurrencyFlight } from '@logbook/core'
import type { CurrencyFlightData } from '#/lib/server/currency'

/** Wire-friendly `CurrencyFlightData` (dates as strings) back to the `Date`-bearing
 * shape `currency/rules.ts`'s rule functions take. Shared by the `/currency` page
 * and the home screen's recreational-profile currency snapshot. */
export function toCurrencyFlight(f: CurrencyFlightData): CurrencyFlight {
  return {
    id: f.id,
    date: parseDateValue(f.date),
    categoryClass: f.categoryClass,
    tailwheel: f.tailwheel,
    instanceType: f.instanceType,
    dayLandings: f.dayLandings,
    dayLandingsFullStop: f.dayLandingsFullStop,
    nightLandings: f.nightLandings,
    approaches: f.approaches,
    holding: f.holding,
    courseTracking: f.courseTracking,
  }
}
