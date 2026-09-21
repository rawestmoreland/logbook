import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { ENDORSEMENT_TYPE_LABELS } from '@logbook/core'

import { endorsementSigningQueryOptions } from '#/lib/queries/endorsement-signing'
import { signEndorsement } from '#/lib/server/endorsement-signatures'

import type { EndorsementSigningInfo, EndorsementSigningStatus } from '#/lib/server/endorsement-signatures'

export const Route = createFileRoute('/sign/$token')({
  loader: ({ context: { queryClient }, params: { token } }) =>
    queryClient.ensureQueryData(endorsementSigningQueryOptions(token)),
  component: SignPage,
})

function SignPage() {
  const { token } = Route.useParams()
  const { data: status, refetch } = useSuspenseQuery(endorsementSigningQueryOptions(token))

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6">
          <div className="font-mono text-xs font-medium tracking-[0.18em] text-ink">OpenFlyLog</div>
          <h1 className="mt-3 text-lg font-semibold text-ink">Instructor endorsement signature</h1>
        </div>

        <SigningStatusView token={token} status={status} onSigned={() => void refetch()} />
      </div>
    </div>
  )
}

function SigningStatusView({
  token,
  status,
  onSigned,
}: {
  token: string
  status: EndorsementSigningStatus
  onSigned: () => void
}) {
  if (status.state === 'not_found') {
    return <p className="text-sm text-ink-dim">This sign link is invalid.</p>
  }

  if (status.state === 'expired') {
    return (
      <p className="text-sm text-ink-dim">
        This sign link has expired. Ask the pilot to request a new signature link.
      </p>
    )
  }

  if (status.state === 'signed') {
    return (
      <div className="flex flex-col gap-3">
        <EndorsementSummary info={status.info} />
        <div className="rounded-md border border-border bg-ground p-3 text-sm text-ink">
          Signed by <span className="font-medium">{status.instructorName}</span> (CFI #
          {status.instructorCertificateNumber}) on{' '}
          <span className="font-mono">{status.signedAt}</span>.
        </div>
        {!!status.signatureUrl && (
          <img
            src={status.signatureUrl}
            alt="Instructor's drawn signature"
            className="h-[100px] w-fit max-w-full self-start rounded-md border border-border bg-white object-contain p-2"
          />
        )}
      </div>
    )
  }

  return <SignForm token={token} info={status.info} onSigned={onSigned} />
}

function EndorsementSummary({ info }: { info: EndorsementSigningInfo }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-ground p-3 text-sm">
      <div>
        <span className="text-ink-dim">Pilot:</span>{' '}
        <span className="font-medium text-ink">{info.pilotName || 'Unknown'}</span>
      </div>
      <div>
        <span className="text-ink-dim">Endorsement:</span>{' '}
        <span className="font-medium text-ink">{ENDORSEMENT_TYPE_LABELS[info.type]}</span>
      </div>
      <div>
        <span className="text-ink-dim">Date:</span> <span className="font-mono text-ink">{info.date}</span>
      </div>
      {!!info.text && <p className="text-ink-dim">{info.text}</p>}
    </div>
  )
}

function SignForm({
  token,
  info,
  onSigned,
}: {
  token: string
  info: EndorsementSigningInfo
  onSigned: () => void
}) {
  const [instructorName, setInstructorName] = useState('')
  const [certificateNumber, setCertificateNumber] = useState('')
  const [certified, setCertified] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const signatureCanvasRef = useRef<SignatureCanvasHandle>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // Optional — see `signEndorsement`'s doc comment on why an empty
      // canvas still signs successfully.
      const signatureImage = signatureCanvasRef.current?.toDataUrl()
      const result = await signEndorsement({
        data: { token, instructorName, certificateNumber, ...(signatureImage ? { signatureImage } : {}) },
      })
      if (result.ok) {
        onSigned()
        return
      }
      setError(
        result.reason === 'already_signed'
          ? 'This endorsement has already been signed.'
          : result.reason === 'expired'
            ? 'This sign link has expired.'
            : result.reason === 'not_found'
              ? 'This sign link is invalid.'
              : result.reason === 'invalid_signature_image'
                ? 'That signature drawing could not be saved. Try clearing it and signing again.'
                : 'Enter your name and certificate number.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign this endorsement.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <EndorsementSummary info={info} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="instructorName" className="text-xs font-medium text-ink-dim">
          Your full legal name
        </label>
        <input
          id="instructorName"
          type="text"
          required
          autoFocus
          value={instructorName}
          onChange={(e) => setInstructorName(e.target.value)}
          className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="certificateNumber" className="text-xs font-medium text-ink-dim">
          CFI certificate number
        </label>
        <input
          id="certificateNumber"
          type="text"
          required
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
        I certify that the statement above is true, and that typing my name and certificate number here
        constitutes my electronic signature.
      </label>

      {!!error && <p className="text-xs text-status-bad">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !certified}
        className="mt-2 h-9 rounded-md bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? 'Signing…' : 'Sign endorsement'}
      </button>
    </form>
  )
}

type SignatureCanvasHandle = {
  toDataUrl: () => string | undefined
  clear: () => void
}

/**
 * A modest drawing surface (CSS-sized, scaled for `devicePixelRatio` so
 * strokes stay crisp on retina/mobile — the backing store, not the on-page
 * size, is what gets scaled) for the CFI's optional drawn signature.
 * Pointer Events (not separate mouse/touch handlers) so mouse, touch, and
 * stylus all draw through the same code path, and `touch-none` (CSS
 * `touch-action: none`) so signing on a phone doesn't also scroll the page.
 * Exposes `toDataUrl`/`clear` via ref rather than an onChange callback so
 * `SignForm` only reads the drawing once, at submit time.
 */
const SignatureCanvas = forwardRef<SignatureCanvasHandle>(function SignatureCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const hasDrawnRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const ratio = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = width * ratio
    canvas.height = height * ratio
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1a1a'
  }, [])

  useImperativeHandle(ref, () => ({
    toDataUrl: () => (hasDrawnRef.current ? canvasRef.current?.toDataURL('image/png') : undefined),
    clear: () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      hasDrawnRef.current = false
    },
  }))

  const posFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    hasDrawnRef.current = true
    const { x, y } = posFromEvent(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // Draw a dot immediately so a single tap/click still leaves a mark.
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = posFromEvent(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <canvas
      ref={canvasRef}
      className="h-[140px] w-full touch-none rounded-md border border-border-strong bg-white"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrawing}
      onPointerCancel={stopDrawing}
    />
  )
})
