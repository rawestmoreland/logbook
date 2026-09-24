import { useState } from 'react'

import { AIRCRAFT_MODEL_REPORT_REASONS, AIRCRAFT_MODEL_REPORT_REASON_LABELS } from '@logbook/core'

import { reportModelIssue } from '#/lib/server/model-reports'

/**
 * "Report a problem with this aircraft" — a small inline flow next to
 * wherever a resolved `aircraft_models` row is shown, mirroring
 * MyFlightbook's equivalent. There's no confirmation beyond the submitted
 * state below: the report lands in `aircraft_model_reports` for a superuser
 * to triage, not anything the reporter can track further from here.
 */
export function ReportModelIssue({ modelId }: { modelId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>(AIRCRAFT_MODEL_REPORT_REASONS[0])
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  if (submitted) {
    return <p className="text-[11px] text-ink-dim">Thanks — reported for review.</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-ink-dim hover:text-ink"
      >
        Report a problem
      </button>
    )
  }

  const handleSubmit = async () => {
    setError('')
    setSubmitting(true)
    try {
      await reportModelIssue({ data: { modelId, reason, details } })
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border-strong p-2">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="h-7 rounded-md border border-border-strong bg-surface px-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
      >
        {AIRCRAFT_MODEL_REPORT_REASONS.map((r) => (
          <option key={r} value={r}>
            {AIRCRAFT_MODEL_REPORT_REASON_LABELS[r]}
          </option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="What's wrong? (optional)"
        rows={2}
        className="rounded-md border border-border-strong bg-surface px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
      />
      {!!error && <p className="text-[11px] text-status-bad">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex h-6.5 items-center rounded-md bg-accent px-2.5 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Send report'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] font-medium text-ink-dim hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
