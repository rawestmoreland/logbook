import { createServerFn } from '@tanstack/react-start'

import { isAircraftModelReportReason } from '@logbook/core'

import { createRequestPocketBase } from '#/lib/server/pocketbase'

import type { AircraftModelReportsResponse } from '@logbook/core'

export type ReportModelIssueInput = {
  modelId: string
  reason: string
  details?: string
}

/**
 * Flags a shared `aircraft_models` catalog row as wrong (see
 * `AIRCRAFT_MODEL_REPORT_REASONS`'s doc comment). Writes into
 * `aircraft_model_reports` rather than the model itself — neither
 * `aircraft_models` nor `manufacturers` grant regular pilots an
 * `updateRule`, so this is a moderation queue for a superuser to triage
 * from the admin UI, not a direct correction.
 */
export const reportModelIssue = createServerFn({ method: 'POST' })
  .validator((data: ReportModelIssueInput) => data)
  .handler(async ({ data }): Promise<void> => {
    const pb = createRequestPocketBase()
    const userId = pb.authStore.record?.id
    if (!userId) throw new Error('Sign in to report a problem')

    const modelId = data.modelId.trim()
    if (!modelId) throw new Error('Missing model')
    if (!isAircraftModelReportReason(data.reason)) throw new Error('Select a reason')

    await pb.collection('aircraft_model_reports').create<AircraftModelReportsResponse>({
      model: modelId,
      reported_by: userId,
      reason: data.reason,
      details: data.details?.trim() ?? '',
      status: 'open',
    })
  })
