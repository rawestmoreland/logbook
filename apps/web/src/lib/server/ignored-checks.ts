import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

/**
 * A single ignored `(flightId, code)` pair — a pilot's "this isn't a
 * problem" verdict on a specific Check Flights warning, keyed the same way
 * `flight-checker.ts` warnings are: by flight id plus the warning's `code`.
 */
export type IgnoredCheck = {
  id: string
  flightId: string
  code: string
}

/**
 * Every ignored check belonging to the pilot's own flights — the `ignored_checks`
 * collection has no `pilot` field of its own, so scoping goes through the
 * `flight` relation, same as `deleteRule`/`createRule` on the collection.
 */
export const getIgnoredChecks = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<Array<IgnoredCheck>> => {
    const pb = createRequestPocketBase()
    const rows = await pb.collection('ignored_checks').getFullList({
      filter: pb.filter('flight.pilot = {:pilotId}', { pilotId: data.pilotId }),
    })

    return rows.map((r) => ({ id: r.id, flightId: r.flight, code: r.code }))
  })

export type IgnoreCheckInput = { flightId: string; code: string }

/**
 * Records that a warning shouldn't be surfaced again. Idempotent: the
 * collection's unique `(flight, code)` index is the actual guard against
 * duplicates, so a second call for the same pair just returns the row the
 * first call created rather than erroring.
 */
export const ignoreCheck = createServerFn({ method: 'POST' })
  .validator((data: IgnoreCheckInput): IgnoreCheckInput => data)
  .handler(async ({ data }): Promise<IgnoredCheck> => {
    const pb = createRequestPocketBase()
    try {
      const created = await pb
        .collection('ignored_checks')
        .create({ flight: data.flightId, code: data.code })
      return { id: created.id, flightId: data.flightId, code: data.code }
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 400) {
        const existing = await pb
          .collection('ignored_checks')
          .getFirstListItem(
            pb.filter('flight = {:flightId} && code = {:code}', {
              flightId: data.flightId,
              code: data.code,
            }),
          )
        return { id: existing.id, flightId: data.flightId, code: data.code }
      }
      throw err
    }
  })

/** Un-ignores a check: hard-deletes the row, so the warning can resurface on the next check run. */
export const unignoreCheck = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()
    await pb.collection('ignored_checks').delete(data.id)
    return { id: data.id }
  })
