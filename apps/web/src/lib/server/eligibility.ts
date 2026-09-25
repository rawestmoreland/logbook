import { createServerFn } from '@tanstack/react-start'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

/** Wire shape of a computed `eligibility.Requirement` — matches
 * `pocketbase/base/api/eligibility.go`'s `requirementDTO`. The 61.109(a)
 * rules themselves run server-side (`pocketbase/base/eligibility`); this
 * page only renders what the endpoint already computed. */
export type EligibilityRequirement = {
  citation: string
  label: string
  have: number
  need: number
  unit: 'hours' | 'landings' | ''
  met: boolean
  needsManualReview: boolean
  note?: string
}

export type EligibilityData = {
  requirements: Array<EligibilityRequirement>
  flightCount: number
  /** True when the pilot already holds a `pilot_certificates` row proving
   * private-pilot-or-higher ASEL privileges — see
   * `eligibility.AlreadyHeldASELPrivate` (pocketbase/base/eligibility). */
  alreadyHeld: boolean
  /** Which certificate_type matched ("private" | "commercial" | "atp"), for
   * UI copy. Absent when `alreadyHeld` is false. */
  heldCertificateType?: string
}

/**
 * Everything the Eligibility page needs in one round trip, computed by
 * `pocketbase/base/api/eligibility.go` — the pilot is resolved from the
 * request's own auth token there, not from `pilotId` (kept here only as the
 * query cache key, matching this app's other per-pilot queries).
 */
export const getEligibilityData = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string }) => data)
  .handler(async (): Promise<EligibilityData> => {
    const pb = createRequestPocketBase()
    return pb.send<EligibilityData>('/api/eligibility', { method: 'GET' })
  })
