import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import {
  CATEGORY_CLASS_LABELS,
  CERTIFICATE_TYPE_LABELS,
  EASA_MEDICAL_CLASSES,
  EASA_MEDICAL_CLASS_LABELS,
  JURISDICTIONS,
  JURISDICTION_LABELS,
  MEDICAL_CLASSES,
  MEDICAL_CLASS_LABELS,
  MEDICAL_PATHWAYS,
  MEDICAL_PATHWAY_LABELS,
  isCategoryClass,
  isCertificateType,
} from '@logbook/core'

import { pilotCertificatesQueryOptions } from '#/lib/queries/pilot-certificates'
import { pilotProfileQueryOptions } from '#/lib/queries/pilot'
import { removePilotCertificate } from '#/lib/server/pilot-certificates'
import { updatePilotProfile } from '#/lib/server/pilots'

import { PilotCertificateForm } from '#/components/pilot-certificate-form'

import { useAuthActions } from '#/contexts/auth-context'
import type { PilotCertificateListItem } from '#/lib/server/pilot-certificates'
import type { PilotProfile } from '#/lib/server/pilots'
import { LogOutIcon } from 'lucide-react'

export const Route = createFileRoute('/_authed/profile')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(pilotProfileQueryOptions()),
      queryClient.ensureQueryData(pilotCertificatesQueryOptions(pilotId)),
    ])
  },
  component: ProfilePage,
})

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

function ProfilePage() {
  const { pilotId } = Route.useRouteContext()
  const queryClient = useQueryClient()

  const router = useRouter()

  const { data: profile } = useSuspenseQuery(pilotProfileQueryOptions())

  const [editing, setEditing] = useState(false)

  const { signOut } = useAuthActions()

  const handleSaved = (updated: PilotProfile) => {
    queryClient.setQueryData(pilotProfileQueryOptions().queryKey, updated)
    setEditing(false)
  }

  const isEasa = profile.jurisdiction === 'easa'

  const handleSignout = () => {
    signOut()
    router.navigate({ to: '/sign-in' })
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex justify-between w-full">
          <div className="flex flex-col gap-0.5">
            <div className="text-lg font-semibold tracking-tight text-ink">
              Profile
            </div>
            <div className="text-xs text-ink-dim">
              Birthdate and medical feed medical currency
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignout}
            className="flex gap-1 h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink"
          >
            <LogOutIcon className="size-4" />
            Logout
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 px-8 pt-4.5 pb-6">
        <div className="max-w-lg rounded-lg border border-border bg-surface p-4">
          {editing ? (
            <ProfileForm
              profile={profile}
              onCancel={() => setEditing(false)}
              onSaved={handleSaved}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <Row label="Name" value={profile.name || '—'} />
              <Row
                label="Jurisdiction"
                value={JURISDICTION_LABELS[profile.jurisdiction]}
              />
              <Row label="Birthdate" value={profile.birthdate ?? '—'} />
              {isEasa ? (
                <>
                  <Row
                    label="EASA medical class"
                    value={
                      profile.easaMedicalClass
                        ? EASA_MEDICAL_CLASS_LABELS[profile.easaMedicalClass]
                        : '—'
                    }
                  />
                  <Row
                    label="Medical issued"
                    value={profile.easaMedicalIssued ?? '—'}
                  />
                </>
              ) : (
                <>
                  <Row
                    label="Medical pathway"
                    value={MEDICAL_PATHWAY_LABELS[profile.medicalPathway]}
                  />
                  {profile.medicalPathway === 'basicmed' ? (
                    <>
                      <Row
                        label="Course completed"
                        value={profile.basicmedCourseCompleted ?? '—'}
                      />
                      <Row
                        label="Exam completed"
                        value={profile.basicmedExamCompleted ?? '—'}
                      />
                    </>
                  ) : (
                    <>
                      <Row
                        label="Medical class"
                        value={
                          profile.medicalClass
                            ? MEDICAL_CLASS_LABELS[profile.medicalClass]
                            : '—'
                        }
                      />
                      <Row
                        label="Medical issued"
                        value={profile.medicalIssued ?? '—'}
                      />
                    </>
                  )}
                </>
              )}
              <Row
                label="Aircraft change emails"
                value={profile.notifyAircraftChanges ? 'On' : 'Off'}
              />
              <Row
                label="CFI / instructor"
                value={
                  profile.isInstructor
                    ? `Yes${profile.cfiCertificateNumber ? ` (CFI #${profile.cfiCertificateNumber})` : ''}`
                    : 'No'
                }
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

        <CertificatesSection pilotId={pilotId} />
      </div>
    </>
  )
}

/**
 * A pilot's own reference list of the certificates/ratings they hold —
 * purely informational, not consumed by `currency`/`eligibility` and not the
 * same thing as the "CFI / instructor" row above (see `pilot-certificates.ts`).
 * Kept on this page rather than a new route since it's still pilot-personal
 * info, next to the existing CFI status for context.
 */
function CertificatesSection({ pilotId }: { pilotId: string }) {
  const queryClient = useQueryClient()
  const { data: certificates } = useSuspenseQuery(pilotCertificatesQueryOptions(pilotId))

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState('')

  const setCertificates = (updater: (old: Array<PilotCertificateListItem>) => Array<PilotCertificateListItem>) => {
    queryClient.setQueryData(pilotCertificatesQueryOptions(pilotId).queryKey, (old: Array<PilotCertificateListItem> = []) =>
      updater(old),
    )
  }

  const handleCreated = (certificate: PilotCertificateListItem) => {
    setCertificates((old) => [certificate, ...old])
    setShowAddForm(false)
  }

  const handleUpdated = (certificate: PilotCertificateListItem) => {
    setCertificates((old) => old.map((c) => (c.id === certificate.id ? certificate : c)))
    setEditingId(null)
  }

  const handleRemove = async (id: string) => {
    setRemoveError('')
    setRemovingId(id)
    try {
      await removePilotCertificate({ data: { id } })
      setCertificates((old) => old.filter((c) => c.id !== id))
      setConfirmingRemoveId(null)
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove certificate')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="max-w-lg rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">Certificates</div>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex h-7 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            + Add certificate
          </button>
        )}
      </div>

      {showAddForm && (
        <PilotCertificateForm pilotId={pilotId} onCancel={() => setShowAddForm(false)} onSaved={handleCreated} />
      )}

      {certificates.length === 0 && !showAddForm ? (
        <div className="pt-3 text-xs text-ink-dim">No certificates recorded yet.</div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {certificates.map((c) =>
            editingId === c.id ? (
              <PilotCertificateForm
                key={c.id}
                pilotId={pilotId}
                editing={c}
                onCancel={() => setEditingId(null)}
                onSaved={handleUpdated}
              />
            ) : (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="text-sm font-medium text-ink">
                    {isCertificateType(c.certificateType) ? CERTIFICATE_TYPE_LABELS[c.certificateType] : c.certificateType}
                    {c.certificateNumber ? ` — #${c.certificateNumber}` : ''}
                  </div>
                  {c.categoryClasses.length > 0 && (
                    <div className="text-xs text-ink-dim">
                      {c.categoryClasses
                        .map((cc) => (isCategoryClass(cc) ? CATEGORY_CLASS_LABELS[cc] : cc))
                        .join(', ')}
                    </div>
                  )}
                  {!!c.additionalRatings && <div className="text-xs text-ink-dim">{c.additionalRatings}</div>}
                  {!!c.issueDate && <div className="text-xs text-ink-faint">Issued {c.issueDate}</div>}
                  {!!c.limitations && <div className="text-xs text-ink-faint">{c.limitations}</div>}
                </div>
                {confirmingRemoveId === c.id ? (
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRemove(c.id)}
                      disabled={removingId === c.id}
                      className="flex h-7 items-center rounded-md bg-status-bad px-2.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {removingId === c.id ? 'Removing…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemoveId(null)}
                      className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-ink-dim"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(c.id)}
                      className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-ink"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemoveId(c.id)}
                      className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-status-bad"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {!!removeError && <p className="pt-2 text-xs text-status-bad">{removeError}</p>}
    </div>
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
  const [medicalIssued, setMedicalIssued] = useState(
    profile.medicalIssued ?? '',
  )
  const [medicalClass, setMedicalClass] = useState(profile.medicalClass ?? '')
  const [medicalPathway, setMedicalPathway] = useState(profile.medicalPathway)
  const [basicmedCourseCompleted, setBasicmedCourseCompleted] = useState(
    profile.basicmedCourseCompleted ?? '',
  )
  const [basicmedExamCompleted, setBasicmedExamCompleted] = useState(
    profile.basicmedExamCompleted ?? '',
  )
  const [easaMedicalClass, setEasaMedicalClass] = useState(
    profile.easaMedicalClass ?? '',
  )
  const [easaMedicalIssued, setEasaMedicalIssued] = useState(
    profile.easaMedicalIssued ?? '',
  )
  const [notifyAircraftChanges, setNotifyAircraftChanges] = useState(
    profile.notifyAircraftChanges,
  )
  const [isInstructor, setIsInstructor] = useState(profile.isInstructor)
  const [cfiCertificateNumber, setCfiCertificateNumber] = useState(
    profile.cfiCertificateNumber,
  )
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
          isInstructor,
          cfiCertificateNumber,
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
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
            Birthdate
          </label>
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
          Jurisdiction
        </label>
        <select
          value={jurisdiction}
          onChange={(e) =>
            setJurisdiction(e.target.value as typeof jurisdiction)
          }
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
              onChange={(e) =>
                setMedicalPathway(e.target.value as typeof medicalPathway)
              }
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

      <label className="flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={isInstructor}
          onChange={(e) => setIsInstructor(e.target.checked)}
        />
        I&apos;m a CFI / flight instructor
      </label>

      {isInstructor && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
            CFI certificate number
          </label>
          <input
            value={cfiCertificateNumber}
            onChange={(e) => setCfiCertificateNumber(e.target.value)}
            className={`${fieldClass} max-w-56`}
          />
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
