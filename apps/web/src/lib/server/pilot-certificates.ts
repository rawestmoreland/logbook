import { createServerFn } from '@tanstack/react-start'

import { isCertificateType, parseDateValue } from '@logbook/core'

import type { PilotCertificatesResponse } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

/**
 * Purely informational reference data (issue: "let pilots record the
 * certificates/ratings they hold") — plain CRUD against `pilot_certificates`,
 * same pattern as `aircraft.ts`'s `pilot_aircraft` calls. Not wired into
 * `currency`/`eligibility`, and not the same thing as
 * `pilots.is_instructor`/`cfi_certificate_number` (see `pilots.ts`).
 */
export type PilotCertificateListItem = {
  id: string
  certificateType: string
  categoryClasses: Array<string>
  additionalRatings: string
  certificateNumber: string
  issueDate: string | null
  limitations: string
}

function toListItem(c: PilotCertificatesResponse): PilotCertificateListItem {
  return {
    id: c.id,
    certificateType: c.certificate_type,
    categoryClasses: c.category_classes,
    additionalRatings: c.additional_ratings,
    certificateNumber: c.certificate_number,
    issueDate: c.issue_date ? c.issue_date.slice(0, 10) : null,
    limitations: c.limitations,
  }
}

export const listPilotCertificates = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async ({ data }): Promise<Array<PilotCertificateListItem>> => {
    const pb = createRequestPocketBase()
    const certificates = await pb.collection('pilot_certificates').getFullList<PilotCertificatesResponse>({
      filter: pb.filter('pilot = {:pilotId} && deleted != true', { pilotId: data.pilotId }),
      sort: '-issue_date',
    })
    return certificates.map(toListItem)
  })

export type CreatePilotCertificateInput = {
  pilotId: string
  certificateType: string
  categoryClasses: Array<string>
  additionalRatings: string
  certificateNumber: string
  issueDate: string
  limitations: string
}

export const createPilotCertificate = createServerFn({ method: 'POST' })
  .validator((data: CreatePilotCertificateInput) => data)
  .handler(async ({ data }): Promise<PilotCertificateListItem> => {
    const pb = createRequestPocketBase()
    if (!isCertificateType(data.certificateType)) throw new Error('Select a certificate type')

    const created = await pb.collection('pilot_certificates').create<PilotCertificatesResponse>({
      pilot: data.pilotId,
      certificate_type: data.certificateType,
      category_classes: data.categoryClasses,
      additional_ratings: data.additionalRatings.trim(),
      certificate_number: data.certificateNumber.trim(),
      issue_date: data.issueDate ? parseDateValue(data.issueDate).toISOString() : '',
      limitations: data.limitations.trim(),
    })
    return toListItem(created)
  })

export type UpdatePilotCertificateInput = {
  id: string
  certificateType: string
  categoryClasses: Array<string>
  additionalRatings: string
  certificateNumber: string
  issueDate: string
  limitations: string
}

export const updatePilotCertificate = createServerFn({ method: 'POST' })
  .validator((data: UpdatePilotCertificateInput) => data)
  .handler(async ({ data }): Promise<PilotCertificateListItem> => {
    const pb = createRequestPocketBase()
    if (!isCertificateType(data.certificateType)) throw new Error('Select a certificate type')

    const updated = await pb.collection('pilot_certificates').update<PilotCertificatesResponse>(data.id, {
      certificate_type: data.certificateType,
      category_classes: data.categoryClasses,
      additional_ratings: data.additionalRatings.trim(),
      certificate_number: data.certificateNumber.trim(),
      issue_date: data.issueDate ? parseDateValue(data.issueDate).toISOString() : '',
      limitations: data.limitations.trim(),
    })
    return toListItem(updated)
  })

export const removePilotCertificate = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const pb = createRequestPocketBase()
    await pb.collection('pilot_certificates').update(data.id, { deleted: true })
    return { id: data.id }
  })
