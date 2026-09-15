import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { anonymousTailNumberForModel, displayTailNumber, isAircraftInstanceType, isAnonymousTail } from '@logbook/core'

import type {
  AircraftModelsResponse,
  AircraftResponse,
  ManufacturersResponse,
  PilotAircraftResponse,
} from '@logbook/core'

import { describeModel } from '#/lib/server/models'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type AircraftListItem = {
  id: string
  pilotAircraftId: string
  tailNumber: string
  displayTailNumber: string
  isAnonymous: boolean
  modelId: string
  manufacturerName: string
  model: string
  type: string
  categoryClass: string
  complex: boolean
  highPerformance: boolean
  tailwheel: boolean
  instanceType: string
}

type ModelWithManufacturer = AircraftModelsResponse<{ manufacturer: ManufacturersResponse }>
type AircraftWithModel = AircraftResponse<{ model: ModelWithManufacturer }>
type PilotAircraftWithAircraft = PilotAircraftResponse<{ aircraft: AircraftWithModel }>

function toListItem(pa: PilotAircraftWithAircraft): AircraftListItem {
  const aircraft = pa.expand.aircraft
  const model = aircraft.expand.model
  const manufacturer = model.expand.manufacturer
  const type = describeModel(manufacturer.name, model.model, model.common_name)
  // Widen to `string` first: PocketBase's typegen marks every select field
  // non-optional via `Required<>`, which hides that an unset one actually
  // comes back as `""` at runtime (see pilots.ts's toProfile()).
  const instanceType: string = aircraft.instance_type
  return {
    id: aircraft.id,
    pilotAircraftId: pa.id,
    tailNumber: aircraft.tail_number,
    displayTailNumber: displayTailNumber(aircraft.tail_number, type),
    isAnonymous: isAnonymousTail(aircraft.tail_number),
    modelId: model.id,
    manufacturerName: manufacturer.name,
    model: model.model,
    type,
    categoryClass: model.category_class,
    complex: model.complex,
    highPerformance: model.high_performance,
    tailwheel: model.tailwheel,
    instanceType: instanceType || 'real',
  }
}

/**
 * The pilot's fleet: `pilot_aircraft` join rows (not a filter on the now-
 * shared `aircraft` collection — see CLAUDE.md) expanded out to the
 * aircraft/model/manufacturer each row points at.
 */
export const getAircraft = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<Array<AircraftListItem>> => {
    const pb = createRequestPocketBase()
    const joins = await pb.collection('pilot_aircraft').getFullList<PilotAircraftWithAircraft>({
      filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
      expand: 'aircraft.model.manufacturer',
    })
    return joins.map(toListItem)
  })

async function findOrCreateAircraftByTail(
  pb: ReturnType<typeof createRequestPocketBase>,
  fields: { tailNumber: string; modelId: string; instanceType: string },
): Promise<AircraftWithModel> {
  try {
    return await pb.collection('aircraft').create<AircraftWithModel>(
      {
        tail_number: fields.tailNumber,
        model: fields.modelId,
        instance_type: fields.instanceType,
      },
      { expand: 'model.manufacturer' },
    )
  } catch (err) {
    if (!(err instanceof ClientResponseError) || err.status !== 400) throw err
  }

  // Another pilot already registered this tail — `tail_number` is
  // unique-indexed, so the row the create attempt collided with is the one
  // every pilot logging this tail shares.
  return await pb.collection('aircraft').getFirstListItem<AircraftWithModel>(
    pb.filter('tail_number = {:tailNumber}', { tailNumber: fields.tailNumber }),
    { expand: 'model.manufacturer' },
  )
}

/**
 * Exported for reuse by the CSV importer (`import.ts`), which needs to add
 * an already-resolved aircraft to the pilot's fleet without going through
 * `createAircraft`'s model-resolution path.
 */
export async function findOrCreatePilotAircraft(
  pb: ReturnType<typeof createRequestPocketBase>,
  pilotId: string,
  aircraftId: string,
): Promise<PilotAircraftResponse> {
  try {
    return await pb.collection('pilot_aircraft').create<PilotAircraftResponse>({
      pilot: pilotId,
      aircraft: aircraftId,
    })
  } catch (err) {
    if (!(err instanceof ClientResponseError) || err.status !== 400) throw err
  }

  // Already in the fleet — possibly soft-deleted (removed, then re-added).
  const existing = await pb
    .collection('pilot_aircraft')
    .getFirstListItem<PilotAircraftResponse>(
      pb.filter('pilot = {:pilotId} && aircraft = {:aircraftId}', { pilotId, aircraftId }),
    )
  if (!existing.deleted) return existing
  return await pb
    .collection('pilot_aircraft')
    .update<PilotAircraftResponse>(existing.id, { deleted: false })
}

export type CreateAircraftInput = {
  pilotId: string
  modelId: string
  instanceType: string
  isAnonymous: boolean
  tailNumber?: string
}

/**
 * Find-or-create the shared `aircraft` row by tail number, then add it to
 * the pilot's fleet — never a blind create, since two pilots logging the
 * same tail must end up pointing at the same row (mirrors MyFlightbook).
 * An anonymous aircraft (no tail number) uses a tail synthesized from the
 * model id, so every pilot logging "an anonymous" of that model shares the
 * same row too.
 */
export const createAircraft = createServerFn({ method: 'POST' })
  .validator((data: CreateAircraftInput) => data)
  .handler(async ({ data }): Promise<AircraftListItem> => {
    const pb = createRequestPocketBase()
    if (!isAircraftInstanceType(data.instanceType)) throw new Error('Select an instance type')

    const tailNumber = data.isAnonymous
      ? anonymousTailNumberForModel(data.modelId)
      : data.tailNumber?.trim().toUpperCase()
    if (!tailNumber) throw new Error('Tail number is required')

    const aircraft = await findOrCreateAircraftByTail(pb, {
      tailNumber,
      modelId: data.modelId,
      instanceType: data.instanceType,
    })
    const pilotAircraft = await findOrCreatePilotAircraft(pb, data.pilotId, aircraft.id)

    return toListItem({ ...pilotAircraft, expand: { aircraft } })
  })

/**
 * Removes the aircraft from the pilot's fleet by soft-deleting their
 * `pilot_aircraft` row — never the shared `aircraft`/`aircraft_models` rows,
 * since other pilots may still reference them. `pilot_aircraft`'s own rules
 * (`pilot.user = @request.auth.id`) are the actual authority on ownership,
 * same as `deleteFlight`'s note about `updateRule`.
 */
export const removeAircraftFromFleet = createServerFn({ method: 'POST' })
  .validator((data: { pilotAircraftId: string }) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()
    await pb.collection('pilot_aircraft').update(data.pilotAircraftId, { deleted: true })
    return { id: data.pilotAircraftId }
  })
