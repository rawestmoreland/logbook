import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { categoryOf, isCategoryClass, parseDateValue } from '@logbook/core'

import type { AircraftModelsResponse, AircraftResponse, Category, EndorsementsResponse, EndorsementType } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type Endorsement = { id: string; date: string }

// Back-compat aliases — same shape, kept so callers that name a specific
// endorsement type read naturally (e.g. `FlightReviewEndorsement` in a
// `useState<FlightReviewEndorsement | null>`) without every type-specific
// use site having to import the generic `Endorsement` name instead.
export type FlightReviewEndorsement = Endorsement
export type IpcEndorsement = Endorsement
export type CheckrideEndorsement = Endorsement

/**
 * Whether the given flight already carries an endorsement of `type` — used
 * by the edit-flight form to show "already logged" instead of letting a
 * pilot log the same endorsement twice. One parameterized function instead
 * of a `getXForFlight` per type: the query is identical across all six
 * `EndorsementType`s bar the literal they filter on, so a per-type wrapper
 * would just be this same body copy-pasted six times. The tradeoff is call
 * sites now pass `type` explicitly instead of it being implied by the
 * function name.
 */
export const getEndorsementForFlight = createServerFn({ method: 'GET' })
  .validator((data: { flightId: string; type: EndorsementType }) => data)
  .handler(async ({ data }): Promise<Endorsement | null> => {
    const pb = createRequestPocketBase()
    try {
      const existing = await pb
        .collection('endorsements')
        .getFirstListItem(
          pb.filter('flight = {:flightId} && type = {:type} && deleted != true', {
            flightId: data.flightId,
            type: data.type,
          }),
        )
      return { id: existing.id, date: existing.date.slice(0, 10) }
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) return null
      throw err
    }
  })

/**
 * Self-logs an endorsement of `type` against one of the pilot's own flights.
 * `instructor` is left blank for every type — see CLAUDE.md/the currency
 * dashboard brief on why CFI account-linking is out of scope here.
 * PocketBase's own `createRule` (`flight.pilot.user = @request.auth.id`) is
 * the actual authority on ownership, same as `createFlight`.
 */
export const createEndorsement = createServerFn({ method: 'POST' })
  .validator((data: { flightId: string; type: EndorsementType; date: string }) => data)
  .handler(async ({ data }): Promise<Endorsement> => {
    const pb = createRequestPocketBase()
    const created = await pb.collection('endorsements').create({
      flight: data.flightId,
      type: data.type,
      date: parseDateValue(data.date).toISOString(),
    })
    return { id: created.id, date: data.date }
  })

/**
 * Most recent endorsement of `type` for any of the pilot's flights,
 * pilot-wide — the two-hop relation filter `flight.pilot = ...` mirrors the
 * pattern `flights`' own rules already use for `pilot.user =
 * @request.auth.id`, chained one hop further. Correct for `flight_review`,
 * `checkride`, `complex`, `high_performance`, and `tailwheel` — all
 * pilot-wide, not scoped to a category the way `ipc` is. Feeds
 * `flightReviewCurrency()`'s `lastReview`/`lastCheckride`. NOT correct for
 * `ipc`; see `getLatestIpcDate` below for why that one stays separate.
 */
export const getLatestEndorsementDate = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string; type: EndorsementType }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const pb = createRequestPocketBase()
    try {
      const latest = await pb.collection('endorsements').getFirstListItem(
        pb.filter('flight.pilot = {:pilotId} && type = {:type} && deleted != true', {
          pilotId: data.pilotId,
          type: data.type,
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
 * Earliest endorsement of `type` for any of the pilot's flights, pilot-wide.
 * Only meaningful for endorsement types that, once earned, satisfy 14 CFR
 * 61.31 forever — `complex`, `high_performance`, `tailwheel` — where the
 * relevant question for a given flight is "had the pilot been endorsed by
 * this date yet", not "when was the most recent one" (unlike a flight review
 * or IPC, these never expire and never need renewing, so only the *first*
 * one matters). Same relation filter as `getLatestEndorsementDate`, sorted
 * ascending instead of descending.
 */
export const getEarliestEndorsementDate = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string; type: EndorsementType }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const pb = createRequestPocketBase()
    try {
      const earliest = await pb.collection('endorsements').getFirstListItem(
        pb.filter('flight.pilot = {:pilotId} && type = {:type} && deleted != true', {
          pilotId: data.pilotId,
          type: data.type,
        }),
        { sort: 'date' },
      )
      return earliest.date.slice(0, 10)
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) return null
      throw err
    }
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
