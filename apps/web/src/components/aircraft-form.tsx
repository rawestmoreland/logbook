import { useState } from 'react'

import { CATEGORY_CLASSES, CATEGORY_CLASS_LABELS } from '@logbook/core'

import { createAircraft, updateAircraft } from '#/lib/server/aircraft'

import type { AircraftListItem } from '#/lib/server/aircraft'

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

/**
 * Shared create/edit form for `log-flight.tsx`'s inline "add aircraft" flow
 * and the `/aircraft` page. `showAdvanced` hides the complex/high-
 * performance/tailwheel checkboxes for log-flight (nobody needs to set
 * those while rushing to log today's flight) — everything else, including
 * validation (delegated to the `createAircraft`/`updateAircraft` server
 * functions), stays identical between the two call sites.
 */
export function AircraftForm({
  mode,
  aircraft,
  showAdvanced = false,
  onCancel,
  onSaved,
}: {
  mode: 'create' | 'edit'
  aircraft?: AircraftListItem
  showAdvanced?: boolean
  onCancel?: () => void
  onSaved: (aircraft: AircraftListItem) => void
}) {
  const [tailNumber, setTailNumber] = useState(aircraft?.tailNumber ?? '')
  const [type, setType] = useState(aircraft?.type ?? '')
  const [categoryClass, setCategoryClass] = useState<string>(
    aircraft?.categoryClass ?? 'airplane_single_engine_land',
  )
  const [complex, setComplex] = useState(aircraft?.complex ?? false)
  const [highPerformance, setHighPerformance] = useState(aircraft?.highPerformance ?? false)
  const [tailwheel, setTailwheel] = useState(aircraft?.tailwheel ?? false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (!tailNumber.trim()) {
      setError('Tail number is required')
      return
    }
    if (!type.trim()) {
      setError('Type is required')
      return
    }

    setSaving(true)
    try {
      const input = { tailNumber, type, categoryClass, complex, highPerformance, tailwheel }
      const saved =
        mode === 'edit' && aircraft
          ? await updateAircraft({ data: { id: aircraft.id, ...input } })
          : await createAircraft({ data: input })

      if (mode === 'create') {
        setTailNumber('')
        setType('')
        setComplex(false)
        setHighPerformance(false)
        setTailwheel(false)
      }
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save aircraft')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-md border border-border-strong bg-surface-alt p-3">
      <div className="flex flex-wrap gap-2.5">
        <div className="flex w-32 flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
            Tail number
          </label>
          <input
            value={tailNumber}
            onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
            placeholder="N4573D"
            className={`${fieldClass} uppercase`}
          />
        </div>
        <div className="flex min-w-32 flex-grow flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Type</label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="C172S"
            className={fieldClass}
          />
        </div>
        <div className="flex min-w-52 flex-col gap-1">
          <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
            Category/class
          </label>
          <select
            value={categoryClass}
            onChange={(e) => setCategoryClass(e.target.value)}
            className={fieldClass}
          >
            {CATEGORY_CLASSES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_CLASS_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showAdvanced && (
        <div className="flex flex-wrap gap-4 pt-0.5">
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
            <input
              type="checkbox"
              checked={complex}
              onChange={(e) => setComplex(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
            />
            Complex
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
            <input
              type="checkbox"
              checked={highPerformance}
              onChange={(e) => setHighPerformance(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
            />
            High performance
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
            <input
              type="checkbox"
              checked={tailwheel}
              onChange={(e) => setTailwheel(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
            />
            Tailwheel
          </label>
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
          {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save aircraft'}
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
