import { useRef, useState } from 'react'

import { AIRCRAFT_INSTANCE_TYPES, AIRCRAFT_INSTANCE_TYPE_LABELS } from '@logbook/core'

import { ModelPicker } from '#/components/model-picker'

import type { ModelPickerHandle } from '#/components/model-picker'
import type { AutoResolvedTail, ImportResolution, UnresolvedTail } from '#/lib/server/import'

/**
 * Tail-resolution UI shared by the flight importer (`/import`) and the
 * aircraft-only importer (`/aircraft`) — both classify CSV tails into
 * `autoResolvedTails`/`unresolvedTails` via the same `previewImport`-style
 * server logic (see `import.ts`/`aircraft-import.ts`), so the "review an
 * automatic match" and "point an unresolved tail at a model" controls are
 * identical between the two flows. Pulled out of `/import` once the
 * aircraft-only importer became a second call site for this same UI.
 */

/**
 * Tails (or anonymous model groups) whose CSV model text confidently
 * matched an existing catalog model — see `AutoResolvedTail`. These are
 * already pre-filled into the caller's resolutions and will be
 * created/added to the fleet automatically at commit, but stay visible
 * (collapsed by default once there are more than a handful) so the pilot can
 * double check or override the match before importing, same as a
 * manually-resolved tail.
 */
export function AutoResolvedSection({
  autoResolvedTails,
  resolutions,
  onResolved,
}: {
  autoResolvedTails: Array<AutoResolvedTail>
  resolutions: Record<string, ImportResolution | undefined>
  onResolved: (tailKey: string, resolution: ImportResolution) => void
}) {
  const [expanded, setExpanded] = useState(autoResolvedTails.length <= 8)

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex flex-wrap items-center justify-between gap-2 text-left"
      >
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
            Matched automatically ({autoResolvedTails.length})
          </div>
          <div className="text-[12.5px] text-ink-dim">
            These tails weren&apos;t in your fleet yet, but their CSV model text matched an
            existing model exactly — they&apos;ll be added automatically. Review or change any of
            them below.
          </div>
        </div>
        <span className="text-xs text-ink-dim">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2">
          {autoResolvedTails.map((tail) => (
            <AutoResolvedTailRow
              key={tail.tailKey}
              tail={tail}
              resolution={resolutions[tail.tailKey]}
              onResolve={onResolved}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AutoResolvedTailRow({
  tail,
  resolution,
  onResolve,
}: {
  tail: AutoResolvedTail
  resolution: ImportResolution | undefined
  onResolve: (tailKey: string, resolution: ImportResolution) => void
}) {
  const pickerRef = useRef<ModelPickerHandle>(null)
  const [editing, setEditing] = useState(false)
  const [instanceType, setInstanceType] = useState<string>(tail.suggestedInstanceType ?? 'real')
  const [error, setError] = useState('')

  const overridden = !!resolution && resolution.modelId !== tail.modelId

  const handleResolveClick = async () => {
    setError('')
    try {
      const model = await pickerRef.current?.resolve()
      if (!model) throw new Error('Search for a model, or enter a manufacturer and model to add one')
      onResolve(tail.tailKey, { modelId: model.id, instanceType })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve this aircraft')
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-border-strong px-3 py-2">
        <span className="font-mono text-[13px] font-medium text-ink">
          {tail.isAnonymous ? 'Anonymous aircraft' : tail.tailNumber}
        </span>
        <span className="text-[12.5px] text-ink-dim">
          matched to <span className="text-ink">{tail.modelDescription}</span>
          {overridden && ' (changed)'}
        </span>
        {!!tail.csvModel && (
          <span className="text-[11px] text-ink-dim">CSV: &ldquo;{tail.csvModel}&rdquo;</span>
        )}
        <div className="flex-grow" />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-accent hover:underline"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-strong p-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[13px] font-medium text-ink">
          {tail.isAnonymous ? 'Anonymous aircraft' : tail.tailNumber}
        </span>
        <span className="text-[12.5px] text-ink-dim">
          currently matched to <span className="text-ink">{tail.modelDescription}</span>
        </span>
      </div>
      <ModelPicker ref={pickerRef} />
      <div className="flex w-52 flex-col gap-1">
        <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
          Instance type
        </label>
        <select
          value={instanceType}
          onChange={(e) => setInstanceType(e.target.value)}
          className="h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent"
        >
          {AIRCRAFT_INSTANCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {AIRCRAFT_INSTANCE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleResolveClick}
          className="flex h-7.5 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
        >
          Use this model
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink"
        >
          Cancel
        </button>
      </div>
      {!!error && <p className="text-xs text-status-bad">{error}</p>}
    </div>
  )
}

export function UnresolvedTailRow({
  tail,
  resolved,
  onResolve,
}: {
  tail: UnresolvedTail
  resolved: boolean
  onResolve: (tailKey: string, resolution: ImportResolution) => void
}) {
  const pickerRef = useRef<ModelPickerHandle>(null)
  const [instanceType, setInstanceType] = useState<string>(tail.suggestedInstanceType ?? 'real')
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')

  const handleResolveClick = async () => {
    setError('')
    setResolving(true)
    try {
      const model = await pickerRef.current?.resolve()
      if (!model) throw new Error('Search for a model, or enter a manufacturer and model to add one')
      onResolve(tail.tailKey, { modelId: model.id, instanceType })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve this aircraft')
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-strong p-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[13px] font-medium text-ink">
          {tail.isAnonymous ? 'Anonymous aircraft' : tail.tailNumber}
        </span>
        {!!tail.csvModel && (
          <span className="text-[12.5px] text-ink-dim">CSV says &ldquo;{tail.csvModel}&rdquo;</span>
        )}
        <div className="flex-grow" />
        {resolved && (
          <span className="rounded border border-border-strong bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-dim uppercase">
            Resolved
          </span>
        )}
      </div>

      {!resolved && (
        <div className="flex flex-col gap-2">
          <ModelPicker ref={pickerRef} suggestedModel={tail.suggestedModel} />
          <div className="flex w-52 flex-col gap-1">
            <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
              Instance type
            </label>
            <select
              value={instanceType}
              onChange={(e) => setInstanceType(e.target.value)}
              className="h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent"
            >
              {AIRCRAFT_INSTANCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {AIRCRAFT_INSTANCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {!!tail.suggestedInstanceType && tail.suggestedInstanceType !== 'real' && (
              <p className="text-[11px] text-ink-dim">
                Suggested from the CSV — change if wrong.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResolveClick}
              disabled={resolving}
              className="flex h-7.5 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {resolving ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
          {!!error && <p className="text-xs text-status-bad">{error}</p>}
        </div>
      )}
    </div>
  )
}
