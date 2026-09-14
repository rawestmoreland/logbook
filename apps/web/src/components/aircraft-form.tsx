import { useEffect, useState } from 'react'

import {
  AIRCRAFT_INSTANCE_TYPES,
  AIRCRAFT_INSTANCE_TYPE_LABELS,
  CATEGORY_CLASSES,
  CATEGORY_CLASS_LABELS,
  isCategoryClass,
} from '@logbook/core'

import { createAircraft } from '#/lib/server/aircraft'
import { findOrCreateModel, searchModels } from '#/lib/server/models'

import type { AircraftListItem } from '#/lib/server/aircraft'
import type { AircraftModelItem } from '#/lib/server/models'

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
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<AircraftModelItem>>([])
  const [searching, setSearching] = useState(false)
  const [selectedModel, setSelectedModel] = useState<AircraftModelItem | null>(null)
  const [creatingModel, setCreatingModel] = useState(false)

  const [newManufacturer, setNewManufacturer] = useState('')
  const [newModel, setNewModel] = useState('')
  const [newCommonName, setNewCommonName] = useState('')
  const [newCategoryClass, setNewCategoryClass] = useState<string>('airplane_single_engine_land')
  const [newComplex, setNewComplex] = useState(false)
  const [newHighPerformance, setNewHighPerformance] = useState(false)
  const [newTailwheel, setNewTailwheel] = useState(false)

  const [isAnonymous, setIsAnonymous] = useState(false)
  const [tailNumber, setTailNumber] = useState('')
  const [instanceType, setInstanceType] = useState('real')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (selectedModel || creatingModel || !query.trim()) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      searchModels({ data: { query } })
        .then((items) => {
          if (!cancelled) setResults(items)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, selectedModel, creatingModel])

  const handleSave = async () => {
    setError('')
    if (!isAnonymous && !tailNumber.trim()) {
      setError('Tail number is required')
      return
    }

    setSaving(true)
    try {
      let modelId = selectedModel?.id
      if (!modelId) {
        if (!newManufacturer.trim() || !newModel.trim()) {
          setError('Search for a model, or enter a manufacturer and model to add one')
          setSaving(false)
          return
        }
        const model = await findOrCreateModel({
          data: {
            manufacturerName: newManufacturer,
            model: newModel,
            commonName: newCommonName,
            categoryClass: newCategoryClass,
            complex: newComplex,
            highPerformance: newHighPerformance,
            tailwheel: newTailwheel,
          },
        })
        modelId = model.id
      }

      const saved = await createAircraft({
        data: {
          pilotId,
          modelId,
          instanceType,
          isAnonymous,
          tailNumber: isAnonymous ? undefined : tailNumber,
        },
      })

      setQuery('')
      setSelectedModel(null)
      setCreatingModel(false)
      setNewManufacturer('')
      setNewModel('')
      setNewCommonName('')
      setNewComplex(false)
      setNewHighPerformance(false)
      setNewTailwheel(false)
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
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
          Manufacturer / model
        </label>

        {selectedModel ? (
          <div className="flex h-8 items-center justify-between rounded-md border border-accent bg-[#eef3f9] px-2.5 text-[13px] text-ink">
            <span>
              {selectedModel.manufacturerName} {selectedModel.model}
              {selectedModel.commonName ? ` (${selectedModel.commonName})` : ''}
            </span>
            <button
              type="button"
              onClick={() => setSelectedModel(null)}
              className="text-[11px] font-medium text-ink-dim hover:text-ink"
            >
              Change
            </button>
          </div>
        ) : creatingModel ? (
          <div className="flex flex-col gap-2.5 rounded-md border border-dashed border-border-strong p-2.5">
            <div className="flex flex-wrap gap-2.5">
              <div className="flex min-w-32 flex-grow flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                  Manufacturer
                </label>
                <input
                  value={newManufacturer}
                  onChange={(e) => setNewManufacturer(e.target.value)}
                  placeholder="Cessna"
                  className={fieldClass}
                />
              </div>
              <div className="flex min-w-24 flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Model</label>
                <input
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="172S"
                  className={fieldClass}
                />
              </div>
              <div className="flex min-w-32 flex-grow flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                  Common name
                </label>
                <input
                  value={newCommonName}
                  onChange={(e) => setNewCommonName(e.target.value)}
                  placeholder="Skyhawk"
                  className={fieldClass}
                />
              </div>
              <div className="flex min-w-52 flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                  Category/class
                </label>
                <select
                  value={newCategoryClass}
                  onChange={(e) => setNewCategoryClass(e.target.value)}
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
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={newComplex}
                  onChange={(e) => setNewComplex(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
                />
                Complex
              </label>
              <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={newHighPerformance}
                  onChange={(e) => setNewHighPerformance(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
                />
                High performance
              </label>
              <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={newTailwheel}
                  onChange={(e) => setNewTailwheel(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
                />
                Tailwheel
              </label>
              <button
                type="button"
                onClick={() => setCreatingModel(false)}
                className="ml-auto text-[11px] font-medium text-ink-dim hover:text-ink"
              >
                Search instead
              </button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search manufacturer or model…"
              className={`${fieldClass} w-full`}
            />
            {query.trim() && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border-strong bg-surface shadow-sm">
                {searching && (
                  <div className="px-2.5 py-2 text-[12.5px] text-ink-dim">Searching…</div>
                )}
                {!searching &&
                  results.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m)
                        setQuery('')
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-alt"
                    >
                      <span>
                        {m.manufacturerName} {m.model}
                        {m.commonName ? ` (${m.commonName})` : ''}
                      </span>
                      <span className="text-[10px] text-ink-faint">
                        {isCategoryClass(m.categoryClass) ? CATEGORY_CLASS_LABELS[m.categoryClass] : m.categoryClass}
                      </span>
                    </button>
                  ))}
                {!searching && results.length === 0 && (
                  <div className="px-2.5 py-2 text-[12.5px] text-ink-dim">No matches</div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setNewManufacturer(query)
                    setCreatingModel(true)
                    setQuery('')
                  }}
                  className="flex w-full items-center gap-1.5 border-t border-border px-2.5 py-1.5 text-left text-[12.5px] font-medium text-accent hover:bg-surface-alt"
                >
                  + Add a new model
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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
