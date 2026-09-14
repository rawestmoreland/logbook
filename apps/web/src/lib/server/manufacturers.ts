import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import type { ManufacturersResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type ManufacturerItem = { id: string; name: string }

function toItem(m: ManufacturersResponse): ManufacturerItem {
  return { id: m.id, name: m.name }
}

/**
 * Manufacturer search for the aircraft-form's autocomplete. `manufacturers`
 * is a small, shared, ever-growing catalog — any authenticated pilot can
 * list/search it per the collection's `listRule`.
 */
export const searchManufacturers = createServerFn({ method: 'GET' })
  .validator((data: { query: string }) => data)
  .handler(async ({ data }): Promise<Array<ManufacturerItem>> => {
    const pb = createRequestPocketBase()
    const query = data.query.trim()
    if (!query) return []

    const manufacturers = await pb.collection('manufacturers').getList<ManufacturersResponse>(1, 10, {
      filter: pb.filter('name ~ {:query}', { query }),
      sort: 'name',
    })
    return manufacturers.items.map(toItem)
  })

/**
 * Find-or-create a manufacturer by name. `manufacturers.name` has a
 * case-insensitive unique index, so a race between two pilots both typing
 * "Cessna" resolves to one row: the create attempt itself is the source of
 * truth (mirrors `findOrCreatePilotRecord` in pilots.ts, but recovering from
 * a unique-constraint conflict rather than a missing record, since there's
 * no single exact filter that's guaranteed case-insensitive at the SQL
 * level the way the stored index is).
 */
export async function findOrCreateManufacturer(
  pb: ReturnType<typeof createRequestPocketBase>,
  name: string,
): Promise<ManufacturersResponse> {
  try {
    return await pb.collection('manufacturers').create<ManufacturersResponse>({ name })
  } catch (err) {
    if (!(err instanceof ClientResponseError) || err.status !== 400) throw err
  }

  const candidates = await pb.collection('manufacturers').getFullList<ManufacturersResponse>({
    filter: pb.filter('name ~ {:name}', { name }),
  })
  const existing = candidates.find((m) => m.name.toLowerCase() === name.toLowerCase())
  if (!existing) throw new Error(`Could not find or create manufacturer "${name}"`)
  return existing
}
