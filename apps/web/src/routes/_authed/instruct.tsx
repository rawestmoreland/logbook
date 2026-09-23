import { useRef, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { ENDORSEMENT_TYPE_LABELS } from '@logbook/core'

import { EndorsementSummary, SignatureCanvas } from '#/components/endorsement-signing-ui'
import { instructorEndorsementsQueryOptions } from '#/lib/queries/instructor'
import { pilotProfileQueryOptions } from '#/lib/queries/pilot'
import { signEndorsementAsInstructor } from '#/lib/server/endorsement-signatures'

import type { SignatureCanvasHandle } from '#/components/endorsement-signing-ui'
import type { InstructorEndorsementSummary } from '#/lib/server/endorsement-signatures'

// Only reachable/visible to pilots with `is_instructor` set on their profile
// — the nav link in `_authed.tsx` is likewise conditional, but a direct
// visit is still guarded here rather than relying on hiding the link alone.
export const Route = createFileRoute('/_authed/instruct')({
  beforeLoad: ({ context }) => {
    if (!context.isInstructor) {
      throw redirect({ to: '/' })
    }
  },
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(instructorEndorsementsQueryOptions()),
      queryClient.ensureQueryData(pilotProfileQueryOptions()),
    ])
  },
  component: InstructPage,
})

function InstructPage() {
  const queryClient = useQueryClient()
  const { data: endorsements } = useSuspenseQuery(instructorEndorsementsQueryOptions())
  const { data: profile } = useSuspenseQuery(pilotProfileQueryOptions())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = endorsements.find((e) => e.id === selectedId) ?? null

  const handleSigned = () => {
    setSelectedId(null)
    void queryClient.invalidateQueries({ queryKey: instructorEndorsementsQueryOptions().queryKey })
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">Instruct</div>
          <div className="text-xs text-ink-dim">Endorsements assigned to you, waiting for your signature</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-2.5 px-8 pt-4.5 pb-6">
        {selected ? (
          <InstructorSignForm
            endorsement={selected}
            defaultCertificateNumber={profile.cfiCertificateNumber}
            onCancel={() => setSelectedId(null)}
            onSigned={handleSigned}
          />
        ) : endorsements.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            Nothing waiting for your signature.
          </div>
        ) : (
          endorsements.map((endorsement) => (
            <button
              key={endorsement.id}
              type="button"
              onClick={() => setSelectedId(endorsement.id)}
              className="flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface p-4 text-left"
            >
              <span className="text-sm font-medium text-ink">{endorsement.pilotName || 'Unknown pilot'}</span>
              <span className="text-xs text-ink-dim">{ENDORSEMENT_TYPE_LABELS[endorsement.type]}</span>
              <span className="font-mono text-xs text-ink-dim">{endorsement.date}</span>
              <span className="ml-auto text-xs font-medium text-accent">Sign →</span>
            </button>
          ))
        )}
      </div>
    </>
  )
}

function InstructorSignForm({
  endorsement,
  defaultCertificateNumber,
  onCancel,
  onSigned,
}: {
  endorsement: InstructorEndorsementSummary
  defaultCertificateNumber: string
  onCancel: () => void
  onSigned: () => void
}) {
  const [certificateNumber, setCertificateNumber] = useState(defaultCertificateNumber)
  const [certified, setCertified] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const signatureCanvasRef = useRef<SignatureCanvasHandle>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // Optional — see `signEndorsementAsInstructor`'s doc comment on why an
      // empty canvas still signs successfully.
      const signatureImage = signatureCanvasRef.current?.toDataUrl()
      const result = await signEndorsementAsInstructor({
        data: {
          endorsementId: endorsement.id,
          certificateNumber,
          ...(signatureImage ? { signatureImage } : {}),
        },
      })
      if (result.ok) {
        onSigned()
        return
      }
      setError(
        result.reason === 'already_signed'
          ? 'This endorsement has already been signed.'
          : result.reason === 'invalid_signature_image'
            ? 'That signature drawing could not be saved. Try clearing it and signing again.'
            : result.reason === 'not_found'
              ? 'This endorsement is no longer assigned to you.'
              : 'Enter your certificate number.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign this endorsement.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <EndorsementSummary info={endorsement} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="certificateNumber" className="text-xs font-medium text-ink-dim">
          CFI certificate number
        </label>
        <input
          id="certificateNumber"
          type="text"
          required
          autoFocus
          value={certificateNumber}
          onChange={(e) => setCertificateNumber(e.target.value)}
          className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ink-dim">Signature (optional)</span>
          <button
            type="button"
            onClick={() => signatureCanvasRef.current?.clear()}
            className="text-xs font-medium text-ink-dim underline underline-offset-2 hover:text-ink"
          >
            Clear
          </button>
        </div>
        <SignatureCanvas ref={signatureCanvasRef} />
      </div>

      <label className="flex items-start gap-2 text-xs text-ink-dim">
        <input
          type="checkbox"
          required
          checked={certified}
          onChange={(e) => setCertified(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-border-strong accent-accent"
        />
        I certify that the statement above is true, and that submitting this constitutes my electronic
        signature.
      </label>

      {!!error && <p className="text-xs text-status-bad">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !certified}
          className="flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {submitting ? 'Signing…' : 'Sign endorsement'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex h-9 items-center rounded-md border border-border-strong px-4 text-sm font-medium text-ink-dim disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
