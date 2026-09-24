import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { mergeManufacturers, mergeModels } from '#/lib/server/admin'
import { searchManufacturers } from '#/lib/server/manufacturers'
import { searchModels } from '#/lib/server/models'

import type { ManufacturerItem } from '#/lib/server/manufacturers'
import type { AircraftModelItem } from '#/lib/server/models'

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context: { isAdmin } }) => {
    if (!isAdmin) throw redirect({ to: '/' })
  },
  component: AdminPage,
})

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-accent'

type Entity = { id: string; label: string }

/**
 * Search-to-select control for picking one row (manufacturer or model) out
 * of the shared catalog — a stripped-down, selection-only sibling of
 * ModelPicker (no "add new" fallback, since a merge only ever operates on
 * two rows that already exist).
 */
function EntityPicker<T extends { id: string }>({
  label,
  search,
  toEntity,
  selected,
  onSelect,
}: {
  label: string
  search: (query: string) => Promise<Array<T>>
  toEntity: (item: T) => Entity
  selected: Entity | null
  onSelect: (entity: Entity | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<Entity>>([])
  const [searching, setSearching] = useState(false)

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (!value.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    search(value)
      .then((items) => setResults(items.map(toEntity)))
      .finally(() => setSearching(false))
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold tracking-wide text-ink-dim">
        {label}
      </label>
      {selected ? (
        <div className="flex h-8 items-center justify-between rounded-md border border-accent bg-[#eef3f9] px-2.5 text-[13px] text-ink">
          <span>{selected.label}</span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[11px] font-medium text-ink-dim hover:text-ink"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search…"
            className={`${fieldClass} w-full`}
          />
          {query.trim() && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border-strong bg-surface shadow-sm">
              {searching && (
                <div className="px-2.5 py-2 text-[12.5px] text-ink-dim">Searching…</div>
              )}
              {!searching && results.length === 0 && (
                <div className="px-2.5 py-2 text-[12.5px] text-ink-dim">No matches</div>
              )}
              {!searching &&
                results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onSelect(r)
                      setQuery('')
                      setResults([])
                    }}
                    className="flex w-full items-center px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-alt"
                  >
                    {r.label}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function manufacturerToEntity(m: ManufacturerItem): Entity {
  return { id: m.id, label: m.name }
}

function modelToEntity(m: AircraftModelItem): Entity {
  return {
    id: m.id,
    label: `${m.manufacturerName} ${m.model}${m.commonName ? ` (${m.commonName})` : ''}`,
  }
}

function MergeManufacturersCard() {
  const [loser, setLoser] = useState<Entity | null>(null)
  const [survivor, setSurvivor] = useState<Entity | null>(null)
  const [merging, setMerging] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  const canMerge = !!loser && !!survivor && loser.id !== survivor.id

  const handleMerge = async () => {
    if (!loser || !survivor) return
    setError('')
    setResult('')
    setMerging(true)
    try {
      const res = await mergeManufacturers({ data: { loserId: loser.id, survivorId: survivor.id } })
      setResult(`Merged. Repointed ${res.modelsRepointed} model(s) to ${survivor.label}.`)
      setLoser(null)
      setSurvivor(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge manufacturers')
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="text-sm font-semibold text-ink">Merge manufacturers</div>
      <p className="text-[11px] text-ink-dim">
        Every aircraft model on the losing manufacturer is repointed to the survivor, then the
        losing manufacturer is deleted. Cannot be undone.
      </p>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <EntityPicker
            label="Losing manufacturer (deleted)"
            search={(query) => searchManufacturers({ data: { query } })}
            toEntity={manufacturerToEntity}
            selected={loser}
            onSelect={setLoser}
          />
        </div>
        <div className="min-w-56 flex-1">
          <EntityPicker
            label="Surviving manufacturer"
            search={(query) => searchManufacturers({ data: { query } })}
            toEntity={manufacturerToEntity}
            selected={survivor}
            onSelect={setSurvivor}
          />
        </div>
      </div>
      {loser && survivor && loser.id === survivor.id && (
        <p className="text-[11px] text-status-bad">Pick two different manufacturers.</p>
      )}
      {!!error && <p className="text-[11px] text-status-bad">{error}</p>}
      {!!result && <p className="text-[11px] text-status-good">{result}</p>}
      <button
        type="button"
        onClick={handleMerge}
        disabled={!canMerge || merging}
        className="flex h-8 w-fit items-center rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {merging ? 'Merging…' : 'Merge'}
      </button>
    </div>
  )
}

function MergeModelsCard() {
  const [loser, setLoser] = useState<Entity | null>(null)
  const [survivor, setSurvivor] = useState<Entity | null>(null)
  const [merging, setMerging] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  const canMerge = !!loser && !!survivor && loser.id !== survivor.id

  const handleMerge = async () => {
    if (!loser || !survivor) return
    setError('')
    setResult('')
    setMerging(true)
    try {
      const res = await mergeModels({ data: { loserId: loser.id, survivorId: survivor.id } })
      setResult(
        `Merged. Repointed ${res.aircraftRepointed} aircraft and ${res.reportsRepointed} report(s) to ${survivor.label}.`,
      )
      setLoser(null)
      setSurvivor(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge models')
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="text-sm font-semibold text-ink">Merge aircraft models</div>
      <p className="text-[11px] text-ink-dim">
        Every aircraft (and any open report) on the losing model is repointed to the survivor,
        then the losing model is deleted. Pilots whose flights snapshot the losing model may get
        a reclassification email, same as any other model correction. Frozen flight snapshots are
        never touched. Cannot be undone.
      </p>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <EntityPicker
            label="Losing model (deleted)"
            search={(query) => searchModels({ data: { query } })}
            toEntity={modelToEntity}
            selected={loser}
            onSelect={setLoser}
          />
        </div>
        <div className="min-w-56 flex-1">
          <EntityPicker
            label="Surviving model"
            search={(query) => searchModels({ data: { query } })}
            toEntity={modelToEntity}
            selected={survivor}
            onSelect={setSurvivor}
          />
        </div>
      </div>
      {loser && survivor && loser.id === survivor.id && (
        <p className="text-[11px] text-status-bad">Pick two different models.</p>
      )}
      {!!error && <p className="text-[11px] text-status-bad">{error}</p>}
      {!!result && <p className="text-[11px] text-status-good">{result}</p>}
      <button
        type="button"
        onClick={handleMerge}
        disabled={!canMerge || merging}
        className="flex h-8 w-fit items-center rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {merging ? 'Merging…' : 'Merge'}
      </button>
    </div>
  )
}

function AdminPage() {
  return (
    <>
      <div className="flex flex-shrink-0 flex-col gap-0.5 px-8 pt-6">
        <div className="text-lg font-semibold tracking-tight text-ink">Admin</div>
        <div className="text-xs text-ink-dim">Catalog merge tooling</div>
      </div>

      <div className="flex flex-col gap-4 px-8 pt-4.5 pb-6">
        <MergeModelsCard />
        <MergeManufacturersCard />
      </div>
    </>
  )
}
