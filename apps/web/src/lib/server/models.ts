import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { isCategoryClass } from '@logbook/core'

import type { AircraftModelsResponse, ManufacturersResponse } from '@logbook/core'

import { findOrCreateManufacturer } from '#/lib/server/manufacturers'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type AircraftModelItem = {
  id: string
  manufacturerId: string
  manufacturerName: string
  model: string
  commonName: string
  categoryClass: string
  complex: boolean
  highPerformance: boolean
  tailwheel: boolean
  description: string
}

type ModelWithManufacturer = AircraftModelsResponse<{ manufacturer: ManufacturersResponse }>

/** Shared with aircraft.ts/flights.ts/currency.ts for the aircraft's display type. */
export function describeModel(manufacturerName: string, model: string, commonName: string): string {
  return commonName || `${manufacturerName} ${model}`
}

function toItem(m: ModelWithManufacturer): AircraftModelItem {
  const manufacturerName = m.expand.manufacturer.name
  return {
    id: m.id,
    manufacturerId: m.manufacturer,
    manufacturerName,
    model: m.model,
    commonName: m.common_name,
    categoryClass: m.category_class,
    complex: m.complex,
    highPerformance: m.high_performance,
    tailwheel: m.tailwheel,
    description: describeModel(manufacturerName, m.model, m.common_name),
  }
}

/**
 * Model search for the aircraft-form's autocomplete, matched across
 * manufacturer name, model code, and common name — `aircraft_models` is a
 * shared, ever-growing catalog covering both real aircraft and training
 * devices (a Redbird AATD is just another model made by "Redbird"), so
 * there's no separate table to search for sims.
 */
export const searchModels = createServerFn({ method: 'GET' })
  .validator((data: { query: string }) => data)
  .handler(async ({ data }): Promise<Array<AircraftModelItem>> => {
    const pb = createRequestPocketBase()
    const query = data.query.trim()
    if (!query) return []

    const models = await pb.collection('aircraft_models').getList<ModelWithManufacturer>(1, 15, {
      filter: pb.filter(
        'model ~ {:query} || common_name ~ {:query} || manufacturer.name ~ {:query}',
        { query },
      ),
      expand: 'manufacturer',
      sort: 'model',
    })
    return models.items.map(toItem)
  })

export type FindOrCreateModelInput = {
  manufacturerName: string
  model: string
  commonName?: string
  categoryClass: string
  complex?: boolean
  highPerformance?: boolean
  tailwheel?: boolean
}

/**
 * Find-or-create a model under a find-or-created manufacturer, so typing a
 * manufacturer/model combination that doesn't exist yet grows the shared
 * catalog instead of failing. `(manufacturer, model)` has a case-insensitive
 * unique index — same conflict-recovery shape as
 * `findOrCreateManufacturer`.
 */
export const findOrCreateModel = createServerFn({ method: 'POST' })
  .validator((data: FindOrCreateModelInput) => data)
  .handler(async ({ data }): Promise<AircraftModelItem> => {
    const pb = createRequestPocketBase()

    const manufacturerName = data.manufacturerName.trim()
    const model = data.model.trim()
    if (!manufacturerName) throw new Error('Manufacturer is required')
    if (!model) throw new Error('Model is required')
    if (!isCategoryClass(data.categoryClass)) throw new Error('Select a category/class')

    const manufacturer = await findOrCreateManufacturer(pb, manufacturerName)

    const fields = {
      manufacturer: manufacturer.id,
      model,
      common_name: data.commonName?.trim() ?? '',
      category_class: data.categoryClass,
      complex: data.complex ?? false,
      high_performance: data.highPerformance ?? false,
      tailwheel: data.tailwheel ?? false,
    }

    try {
      const created = await pb
        .collection('aircraft_models')
        .create<AircraftModelsResponse>(fields)
      return toItem({ ...created, expand: { manufacturer } })
    } catch (err) {
      if (!(err instanceof ClientResponseError) || err.status !== 400) throw err
    }

    const candidates = await pb.collection('aircraft_models').getFullList<AircraftModelsResponse>({
      filter: pb.filter('manufacturer = {:manufacturerId} && model ~ {:model}', {
        manufacturerId: manufacturer.id,
        model,
      }),
    })
    const existing = candidates.find((m) => m.model.toLowerCase() === model.toLowerCase())
    if (!existing) throw new Error(`Could not find or create model "${model}"`)
    return toItem({ ...existing, expand: { manufacturer } })
  })
