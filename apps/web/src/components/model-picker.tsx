import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

import {
  CATEGORY_CLASSES,
  CATEGORY_CLASS_LABELS,
  ENGINE_TYPES,
  ENGINE_TYPE_LABELS,
  MINIMUM_AVIONICS,
  MINIMUM_AVIONICS_LABELS,
  isCategoryClass,
  isComplexAircraft,
} from '@logbook/core'

import { findOrCreateModel, searchModels } from '#/lib/server/models'

import type { AircraftModelAlias } from '@logbook/core'
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
 *
 * `suggestedModel` (from `findAircraftModelAlias`) pre-fills the search
 * query and the "add a new model" form when the CSV importer recognized an
 * opaque type-design designator (e.g. ForeFlight's Aircraft Table giving
 * "Bombardier CL-600-2C10" for what's really a CRJ 700) — surfaced as a
 * default the pilot can still change or search past, never applied
 * silently.
 */
export const ModelPicker = forwardRef<
  ModelPickerHandle,
  { initialManufacturer?: string; suggestedModel?: AircraftModelAlias }
>(function ModelPicker({ initialManufacturer, suggestedModel }, ref) {
  const [query, setQuery] = useState(suggestedModel?.commonName ?? '')
  const [results, setResults] = useState<Array<AircraftModelItem>>([])
  const [searching, setSearching] = useState(false)
  const [selectedModel, setSelectedModel] = useState<AircraftModelItem | null>(
    null,
  )
  const [creatingModel, setCreatingModel] = useState(false)

  const [newManufacturer, setNewManufacturer] = useState(
    suggestedModel?.manufacturerName ?? initialManufacturer ?? '',
  )
  const [newModel, setNewModel] = useState(suggestedModel?.model ?? '')
  const [newCommonName, setNewCommonName] = useState(
    suggestedModel?.commonName ?? '',
  )
  const [newCategoryClass, setNewCategoryClass] = useState<string>(
    suggestedModel?.categoryClass ?? 'airplane_single_engine_land',
  )
  const [newHighPerformance, setNewHighPerformance] = useState(
    suggestedModel?.highPerformance ?? false,
  )
  const [newTailwheel, setNewTailwheel] = useState(
    suggestedModel?.tailwheel ?? false,
  )
  const [newEngineType, setNewEngineType] = useState<string>(
    suggestedModel?.engineType ?? '',
  )
  const [newMinimumAvionics, setNewMinimumAvionics] = useState<string>('')
  const [newFlaps, setNewFlaps] = useState(suggestedModel?.flaps ?? false)
  const [newControllablePitchProp, setNewControllablePitchProp] = useState(
    suggestedModel?.controllablePitchProp ?? false,
  )
  const [newRetractableGear, setNewRetractableGear] = useState(
    suggestedModel?.retractableGear ?? false,
  )
  const [newIcao, setNewIcao] = useState(suggestedModel?.icao ?? '')
  const [newTypeDesignDesignator, setNewTypeDesignDesignator] = useState('')

  // `complex` (14 CFR 61.31(e)) isn't its own checkbox — it's always this
  // derivation from the equipment fields above, so there's no way to end
  // up with a model whose complex flag disagrees with what it's actually
  // equipped with (which the aircraft_models validation hook would reject
  // anyway — see isComplexAircraft's doc comment).
  const computedComplex = isCategoryClass(newCategoryClass)
    ? isComplexAircraft({
        categoryClass: newCategoryClass,
        flaps: newFlaps,
        controllablePitchProp: newControllablePitchProp,
        retractableGear: newRetractableGear,
      })
    : false

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
          throw new Error(
            'Search for a model, or enter a manufacturer and model to add one',
          )
        }
        const model = await findOrCreateModel({
          data: {
            manufacturerName: newManufacturer,
            model: newModel,
            commonName: newCommonName,
            categoryClass: newCategoryClass,
            highPerformance: newHighPerformance,
            tailwheel: newTailwheel,
            engineType: newEngineType,
            minimumAvionics: newMinimumAvionics,
            flaps: newFlaps,
            controllablePitchProp: newControllablePitchProp,
            retractableGear: newRetractableGear,
            icao: newIcao,
            typeDesignDesignator: newTypeDesignDesignator,
          },
        })
        setSelectedModel(model)
        setCreatingModel(false)
        return model
      },
      reset() {
        setQuery(suggestedModel?.commonName ?? '')
        setSelectedModel(null)
        setCreatingModel(false)
        setNewManufacturer(suggestedModel?.manufacturerName ?? initialManufacturer ?? '')
        setNewModel(suggestedModel?.model ?? '')
        setNewCommonName(suggestedModel?.commonName ?? '')
        setNewCategoryClass(suggestedModel?.categoryClass ?? 'airplane_single_engine_land')
        setNewHighPerformance(suggestedModel?.highPerformance ?? false)
        setNewTailwheel(suggestedModel?.tailwheel ?? false)
        setNewEngineType(suggestedModel?.engineType ?? '')
        setNewMinimumAvionics('')
        setNewFlaps(suggestedModel?.flaps ?? false)
        setNewControllablePitchProp(suggestedModel?.controllablePitchProp ?? false)
        setNewRetractableGear(suggestedModel?.retractableGear ?? false)
        setNewIcao(suggestedModel?.icao ?? '')
        setNewTypeDesignDesignator('')
      },
    }),
    [
      selectedModel,
      newManufacturer,
      newModel,
      newCommonName,
      newCategoryClass,
      newHighPerformance,
      newTailwheel,
      newEngineType,
      newMinimumAvionics,
      newFlaps,
      newControllablePitchProp,
      newRetractableGear,
      newIcao,
      newTypeDesignDesignator,
      initialManufacturer,
      suggestedModel,
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
              <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                Model
              </label>
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
            <div className="flex min-w-24 flex-col gap-1">
              <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                ICAO type
              </label>
              <input
                value={newIcao}
                onChange={(e) => setNewIcao(e.target.value.toUpperCase())}
                placeholder="C172"
                className={`${fieldClass} uppercase`}
              />
            </div>
            <div className="flex min-w-32 flex-col gap-1">
              <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                Type design designator
              </label>
              <input
                value={newTypeDesignDesignator}
                onChange={(e) => setNewTypeDesignDesignator(e.target.value.toUpperCase())}
                placeholder="CL-600-2B19"
                className={`${fieldClass} uppercase`}
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
            <div className="flex min-w-40 flex-col gap-1">
              <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                Engine type
              </label>
              <select
                value={newEngineType}
                onChange={(e) => setNewEngineType(e.target.value)}
                className={fieldClass}
              >
                <option value="">None (glider, training device, …)</option>
                {ENGINE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ENGINE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-44 flex-col gap-1">
              <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
                Minimum avionics
              </label>
              <select
                value={newMinimumAvionics}
                onChange={(e) => setNewMinimumAvionics(e.target.value)}
                className={fieldClass}
              >
                <option value="">Unknown</option>
                {MINIMUM_AVIONICS.map((a) => (
                  <option key={a} value={a}>
                    {MINIMUM_AVIONICS_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={newFlaps}
                onChange={(e) => setNewFlaps(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
              />
              Flaps
            </label>
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={newControllablePitchProp}
                onChange={(e) => setNewControllablePitchProp(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
              />
              Controllable pitch prop
            </label>
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={newRetractableGear}
                onChange={(e) => setNewRetractableGear(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
              />
              Retractable gear
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
          <p className="text-[11px] text-ink-dim">
            {computedComplex
              ? 'Complex (14 CFR 61.31(e)): flaps, controllable pitch prop, and retractable gear.'
              : 'Not complex — flaps, a controllable pitch prop, and retractable gear (seaplanes exempt) are all required.'}
          </p>
          {!!suggestedModel && (
            <p className="text-[11px] text-ink-dim">
              Suggested from a known model designator ({suggestedModel.match}) — change if wrong.
            </p>
          )}
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
                <div className="px-2.5 py-2 text-[12.5px] text-ink-dim">
                  Searching…
                </div>
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
                      {isCategoryClass(m.categoryClass)
                        ? CATEGORY_CLASS_LABELS[m.categoryClass]
                        : m.categoryClass}
                    </span>
                  </button>
                ))}
              {!searching && results.length === 0 && (
                <div className="px-2.5 py-2 text-[12.5px] text-ink-dim">
                  No matches
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  // Only seed the manufacturer field from the raw search
                  // text when there's no suggestion already filling in the
                  // real manufacturer/model/etc — otherwise this would
                  // clobber "Bombardier" with "CRJ 700" itself.
                  if (!suggestedModel) setNewManufacturer(query)
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
})
