import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import {
  EASA_MEDICAL_CLASSES,
  EASA_MEDICAL_CLASS_LABELS,
  JURISDICTIONS,
  JURISDICTION_LABELS,
  MEDICAL_CLASSES,
  MEDICAL_CLASS_LABELS,
  MEDICAL_PATHWAYS,
  MEDICAL_PATHWAY_LABELS,
} from '@logbook/core'

import { pilotProfileQueryOptions } from '#/lib/queries/pilot'
import { updatePilotProfile } from '#/lib/server/pilots'

import type { PilotProfile } from '#/lib/server/pilots'

export const Route = createFileRoute('/_authed/profile')({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(pilotProfileQueryOptions())
  },
  component: ProfilePage,
})

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

function ProfilePage() {
  const queryClient = useQueryClient()
  const { data: profile } = useSuspenseQuery(pilotProfileQueryOptions())

  const [editing, setEditing] = useState(false)

  const handleSaved = (updated: PilotProfile) => {
    queryClient.setQueryData(pilotProfileQueryOptions().queryKey, updated)
    setEditing(false)
  }

  const isEasa = profile.jurisdiction === 'easa'

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">Profile</div>
          <div className="text-xs text-ink-dim">Birthdate and medical feed medical currency</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 px-8 pt-4.5 pb-6">
        <div className="max-w-lg rounded-lg border border-border bg-surface p-4">
          {editing ? (
            <ProfileForm profile={profile} onCancel={() => setEditing(false)} onSaved={handleSaved} />
          ) : (
            <div className="flex flex-col gap-3">
              <Row label="Name" value={profile.name || '—'} />
              <Row label="Jurisdiction" value={JURISDICTION_LABELS[profile.jurisdiction]} />
              <Row label="Birthdate" value={profile.birthdate ?? '—'} />
              {isEasa ? (
                <>
                  <Row
                    label="EASA medical class"
                    value={profile.easaMedicalClass ? EASA_MEDICAL_CLASS_LABELS[profile.easaMedicalClass] : '—'}
                  />
                  <Row label="Medical issued" value={profile.easaMedicalIssued ?? '—'} />
                </>
              ) : (
                <>
                  <Row label="Medical pathway" value={MEDICAL_PATHWAY_LABELS[profile.medicalPathway]} />
                  {profile.medicalPathway === 'basicmed' ? (
                    <>
                      <Row label="Course completed" value={profile.basicmedCourseCompleted ?? '—'} />
                      <Row label="Exam completed" value={profile.basicmedExamCompleted ?? '—'} />
                    </>
                  ) : (
                    <>
                      <Row label="Medical class" value={profile.medicalClass ? MEDICAL_CLASS_LABELS[profile.medicalClass] : '—'} />
                      <Row label="Medical issued" value={profile.medicalIssued ?? '—'} />
                    </>
                  )}
                </>
              )}
              <Row
                label="Aircraft change emails"
                value={profile.notifyAircraftChanges ? 'On' : 'Off'}
              />
              <div>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink"
                >
                  Edit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-32 flex-shrink-0 text-[11px] font-semibold tracking-wide text-ink-dim">
        {label}
      </div>
      <div className="text-sm text-ink">{value}</div>
    </div>
  )
}

function ProfileForm({
  profile,
  onCancel,
  onSaved,
}: {
  profile: PilotProfile
  onCancel: () => void
  onSaved: (profile: PilotProfile) => void
}) {
  const [name, setName] = useState(profile.name)
  const [jurisdiction, setJurisdiction] = useState(profile.jurisdiction)
  const [birthdate, setBirthdate] = useState(profile.birthdate ?? '')
  const [medicalIssued, setMedicalIssued] = useState(profile.medicalIssued ?? '')
  const [medicalClass, setMedicalClass] = useState(profile.medicalClass ?? '')
  const [medicalPathway, setMedicalPathway] = useState(profile.medicalPathway)
  const [basicmedCourseCompleted, setBasicmedCourseCompleted] = useState(
    profile.basicmedCourseCompleted ?? '',
  )
  const [basicmedExamCompleted, setBasicmedExamCompleted] = useState(profile.basicmedExamCompleted ?? '')
  const [easaMedicalClass, setEasaMedicalClass] = useState(profile.easaMedicalClass ?? '')
  const [easaMedicalIssued, setEasaMedicalIssued] = useState(profile.easaMedicalIssued ?? '')
  const [notifyAircraftChanges, setNotifyAircraftChanges] = useState(profile.notifyAircraftChanges)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEasa = jurisdiction === 'easa'

  const handleSave = async () => {
    setError('')
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setSaving(true)
    try {
      const saved = await updatePilotProfile({
        data: {
          name,
          jurisdiction,
          birthdate,
          medicalIssued,
          medicalClass,
          medicalPathway,
          basicmedCourseCompleted,
          basicmedExamCompleted,
          easaMedicalClass,
          easaMedicalIssued,
          notifyAircraftChanges,
        },
      })
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-48 flex-grow flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Birthdate</label>
          <input
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Jurisdiction</label>
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value as typeof jurisdiction)}
          className={`${fieldClass} max-w-56`}
        >
          {JURISDICTIONS.map((j) => (
            <option key={j} value={j}>
              {JURISDICTION_LABELS[j]}
            </option>
          ))}
        </select>
      </div>

      {isEasa ? (
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
              EASA medical class
            </label>
            <select
              value={easaMedicalClass}
              onChange={(e) => setEasaMedicalClass(e.target.value)}
              className={fieldClass}
            >
              <option value="">Not set</option>
              {EASA_MEDICAL_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {EASA_MEDICAL_CLASS_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
              Medical issued
            </label>
            <input
              type="date"
              value={easaMedicalIssued}
              onChange={(e) => setEasaMedicalIssued(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
              Medical pathway
            </label>
            <select
              value={medicalPathway}
              onChange={(e) => setMedicalPathway(e.target.value as typeof medicalPathway)}
              className={`${fieldClass} max-w-56`}
            >
              {MEDICAL_PATHWAYS.map((p) => (
                <option key={p} value={p}>
                  {MEDICAL_PATHWAY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {medicalPathway === 'basicmed' ? (
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                  Course completed
                </label>
                <input
                  type="date"
                  value={basicmedCourseCompleted}
                  onChange={(e) => setBasicmedCourseCompleted(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                  Exam completed
                </label>
                <input
                  type="date"
                  value={basicmedExamCompleted}
                  onChange={(e) => setBasicmedExamCompleted(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                  Medical class
                </label>
                <select
                  value={medicalClass}
                  onChange={(e) => setMedicalClass(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Not set</option>
                  {MEDICAL_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {MEDICAL_CLASS_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                  Medical issued
                </label>
                <input
                  type="date"
                  value={medicalIssued}
                  onChange={(e) => setMedicalIssued(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          )}
        </>
      )}

      <label className="flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={notifyAircraftChanges}
          onChange={(e) => setNotifyAircraftChanges(e.target.checked)}
        />
        Email me when an aircraft I&apos;ve flown is reclassified
      </label>

      {!!error && <p className="text-xs text-status-bad">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex h-7.5 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink-dim"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
