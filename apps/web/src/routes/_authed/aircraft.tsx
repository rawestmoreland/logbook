import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { CATEGORY_CLASS_LABELS, isCategoryClass } from '@logbook/core'

import { AircraftForm } from '#/components/aircraft-form'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { deleteAircraft } from '#/lib/server/aircraft'

import type { AircraftListItem } from '#/lib/server/aircraft'

export const Route = createFileRoute('/_authed/aircraft')({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(aircraftQueryOptions())
  },
  component: AircraftPage,
})

function sortByTailNumber(list: Array<AircraftListItem>): Array<AircraftListItem> {
  return [...list].sort((a, b) => a.tailNumber.localeCompare(b.tailNumber))
}

function AircraftPage() {
  const queryClient = useQueryClient()
  const { data: aircraftList } = useSuspenseQuery(aircraftQueryOptions())

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const handleCreated = (aircraft: AircraftListItem) => {
    queryClient.setQueryData(aircraftQueryOptions().queryKey, (old: Array<AircraftListItem> = []) =>
      sortByTailNumber([...old, aircraft]),
    )
    setShowAddForm(false)
  }

  const handleUpdated = (aircraft: AircraftListItem) => {
    queryClient.setQueryData(aircraftQueryOptions().queryKey, (old: Array<AircraftListItem> = []) =>
      sortByTailNumber(old.map((a) => (a.id === aircraft.id ? aircraft : a))),
    )
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    setDeleteError('')
    setDeletingId(id)
    try {
      await deleteAircraft({ data: { id } })
      queryClient.setQueryData(aircraftQueryOptions().queryKey, (old: Array<AircraftListItem> = []) =>
        old.filter((a) => a.id !== id),
      )
      setConfirmingDeleteId(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete aircraft')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">Aircraft</div>
          <div className="text-xs text-ink-dim">
            {aircraftList.length} {aircraftList.length === 1 ? 'aircraft' : 'aircraft'} in your fleet
          </div>
        </div>
        <div className="flex-grow" />
        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            + Add aircraft
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 px-8 pt-4.5 pb-6">
        {showAddForm && (
          <AircraftForm
            mode="create"
            showAdvanced
            onCancel={() => setShowAddForm(false)}
            onSaved={handleCreated}
          />
        )}

        <div className="flex min-h-0 flex-grow flex-col gap-2.5 overflow-auto">
          {aircraftList.length === 0 && !showAddForm && (
            <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
              No aircraft yet. Add one to get started.
            </div>
          )}

          {aircraftList.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-surface p-4">
              {editingId === a.id ? (
                <AircraftForm
                  mode="edit"
                  aircraft={a}
                  showAdvanced
                  onCancel={() => setEditingId(null)}
                  onSaved={handleUpdated}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex min-w-0 flex-grow flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-sm font-medium text-ink">{a.tailNumber}</span>
                      <span className="text-[12.5px] text-ink-dim">{a.type}</span>
                      <span className="text-[11px] text-ink-faint">
                        {isCategoryClass(a.categoryClass)
                          ? CATEGORY_CLASS_LABELS[a.categoryClass]
                          : a.categoryClass}
                      </span>
                    </div>
                    {(a.complex || a.highPerformance || a.tailwheel) && (
                      <div className="flex flex-wrap gap-1.5">
                        {a.complex && <Badge label="Complex" />}
                        {a.highPerformance && <Badge label="High performance" />}
                        {a.tailwheel && <Badge label="Tailwheel" />}
                      </div>
                    )}
                  </div>

                  {confirmingDeleteId === a.id ? (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="text-xs text-ink-dim">Delete {a.tailNumber}?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        disabled={deletingId === a.id}
                        className="flex h-7.5 items-center rounded-md bg-status-bad px-3 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {deletingId === a.id ? 'Deleting…' : 'Confirm delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink-dim"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(a.id)}
                        className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(a.id)}
                        className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-status-bad"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {!!deleteError && <p className="text-xs text-status-bad">{deleteError}</p>}
      </div>
    </>
  )
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded border border-border-strong bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-dim uppercase">
      {label}
    </span>
  )
}
