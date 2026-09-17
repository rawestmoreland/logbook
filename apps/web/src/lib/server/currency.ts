import { createServerFn } from '@tanstack/react-start'

import {
  categoryOf,
  isAircraftInstanceType,
  isCategoryClass,
  isEasaMedicalClass,
  isMedicalClass,
  isMedicalPathway,
} from '@logbook/core'

import type {
  AircraftInstanceType,
  AircraftModelsResponse,
  AircraftResponse,
  Category,
  CategoryClass,
  EasaMedicalClass,
  Jurisdiction,
  MedicalClass,
  MedicalPathway,
} from '@logbook/core'

import { getLatestCheckrideDate, getLatestFlightReviewDate, getLatestIpcDate } from '#/lib/server/endorsements'
import { jurisdictionOf } from '#/lib/server/pilots'
import { createRequestPocketBase } from '#/lib/server/pocketbase'

import type { PilotWithExpand } from '#/lib/server/pilots'

/** Wire-friendly shape of `CurrencyFlight` — dates travel as strings across
 * the server function boundary; the Currency page parses them back with
 * `parseDateValue` before handing them to the currency rule functions. */
export type CurrencyFlightData = {
  id: string
  date: string
  categoryClass: CategoryClass
  tailwheel: boolean
  instanceType: AircraftInstanceType
  tailNumber: string
  routeFrom: string | null
  routeTo: string | null
  totalLandings: number
  dayLandingsFullStop: number
  nightLandingsFullStop: number
  approaches: number
  holding: boolean
  courseTracking: boolean
}

export type CurrencyMedicalData = {
  jurisdiction: Jurisdiction
  birthdate: string | null
  medicalIssued: string | null
  medicalClass: MedicalClass | null
  medicalPathway: MedicalPathway
  basicmedCourseCompleted: string | null
  basicmedExamCompleted: string | null
  easaMedicalClass: EasaMedicalClass | null
  easaMedicalIssued: string | null
}

export type CurrencyData = {
  flights: Array<CurrencyFlightData>
  lastFlightReviewDate: string | null
  /** Most recent `checkride` endorsement date, pilot-wide — 61.56(d)
   * exempts a flight review the same way `lastFlightReviewDate` does; see
   * `getLatestCheckrideDate`. */
  lastCheckrideDate: string | null
  /** Most recent `ipc` endorsement date per FAA category — see
   * `getLatestIpcDate` on why this is per-category rather than one date. */
  lastIpcDateByCategory: Partial<Record<Category, string>>
  medical: CurrencyMedicalData
}

/**
 * Everything the Currency page needs in one round trip: the pilot's flights
 * shaped for `currency/rules.ts` (expanding `aircraft` for `categoryClass`/
 * `tailwheel`/`instanceType`, since `getFlights`'s `FlightListItem` doesn't
 * carry any of them), the most recent flight-review endorsement date, the
 * most recent IPC endorsement date per category the pilot flies, and the
 * pilot's medical fields. A flight whose aircraft didn't expand to a
 * recognized category/class is dropped rather than guessed at — this module
 * fails safe, same as `currency/rules.ts` itself.
 */
export const getCurrencyData = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<CurrencyData> => {
    const pb = createRequestPocketBase()

    const [rawFlights, pilot, lastFlightReviewDate, lastCheckrideDate] = await Promise.all([
      pb.collection('flights').getFullList({
        filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
        expand: 'aircraft.model',
      }),
      pb.collection('pilots').getOne<PilotWithExpand>(data.pilotId, { expand: 'regulatory_profile' }),
      getLatestFlightReviewDate({ data: { pilotId: data.pilotId } }),
      getLatestCheckrideDate({ data: { pilotId: data.pilotId } }),
    ])

    const flights: Array<CurrencyFlightData> = []
    for (const f of rawFlights) {
      const aircraft = (
        f.expand as { aircraft?: AircraftResponse<{ model?: AircraftModelsResponse }> } | undefined
      )?.aircraft
      const model = aircraft?.expand.model
      if (!aircraft || !model || !isCategoryClass(model.category_class)) continue
      // Widen to `string` first: PocketBase's typegen marks every select field
      // non-optional, which hides that an unset one actually comes back as
      // `""` at runtime (see aircraft.ts's toListItem()). Unset defaults to
      // 'real', the same convention used there.
      const instanceType: string = aircraft.instance_type
      flights.push({
        id: f.id,
        date: f.date.slice(0, 10),
        categoryClass: model.category_class,
        tailwheel: model.tailwheel,
        instanceType: isAircraftInstanceType(instanceType) ? instanceType : 'real',
        tailNumber: aircraft.tail_number,
        routeFrom: f.route_from || null,
        routeTo: f.route_to || null,
        totalLandings: f.total_landings,
        dayLandingsFullStop: f.day_landings_full_stop,
        nightLandingsFullStop: f.night_landings_full_stop,
        approaches: f.approaches,
        holding: f.holding,
        courseTracking: f.course_tracking,
      })
    }

    const categories = [...new Set(flights.map((f) => categoryOf(f.categoryClass)))]
    const ipcDates = await Promise.all(
      categories.map((category) => getLatestIpcDate({ data: { pilotId: data.pilotId, category } })),
    )
    const lastIpcDateByCategory: Partial<Record<Category, string>> = {}
    categories.forEach((category, i) => {
      const date = ipcDates[i]
      if (date) lastIpcDateByCategory[category] = date
    })

    // See pilots.ts's toProfile() on why this widens to `string` first: an
    // unset select field types as always-present but comes back as `""`.
    const medicalClass: string = pilot.medical_class
    const medicalPathway: string = pilot.medical_pathway
    const easaMedicalClass: string = pilot.easa_medical_class

    return {
      flights,
      lastFlightReviewDate,
      lastCheckrideDate,
      lastIpcDateByCategory,
      medical: {
        jurisdiction: jurisdictionOf(pilot),
        birthdate: pilot.birthdate ? pilot.birthdate.slice(0, 10) : null,
        medicalIssued: pilot.medical_issued ? pilot.medical_issued.slice(0, 10) : null,
        medicalClass: isMedicalClass(medicalClass) ? medicalClass : null,
        // Empty/unset reads as the fail-safe default: the traditional
        // certificate ladder, same as before BasicMed existed.
        medicalPathway: isMedicalPathway(medicalPathway) ? medicalPathway : 'certificate',
        basicmedCourseCompleted: pilot.basicmed_course_completed
          ? pilot.basicmed_course_completed.slice(0, 10)
          : null,
        basicmedExamCompleted: pilot.basicmed_exam_completed
          ? pilot.basicmed_exam_completed.slice(0, 10)
          : null,
        easaMedicalClass: isEasaMedicalClass(easaMedicalClass) ? easaMedicalClass : null,
        easaMedicalIssued: pilot.easa_medical_issued ? pilot.easa_medical_issued.slice(0, 10) : null,
      },
    }
  })
