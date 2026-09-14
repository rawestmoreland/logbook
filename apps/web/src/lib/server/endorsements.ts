import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { parseDateValue } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type FlightReviewEndorsement = { id: string; date: string }

/**
 * Whether the given flight already carries a `flight_review` endorsement —
 * used by the edit-flight form to show "already logged" instead of letting
 * a pilot log the same review twice.
 */
export const getFlightReviewForFlight = createServerFn({ method: 'GET' })
  .validator((data: { flightId: string }) => data)
  .handler(async ({ data }): Promise<FlightReviewEndorsement | null> => {
    const pb = createRequestPocketBase()
    try {
      const existing = await pb
        .collection('endorsements')
        .getFirstListItem(
          pb.filter('flight = {:flightId} && type = "flight_review" && deleted != true', {
            flightId: data.flightId,
          }),
        )
      return { id: existing.id, date: existing.date.slice(0, 10) }
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) return null
      throw err
    }
  })

/**
 * Self-logs a 61.56 flight review against one of the pilot's own flights.
 * `instructor` is left blank — see CLAUDE.md/the currency-dashboard brief on
 * why CFI account-linking is out of scope here. PocketBase's own
 * `createRule` (`flight.pilot.user = @request.auth.id`) is the actual
 * authority on ownership, same as `createFlight`.
 */
export const createFlightReviewEndorsement = createServerFn({ method: 'POST' })
  .validator((data: { flightId: string; date: string }) => data)
  .handler(async ({ data }): Promise<FlightReviewEndorsement> => {
    const pb = createRequestPocketBase()
    const created = await pb.collection('endorsements').create({
      flight: data.flightId,
      type: 'flight_review',
      date: parseDateValue(data.date).toISOString(),
    })
    return { id: created.id, date: data.date }
  })

/**
 * Most recent flight-review endorsement for any of the pilot's flights — the
 * two-hop relation filter `flight.pilot = ...` mirrors the pattern
 * `flights`' own rules already use for `pilot.user = @request.auth.id`,
 * chained one hop further. Feeds `flightReviewCurrency()`'s `lastReview`.
 */
export const getLatestFlightReviewDate = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const pb = createRequestPocketBase()
    try {
      const latest = await pb.collection('endorsements').getFirstListItem(
        pb.filter('flight.pilot = {:pilotId} && type = "flight_review" && deleted != true', {
          pilotId: data.pilotId,
        }),
        { sort: '-date' },
      )
      return latest.date.slice(0, 10)
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) return null
      throw err
    }
  })
