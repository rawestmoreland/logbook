import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { categoryOf, isCategoryClass, parseDateValue } from '@logbook/core'

import type { AircraftModelsResponse, AircraftResponse, Category, EndorsementsResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type FlightReviewEndorsement = { id: string; date: string }
export type IpcEndorsement = { id: string; date: string }

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

/**
 * Whether the given flight already carries an `ipc` endorsement — same
 * "already logged" guard as `getFlightReviewForFlight`, for the same reason.
 */
export const getIpcForFlight = createServerFn({ method: 'GET' })
  .validator((data: { flightId: string }) => data)
  .handler(async ({ data }): Promise<IpcEndorsement | null> => {
    const pb = createRequestPocketBase()
    try {
      const existing = await pb
        .collection('endorsements')
        .getFirstListItem(
          pb.filter('flight = {:flightId} && type = "ipc" && deleted != true', {
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
 * Self-logs a 61.57(d) instrument proficiency check against one of the
 * pilot's own flights. Same instructor-left-blank rationale as
 * `createFlightReviewEndorsement`.
 */
export const createIpcEndorsement = createServerFn({ method: 'POST' })
  .validator((data: { flightId: string; date: string }) => data)
  .handler(async ({ data }): Promise<IpcEndorsement> => {
    const pb = createRequestPocketBase()
    const created = await pb.collection('endorsements').create({
      flight: data.flightId,
      type: 'ipc',
      date: parseDateValue(data.date).toISOString(),
    })
    return { id: created.id, date: data.date }
  })

/**
 * Most recent `ipc` endorsement for the pilot, scoped to one FAA *category*
 * (airplane, rotorcraft, ...) — not the whole pilot like flight review.
 *
 * A flight review is a pilot-wide privilege, but an IPC (like the
 * approaches/holding/tracking it substitutes for in `instrumentCurrency`) is
 * flown in a specific aircraft, and 61.57(c)/(d) currency itself is scoped
 * per category, not per pilot. There's no PocketBase field to filter on
 * directly — `category` is a derived grouping of `aircraft_models.category_class`
 * (see `categoryOf` in `@logbook/core`) — so this fetches the pilot's `ipc`
 * endorsements newest-first with the flight's aircraft/model expanded, same
 * shape as `getCurrencyData`'s flight fetch, and returns the first one whose
 * resolved category matches.
 */
export const getLatestIpcDate = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string; category: Category }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const pb = createRequestPocketBase()
    const endorsements = await pb.collection('endorsements').getFullList<EndorsementsResponse>({
      filter: pb.filter('flight.pilot = {:pilotId} && type = "ipc" && deleted != true', {
        pilotId: data.pilotId,
      }),
      sort: '-date',
      expand: 'flight.aircraft.model',
    })

    for (const endorsement of endorsements) {
      const flight = (
        endorsement.expand as
          | { flight?: { expand?: { aircraft?: AircraftResponse<{ model?: AircraftModelsResponse }> } } }
          | undefined
      )?.flight
      const model = flight?.expand?.aircraft?.expand.model
      if (!model || !isCategoryClass(model.category_class)) continue
      if (categoryOf(model.category_class) !== data.category) continue
      return endorsement.date.slice(0, 10)
    }
    return null
  })
