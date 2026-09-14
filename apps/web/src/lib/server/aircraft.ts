import { createServerFn } from '@tanstack/react-start'

import { isCategoryClass } from '@logbook/core'

import type { AircraftResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type AircraftListItem = {
  id: string
  tailNumber: string
  type: string
  categoryClass: string
  complex: boolean
  highPerformance: boolean
  tailwheel: boolean
}

function toListItem(a: AircraftResponse): AircraftListItem {
  return {
    id: a.id,
    tailNumber: a.tail_number,
    type: a.type,
    categoryClass: a.category_class,
    complex: a.complex,
    highPerformance: a.high_performance,
    tailwheel: a.tailwheel,
  }
}

/**
 * The current user's aircraft. `aircraft.user` is a required relation
 * scoped by the collection's own rules (`user = @request.auth.id`), so no
 * filter is needed beyond auth — but `deleted` is still excluded here to
 * match the soft-delete convention every collection follows.
 */
export const getAircraft = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<AircraftListItem>> => {
    const pb = createRequestPocketBase()
    const aircraft = await pb.collection('aircraft').getFullList({
      filter: 'deleted != true',
      sort: 'tail_number',
    })
    return aircraft.map(toListItem)
  },
)

export type AircraftInput = {
  tailNumber: string
  type: string
  categoryClass: string
  complex?: boolean
  highPerformance?: boolean
  tailwheel?: boolean
}

function validateAircraftInput(data: AircraftInput) {
  const tailNumber = data.tailNumber.trim().toUpperCase()
  const type = data.type.trim()
  if (!tailNumber) throw new Error('Tail number is required')
  if (!type) throw new Error('Type is required')
  if (!isCategoryClass(data.categoryClass)) {
    throw new Error('Select a category/class')
  }

  return {
    tailNumber,
    type,
    categoryClass: data.categoryClass,
    complex: data.complex ?? false,
    highPerformance: data.highPerformance ?? false,
    tailwheel: data.tailwheel ?? false,
  }
}

export const createAircraft = createServerFn({ method: 'POST' })
  .validator((data: AircraftInput) => data)
  .handler(async ({ data }): Promise<AircraftListItem> => {
    const pb = createRequestPocketBase()
    const userId = pb.authStore.record?.id
    if (!userId) throw new Error('Not signed in')

    const validated = validateAircraftInput(data)
    const created = await pb.collection('aircraft').create({
      user: userId,
      tail_number: validated.tailNumber,
      type: validated.type,
      category_class: validated.categoryClass,
      complex: validated.complex,
      high_performance: validated.highPerformance,
      tailwheel: validated.tailwheel,
    })
    return toListItem(created)
  })

export type UpdateAircraftInput = AircraftInput & { id: string }

/**
 * Same validation as `createAircraft`. `updateRule`
 * (`user = @request.auth.id`) is the actual authority on ownership — this
 * doesn't re-check it, same as `createFlight`'s note about `createRule`.
 */
export const updateAircraft = createServerFn({ method: 'POST' })
  .validator((data: UpdateAircraftInput) => data)
  .handler(async ({ data }): Promise<AircraftListItem> => {
    const pb = createRequestPocketBase()
    const validated = validateAircraftInput(data)
    const updated = await pb.collection('aircraft').update(data.id, {
      tail_number: validated.tailNumber,
      type: validated.type,
      category_class: validated.categoryClass,
      complex: validated.complex,
      high_performance: validated.highPerformance,
      tailwheel: validated.tailwheel,
    })
    return toListItem(updated)
  })

/**
 * Soft delete: sets `deleted: true` rather than calling PocketBase's hard
 * delete, per the sync convention every collection follows (see
 * CLAUDE.md). Flights already logged against this aircraft keep their
 * expanded `aircraft` relation and display type/tail number unaffected —
 * `getFlights` only filters flights on their own `deleted` field.
 */
export const deleteAircraft = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()
    await pb.collection('aircraft').update(data.id, { deleted: true })
    return { id: data.id }
  })
