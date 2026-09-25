import { useState } from 'react'

import { CATEGORY_CLASS_LABELS, CATEGORY_CLASSES, CERTIFICATE_TYPES, CERTIFICATE_TYPE_LABELS } from '@logbook/core'

import { createPilotCertificate, updatePilotCertificate } from '#/lib/server/pilot-certificates'

import type { PilotCertificateListItem } from '#/lib/server/pilot-certificates'

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

/**
 * Add/edit form for a pilot's held certificates/ratings — purely
 * informational reference data (issue: "let pilots record the
 * certificates/ratings they hold"), mirroring `aircraft-form.tsx`'s shape.
 * Unlike `aircraft-form.tsx`, this does support editing: `pilot_certificates`
 * rows are pilot-owned and freely writable (no shared-catalog concerns like
 * `aircraft`/`aircraft_models`).
 */
export function PilotCertificateForm({
  pilotId,
  editing,
  onCancel,
  onSaved,
}: {
  pilotId: string
  editing?: PilotCertificateListItem
  onCancel?: () => void
  onSaved: (certificate: PilotCertificateListItem) => void
}) {
  const [certificateType, setCertificateType] = useState(editing?.certificateType ?? CERTIFICATE_TYPES[0])
  const [categoryClasses, setCategoryClasses] = useState<Array<string>>(editing?.categoryClasses ?? [])
  const [additionalRatings, setAdditionalRatings] = useState(editing?.additionalRatings ?? '')
  const [certificateNumber, setCertificateNumber] = useState(editing?.certificateNumber ?? '')
  const [issueDate, setIssueDate] = useState(editing?.issueDate ?? '')
  const [limitations, setLimitations] = useState(editing?.limitations ?? '')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleCategoryClass = (value: string) => {
    setCategoryClasses((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const input = {
        certificateType,
        categoryClasses,
        additionalRatings,
        certificateNumber,
        issueDate,
        limitations,
      }
      const saved = editing
        ? await updatePilotCertificate({ data: { id: editing.id, ...input } })
        : await createPilotCertificate({ data: { pilotId, ...input } })

      if (!editing) {
        setCertificateType(CERTIFICATE_TYPES[0])
        setCategoryClasses([])
        setAdditionalRatings('')
        setCertificateNumber('')
        setIssueDate('')
        setLimitations('')
      }
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save certificate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-md border border-border-strong bg-surface-alt p-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex w-48 flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Certificate type</label>
          <select
            value={certificateType}
            onChange={(e) => setCertificateType(e.target.value)}
            className={fieldClass}
          >
            {CERTIFICATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CERTIFICATE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-40 flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Certificate number</label>
          <input
            value={certificateNumber}
            onChange={(e) => setCertificateNumber(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex w-40 flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Issue date</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Category/class ratings</label>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {CATEGORY_CLASSES.map((cc) => (
            <label key={cc} className="flex items-center gap-1.5 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={categoryClasses.includes(cc)}
                onChange={() => toggleCategoryClass(cc)}
                className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
              />
              {CATEGORY_CLASS_LABELS[cc]}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
          Additional ratings (instrument, type ratings, etc.)
        </label>
        <input
          value={additionalRatings}
          onChange={(e) => setAdditionalRatings(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Limitations</label>
        <input value={limitations} onChange={(e) => setLimitations(e.target.value)} className={fieldClass} />
      </div>

      {!!error && <p className="text-xs text-status-bad">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex h-7.5 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save certificate'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink-dim"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
