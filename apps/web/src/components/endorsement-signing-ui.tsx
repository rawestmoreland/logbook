import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { ENDORSEMENT_TYPE_LABELS } from '@logbook/core'

import type { EndorsementType } from '@logbook/core'

// Shared by both the no-account `/sign/:token` flow (`routes/sign/$token.tsx`)
// and the authenticated `/instruct` CFI dashboard (`routes/_authed/instruct.tsx`)
// — same summary/canvas UI either way, only what happens on submit differs.
export type EndorsementSummaryInfo = {
  type: EndorsementType
  date: string
  text: string
  pilotName: string
}

export function EndorsementSummary({ info }: { info: EndorsementSummaryInfo }) {
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

export type SignatureCanvasHandle = {
  toDataUrl: () => string | undefined
  clear: () => void
}

/**
 * A modest drawing surface (CSS-sized, scaled for `devicePixelRatio` so
 * strokes stay crisp on retina/mobile — the backing store, not the on-page
 * size, is what gets scaled) for a CFI's optional drawn signature.
 * Pointer Events (not separate mouse/touch handlers) so mouse, touch, and
 * stylus all draw through the same code path, and `touch-none` (CSS
 * `touch-action: none`) so signing on a phone doesn't also scroll the page.
 * Exposes `toDataUrl`/`clear` via ref rather than an onChange callback so
 * callers only read the drawing once, at submit time.
 */
export const SignatureCanvas = forwardRef<SignatureCanvasHandle>(function SignatureCanvas(_props, ref) {
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
