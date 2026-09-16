import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import {
  isEasaMedicalClass,
  isJurisdiction,
  isMedicalClass,
  isMedicalPathway,
  isProfileType,
  parseDateValue,
} from '@logbook/core'

import type {
  EasaMedicalClass,
  Jurisdiction,
  MedicalClass,
  MedicalPathway,
  PilotsResponse,
  ProfileType,
  RegulatoryProfilesResponse,
} from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

export type Pilot = { id: string; name: string }

type RegulatoryProfileRules = { code?: string }
type PilotExpand = { regulatory_profile?: RegulatoryProfilesResponse<RegulatoryProfileRules> }
export type PilotWithExpand = PilotsResponse<unknown, PilotExpand>

/**
 * Fixed ids of the two rows seeded by
 * pocketbase/base/migrations/1789590000_regulatory_profiles_seed.go — kept
 * in lockstep by hand, the same as the other Go/TypeScript constant pairs
 * in this codebase (e.g. seed_aircraft.go's category/engine-type maps
 * mirroring packages/core/src/aircraft.ts).
 */
const REGULATORY_PROFILE_ID: Record<Jurisdiction, string> = {
  faa: 'faaregulatory01',
  easa: 'easaregulatory1',
}

/**
 * `birthdate`/`medicalIssued`/`medicalClass` feed `medicalCurrency()`,
 * `basicmedCourseCompleted`/`basicmedExamCompleted` feed `basicMedCurrency()`,
 * and `easaMedicalClass`/`easaMedicalIssued` (reusing `birthdate`) feed
 * `easaMedicalCurrency()`, on the Currency page. `jurisdiction` picks FAA vs.
 * EASA; within FAA, `medicalPathway` further picks which of the two FAA
 * pathways applies. All three are mutually exclusive. `null` (not omitted)
 * distinguishes "not entered yet" from a field the caller forgot to ask for.
 */
export type PilotProfile = {
  id: string
  name: string
  jurisdiction: Jurisdiction
  birthdate: string | null
  medicalIssued: string | null
  medicalClass: MedicalClass | null
  medicalPathway: MedicalPathway
  basicmedCourseCompleted: string | null
  basicmedExamCompleted: string | null
  easaMedicalClass: EasaMedicalClass | null
  easaMedicalIssued: string | null
  /** Which insights the home screen personalizes to — see `profile.ts`. */
  profileType: ProfileType
}

/**
 * `regulatory_profile`'s `rules.code`, resolved to a `Jurisdiction`. Empty/
 * unset `regulatory_profile`, or a profile whose `rules.code` isn't a
 * recognized jurisdiction, reads as the fail-safe default: FAA, the same
 * way an empty `medical_pathway` already reads as 'certificate'. Exported
 * for `currency.ts`, which needs the same resolution to pick between
 * `medicalCurrency`/`basicMedCurrency` and `easaMedicalCurrency`.
 */
export function jurisdictionOf(p: PilotWithExpand): Jurisdiction {
  const code = p.expand.regulatory_profile?.rules?.code ?? ''
  return isJurisdiction(code) ? code : 'faa'
}

function toProfile(p: PilotWithExpand): PilotProfile {
  // PocketBase's typegen marks every field non-optional via `Required<>`,
  // which hides that an unset select field actually comes back as `""` at
  // runtime — widen to `string` first so that's a real possibility to guard.
  const medicalClass: string = p.medical_class
  const medicalPathway: string = p.medical_pathway
  const easaMedicalClass: string = p.easa_medical_class
  const profileType: string = p.profile_type
  return {
    id: p.id,
    name: p.name,
    jurisdiction: jurisdictionOf(p),
    birthdate: p.birthdate ? p.birthdate.slice(0, 10) : null,
    medicalIssued: p.medical_issued ? p.medical_issued.slice(0, 10) : null,
    medicalClass: isMedicalClass(medicalClass) ? medicalClass : null,
    // Empty/unset reads as the fail-safe default: the traditional
    // certificate ladder, same as before BasicMed existed.
    medicalPathway: isMedicalPathway(medicalPathway) ? medicalPathway : 'certificate',
    basicmedCourseCompleted: p.basicmed_course_completed ? p.basicmed_course_completed.slice(0, 10) : null,
    basicmedExamCompleted: p.basicmed_exam_completed ? p.basicmed_exam_completed.slice(0, 10) : null,
    easaMedicalClass: isEasaMedicalClass(easaMedicalClass) ? easaMedicalClass : null,
    easaMedicalIssued: p.easa_medical_issued ? p.easa_medical_issued.slice(0, 10) : null,
    // Empty/unset reads as the fail-safe default — see profile.ts's doc comment.
    profileType: isProfileType(profileType) ? profileType : 'recreational',
  }
}

async function findOrCreatePilotRecord(
  pb: ReturnType<typeof createRequestPocketBase>,
): Promise<PilotWithExpand> {
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error('Not signed in')

  try {
    return await pb
      .collection('pilots')
      .getFirstListItem<PilotWithExpand>(pb.filter('user = {:userId}', { userId }), {
        expand: 'regulatory_profile',
      })
  } catch (err) {
    if (!(err instanceof ClientResponseError) || err.status !== 404) throw err
  }

  return await pb.collection('pilots').create<PilotWithExpand>({
    user: userId,
    name: pb.authStore.record?.email ?? '',
    regulatory_profile: REGULATORY_PROFILE_ID.faa,
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
  jurisdiction: string
  birthdate: string
  medicalIssued: string
  medicalClass: string
  medicalPathway: string
  basicmedCourseCompleted: string
  basicmedExamCompleted: string
  easaMedicalClass: string
  easaMedicalIssued: string
  profileType: string
}

export const updatePilotProfile = createServerFn({ method: 'POST' })
  .validator((data: UpdatePilotProfileInput) => data)
  .handler(async ({ data }): Promise<PilotProfile> => {
    const pb = createRequestPocketBase()
    const pilot = await findOrCreatePilotRecord(pb)

    const name = data.name.trim()
    if (!name) throw new Error('Name is required')
    if (data.jurisdiction && !isJurisdiction(data.jurisdiction)) {
      throw new Error('Select a jurisdiction')
    }
    if (data.medicalClass && !isMedicalClass(data.medicalClass)) {
      throw new Error('Select a medical class')
    }
    if (data.medicalPathway && !isMedicalPathway(data.medicalPathway)) {
      throw new Error('Select a medical pathway')
    }
    if (data.easaMedicalClass && !isEasaMedicalClass(data.easaMedicalClass)) {
      throw new Error('Select an EASA medical class')
    }
    if (data.profileType && !isProfileType(data.profileType)) {
      throw new Error('Select a profile type')
    }

    const jurisdiction: Jurisdiction = isJurisdiction(data.jurisdiction) ? data.jurisdiction : 'faa'

    const updated = await pb.collection('pilots').update<PilotWithExpand>(
      pilot.id,
      {
        name,
        regulatory_profile: REGULATORY_PROFILE_ID[jurisdiction],
        profile_type: data.profileType || '',
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
        easa_medical_class: data.easaMedicalClass || '',
        easa_medical_issued: data.easaMedicalIssued
          ? parseDateValue(data.easaMedicalIssued).toISOString()
          : '',
      },
      { expand: 'regulatory_profile' },
    )
    return toProfile(updated)
  })
