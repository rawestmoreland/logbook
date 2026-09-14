import { createServerFn } from '@tanstack/react-start'

import { isCategoryClass, isMedicalClass } from '@logbook/core'

import type { AircraftResponse, CategoryClass, MedicalClass, PilotsResponse } from '@logbook/core'

import { getLatestFlightReviewDate } from '#/lib/server/endorsements'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

/** Wire-friendly shape of `CurrencyFlight` — dates travel as strings across
 * the server function boundary; the Currency page parses them back with
 * `parseDateValue` before handing them to the currency rule functions. */
export type CurrencyFlightData = {
  id: string
  date: string
  categoryClass: CategoryClass
  tailwheel: boolean
  dayLandings: number
  dayLandingsFullStop: number
  nightLandings: number
  approaches: number
  holding: boolean
  courseTracking: boolean
}

export type CurrencyMedicalData = {
  birthdate: string | null
  medicalIssued: string | null
  medicalClass: MedicalClass | null
}

export type CurrencyData = {
  flights: Array<CurrencyFlightData>
  lastFlightReviewDate: string | null
  medical: CurrencyMedicalData
}

/**
 * Everything the Currency page needs in one round trip: the pilot's flights
 * shaped for `currency/rules.ts` (expanding `aircraft` for `categoryClass`/
 * `tailwheel`, since `getFlights`'s `FlightListItem` doesn't carry either),
 * the most recent flight-review endorsement date, and the pilot's medical
 * fields. A flight whose aircraft didn't expand to a recognized
 * category/class is dropped rather than guessed at — this module fails safe,
 * same as `currency/rules.ts` itself.
 */
export const getCurrencyData = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<CurrencyData> => {
    const pb = createRequestPocketBase()

    const [rawFlights, pilot, lastFlightReviewDate] = await Promise.all([
      pb.collection('flights').getFullList({
        filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
        expand: 'aircraft',
      }),
      pb.collection('pilots').getOne<PilotsResponse>(data.pilotId),
      getLatestFlightReviewDate({ data: { pilotId: data.pilotId } }),
    ])

    const flights: Array<CurrencyFlightData> = []
    for (const f of rawFlights) {
      const aircraft = (f.expand as { aircraft?: AircraftResponse } | undefined)?.aircraft
      if (!aircraft || !isCategoryClass(aircraft.category_class)) continue
      flights.push({
        id: f.id,
        date: f.date.slice(0, 10),
        categoryClass: aircraft.category_class,
        tailwheel: aircraft.tailwheel,
        dayLandings: f.day_landings,
        dayLandingsFullStop: f.day_landings_full_stop,
        nightLandings: f.night_landings,
        approaches: f.approaches,
        holding: f.holding,
        courseTracking: f.course_tracking,
      })
    }

    // See pilots.ts's toProfile() on why this widens to `string` first: an
    // unset select field types as always-present but comes back as `""`.
    const medicalClass: string = pilot.medical_class

    return {
      flights,
      lastFlightReviewDate,
      medical: {
        birthdate: pilot.birthdate ? pilot.birthdate.slice(0, 10) : null,
        medicalIssued: pilot.medical_issued ? pilot.medical_issued.slice(0, 10) : null,
        medicalClass: isMedicalClass(medicalClass) ? medicalClass : null,
      },
    }
  })
