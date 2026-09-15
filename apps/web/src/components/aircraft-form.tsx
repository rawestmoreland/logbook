import { useRef, useState } from 'react'

import { AIRCRAFT_INSTANCE_TYPES, AIRCRAFT_INSTANCE_TYPE_LABELS } from '@logbook/core'

import { createAircraft } from '#/lib/server/aircraft'

import { ModelPicker } from '#/components/model-picker'

import type { AircraftListItem } from '#/lib/server/aircraft'
import type { ModelPickerHandle } from '#/components/model-picker'

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

/**
 * Add-to-fleet form for `log-flight-form.tsx`'s inline "add aircraft" flow
 * and the `/aircraft` page. The manufacturer/model catalog is shared across
 * every pilot, so this is find-or-create throughout: picking an existing
 * model from search reuses its row, and typing a new manufacturer/model
 * grows the catalog rather than duplicating it — same for the tail number
 * itself (`createAircraft` finds-or-creates the shared `aircraft` row).
 * There's no edit mode: the shared `aircraft`/`aircraft_models` rows are
 * locked (superuser-only `updateRule`, see CLAUDE.md's write-rule note) —
 * "removing" an aircraft only ever touches the pilot's own `pilot_aircraft`
 * row (see `removeAircraftFromFleet`).
 */
export function AircraftForm({
  pilotId,
  onCancel,
  onSaved,
}: {
  pilotId: string
  onCancel?: () => void
  onSaved: (aircraft: AircraftListItem) => void
}) {
  const modelPickerRef = useRef<ModelPickerHandle>(null)

  const [isAnonymous, setIsAnonymous] = useState(false)
  const [tailNumber, setTailNumber] = useState('')
  const [instanceType, setInstanceType] = useState('real')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (!isAnonymous && !tailNumber.trim()) {
      setError('Tail number is required')
      return
    }

    setSaving(true)
    try {
      const model = await modelPickerRef.current?.resolve()
      if (!model) throw new Error('Search for a model, or enter a manufacturer and model to add one')

      const saved = await createAircraft({
        data: {
          pilotId,
          modelId: model.id,
          instanceType,
          isAnonymous,
          tailNumber: isAnonymous ? undefined : tailNumber,
        },
      })

      modelPickerRef.current?.reset()
      setIsAnonymous(false)
      setTailNumber('')
      setInstanceType('real')
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save aircraft')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-md border border-border-strong bg-surface-alt p-3">
      <ModelPicker ref={modelPickerRef} />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex w-32 flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
            Tail number
          </label>
          <input
            value={tailNumber}
            disabled={isAnonymous}
            onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
            placeholder="N4573D"
            className={`${fieldClass} uppercase disabled:opacity-50`}
          />
        </div>
        <label className="flex h-8 items-center gap-1.5 text-[12.5px] text-ink">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
          />
          I don&apos;t have a tail number for this aircraft
        </label>
      </div>

      <div className="flex w-52 flex-col gap-1">
        <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
          Instance type
        </label>
        <select
          value={instanceType}
          onChange={(e) => setInstanceType(e.target.value)}
          className={fieldClass}
        >
          {AIRCRAFT_INSTANCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {AIRCRAFT_INSTANCE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {!!error && <p className="text-xs text-status-bad">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex h-7.5 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save aircraft'}
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
