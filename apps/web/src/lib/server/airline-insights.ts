import { createServerFn } from '@tanstack/react-start'

import { dutyPeriodHours, isEngineType, isTurbineEngine, parseDateValue, restHours } from '@logbook/core'

import type { AircraftModelsResponse, AircraftResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type LastDuty = {
  date: string
  reportTime: string
  releaseTime: string
  hours: number
}

export type AirlineInsights = {
  /** PIC time flown in turboprop/jet/turbine_other aircraft — see `isTurbineEngine`. */
  turbinePicTime: number
  /** The most recent flight carrying both a report and release time. */
  lastDuty: LastDuty | null
  /** Rest between the duty period before `lastDuty` and `lastDuty` itself —
   * null when there's no earlier duty period on record to measure from. */
  restBeforeLastDuty: number | null
}

/**
 * Turbine PIC time and a simple duty/rest snapshot for the airline-profile
 * home screen. See `duty.ts`'s module comment — this is elapsed-time
 * bookkeeping from whatever report/release times a pilot chose to log, not a
 * Part 117 legality computation.
 */
export const getAirlineInsights = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<AirlineInsights> => {
    const pb = createRequestPocketBase()
    const flights = await pb.collection('flights').getFullList({
      filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
      sort: '-date',
      expand: 'aircraft.model',
    })

    let turbinePicTime = 0
    const duties: Array<{ date: string; reportTime: string; releaseTime: string }> = []

    for (const f of flights) {
      const aircraft = (
        f.expand as { aircraft?: AircraftResponse<{ model?: AircraftModelsResponse }> } | undefined
      )?.aircraft
      const engineType: string | undefined = aircraft?.expand.model?.engine_type
      if (engineType && isEngineType(engineType) && isTurbineEngine(engineType)) {
        turbinePicTime += f.pic_time
      }
      if (f.report_time && f.release_time) {
        duties.push({ date: f.date.slice(0, 10), reportTime: f.report_time, releaseTime: f.release_time })
      }
    }

    // `flights` is sorted newest-first, so `duties` preserves that order.
    const [last, previous] = duties
    const lastDuty: LastDuty | null = last
      ? { ...last, hours: dutyPeriodHours(parseDateValue(last.date), last.reportTime, last.releaseTime) }
      : null
    const restBeforeLastDuty =
      last && previous
        ? restHours(parseDateValue(previous.date), previous.releaseTime, parseDateValue(last.date), last.reportTime)
        : null

    return { turbinePicTime, lastDuty, restBeforeLastDuty }
  })
