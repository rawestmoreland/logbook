import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

import { CATEGORY_CLASSES, CATEGORY_CLASS_LABELS, isCategoryClass } from '@logbook/core'

import { findOrCreateModel, searchModels } from '#/lib/server/models'

import type { AircraftModelItem } from '#/lib/server/models'

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

export type ModelPickerHandle = {
  /**
   * Resolves the current pick to a real `AircraftModelItem` — creating a
   * new manufacturer/model first (via `findOrCreateModel`) if the pilot was
   * in the "add a new model" flow rather than search results. Throws with a
   * user-facing message if nothing's been picked yet, for the caller to
   * surface however fits its own form.
   */
  resolve: () => Promise<AircraftModelItem>
  reset: () => void
}

/**
 * Manufacturer/model search-or-create control: search the shared
 * `aircraft_models` catalog, or fall through to an inline "add a new model"
 * form that find-or-creates one on `resolve()`. Shared by `AircraftForm`
 * (its "Save aircraft" button resolves the model as part of saving) and the
 * CSV importer's aircraft-resolution step (each unresolved row resolves a
 * model independently, before any flight is created) — pulled out of
 * `AircraftForm` once the importer became a second call site for the same
 * search/create UI.
 */
export const ModelPicker = forwardRef<ModelPickerHandle, { initialManufacturer?: string }>(
  function ModelPicker({ initialManufacturer }, ref) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Array<AircraftModelItem>>([])
    const [searching, setSearching] = useState(false)
    const [selectedModel, setSelectedModel] = useState<AircraftModelItem | null>(null)
    const [creatingModel, setCreatingModel] = useState(false)

    const [newManufacturer, setNewManufacturer] = useState(initialManufacturer ?? '')
    const [newModel, setNewModel] = useState('')
    const [newCommonName, setNewCommonName] = useState('')
    const [newCategoryClass, setNewCategoryClass] = useState<string>('airplane_single_engine_land')
    const [newComplex, setNewComplex] = useState(false)
    const [newHighPerformance, setNewHighPerformance] = useState(false)
    const [newTailwheel, setNewTailwheel] = useState(false)

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

    useImperativeHandle(
      ref,
      () => ({
        async resolve() {
          if (selectedModel) return selectedModel
          if (!newManufacturer.trim() || !newModel.trim()) {
            throw new Error('Search for a model, or enter a manufacturer and model to add one')
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
          setSelectedModel(model)
          setCreatingModel(false)
          return model
        },
        reset() {
          setQuery('')
          setSelectedModel(null)
          setCreatingModel(false)
          setNewManufacturer(initialManufacturer ?? '')
          setNewModel('')
          setNewCommonName('')
          setNewComplex(false)
          setNewHighPerformance(false)
          setNewTailwheel(false)
        },
      }),
      [
        selectedModel,
        newManufacturer,
        newModel,
        newCommonName,
        newCategoryClass,
        newComplex,
        newHighPerformance,
        newTailwheel,
        initialManufacturer,
      ],
    )

    return (
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
    )
  },
)
