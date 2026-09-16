import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import {
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
              <Row label="Birthdate" value={profile.birthdate ?? '—'} />
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
  const [birthdate, setBirthdate] = useState(profile.birthdate ?? '')
  const [medicalIssued, setMedicalIssued] = useState(profile.medicalIssued ?? '')
  const [medicalClass, setMedicalClass] = useState(profile.medicalClass ?? '')
  const [medicalPathway, setMedicalPathway] = useState(profile.medicalPathway)
  const [basicmedCourseCompleted, setBasicmedCourseCompleted] = useState(
    profile.basicmedCourseCompleted ?? '',
  )
  const [basicmedExamCompleted, setBasicmedExamCompleted] = useState(profile.basicmedExamCompleted ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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
          birthdate,
          medicalIssued,
          medicalClass,
          medicalPathway,
          basicmedCourseCompleted,
          basicmedExamCompleted,
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
