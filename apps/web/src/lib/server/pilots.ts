import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { isMedicalClass, isMedicalPathway, parseDateValue } from '@logbook/core'

import type { MedicalClass, MedicalPathway, PilotsResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type Pilot = { id: string; name: string }

/**
 * `birthdate`/`medicalIssued`/`medicalClass` feed `medicalCurrency()`, and
 * `basicmedCourseCompleted`/`basicmedExamCompleted` feed `basicMedCurrency()`,
 * on the Currency page. `medicalPathway` picks which of the two applies —
 * they're mutually exclusive. `null` (not omitted) distinguishes "not
 * entered yet" from a field the caller forgot to ask for.
 */
export type PilotProfile = {
  id: string
  name: string
  birthdate: string | null
  medicalIssued: string | null
  medicalClass: MedicalClass | null
  medicalPathway: MedicalPathway
  basicmedCourseCompleted: string | null
  basicmedExamCompleted: string | null
}

function toProfile(p: PilotsResponse): PilotProfile {
  // PocketBase's typegen marks every field non-optional via `Required<>`,
  // which hides that an unset select field actually comes back as `""` at
  // runtime — widen to `string` first so that's a real possibility to guard.
  const medicalClass: string = p.medical_class
  const medicalPathway: string = p.medical_pathway
  return {
    id: p.id,
    name: p.name,
    birthdate: p.birthdate ? p.birthdate.slice(0, 10) : null,
    medicalIssued: p.medical_issued ? p.medical_issued.slice(0, 10) : null,
    medicalClass: isMedicalClass(medicalClass) ? medicalClass : null,
    // Empty/unset reads as the fail-safe default: the traditional
    // certificate ladder, same as before BasicMed existed.
    medicalPathway: isMedicalPathway(medicalPathway) ? medicalPathway : 'certificate',
    basicmedCourseCompleted: p.basicmed_course_completed ? p.basicmed_course_completed.slice(0, 10) : null,
    basicmedExamCompleted: p.basicmed_exam_completed ? p.basicmed_exam_completed.slice(0, 10) : null,
  }
}

async function findOrCreatePilotRecord(
  pb: ReturnType<typeof createRequestPocketBase>,
): Promise<PilotsResponse> {
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error('Not signed in')

  try {
    return await pb
      .collection('pilots')
      .getFirstListItem<PilotsResponse>(pb.filter('user = {:userId}', { userId }))
  } catch (err) {
    if (!(err instanceof ClientResponseError) || err.status !== 404) throw err
  }

  return await pb.collection('pilots').create<PilotsResponse>({
    user: userId,
    name: pb.authStore.record?.email ?? '',
  })
}

/**
 * Finds or creates the signed-in user's `pilots` record, writing straight to
 * PocketBase — the web client has no local database.
 *
 * Returns only the fields callers actually need: `licenses` is a PocketBase
 * `json` column (typed `unknown`), which the server function serialization
 * checker rejects as a return value — narrowing here avoids exposing it to a
 * check it can never satisfy.
 */
export const getOrCreatePilot = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Pilot> => {
    const pb = createRequestPocketBase()
    const pilot = await findOrCreatePilotRecord(pb)
    return { id: pilot.id, name: pilot.name }
  },
)

/** The profile fields the `/profile` route reads and edits. */
export const getPilotProfile = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PilotProfile> => {
    const pb = createRequestPocketBase()
    const pilot = await findOrCreatePilotRecord(pb)
    return toProfile(pilot)
  },
)

export type UpdatePilotProfileInput = {
  name: string
  birthdate: string
  medicalIssued: string
  medicalClass: string
  medicalPathway: string
  basicmedCourseCompleted: string
  basicmedExamCompleted: string
}

export const updatePilotProfile = createServerFn({ method: 'POST' })
  .validator((data: UpdatePilotProfileInput) => data)
  .handler(async ({ data }): Promise<PilotProfile> => {
    const pb = createRequestPocketBase()
    const pilot = await findOrCreatePilotRecord(pb)

    const name = data.name.trim()
    if (!name) throw new Error('Name is required')
    if (data.medicalClass && !isMedicalClass(data.medicalClass)) {
      throw new Error('Select a medical class')
    }
    if (data.medicalPathway && !isMedicalPathway(data.medicalPathway)) {
      throw new Error('Select a medical pathway')
    }

    const updated = await pb.collection('pilots').update<PilotsResponse>(pilot.id, {
      name,
      birthdate: data.birthdate ? parseDateValue(data.birthdate).toISOString() : '',
      medical_issued: data.medicalIssued ? parseDateValue(data.medicalIssued).toISOString() : '',
      medical_class: data.medicalClass || '',
      medical_pathway: data.medicalPathway || '',
      basicmed_course_completed: data.basicmedCourseCompleted
        ? parseDateValue(data.basicmedCourseCompleted).toISOString()
        : '',
      basicmed_exam_completed: data.basicmedExamCompleted
        ? parseDateValue(data.basicmedExamCompleted).toISOString()
        : '',
    })
    return toProfile(updated)
  })
