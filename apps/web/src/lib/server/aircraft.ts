import { createServerFn } from '@tanstack/react-start'

import { isCategoryClass } from '@logbook/core'

import type { AircraftResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type AircraftListItem = {
  id: string
  tailNumber: string
  type: string
  categoryClass: string
}

function toListItem(a: AircraftResponse): AircraftListItem {
  return {
    id: a.id,
    tailNumber: a.tail_number,
    type: a.type,
    categoryClass: a.category_class,
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

export type CreateAircraftInput = {
  tailNumber: string
  type: string
  categoryClass: string
}

export const createAircraft = createServerFn({ method: 'POST' })
  .validator((data: CreateAircraftInput) => data)
  .handler(async ({ data }): Promise<AircraftListItem> => {
    const pb = createRequestPocketBase()
    const userId = pb.authStore.record?.id
    if (!userId) throw new Error('Not signed in')

    const tailNumber = data.tailNumber.trim().toUpperCase()
    const type = data.type.trim()
    if (!tailNumber) throw new Error('Tail number is required')
    if (!type) throw new Error('Type is required')
    if (!isCategoryClass(data.categoryClass)) {
      throw new Error('Select a category/class')
    }

    const created = await pb.collection('aircraft').create({
      user: userId,
      tail_number: tailNumber,
      type,
      category_class: data.categoryClass,
    })
    return toListItem(created)
  })
