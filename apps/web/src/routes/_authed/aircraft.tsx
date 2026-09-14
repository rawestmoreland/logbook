import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { AIRCRAFT_INSTANCE_TYPE_LABELS, CATEGORY_CLASS_LABELS, isAircraftInstanceType, isCategoryClass } from '@logbook/core'

import { AircraftForm } from '#/components/aircraft-form'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { removeAircraftFromFleet } from '#/lib/server/aircraft'

import type { AircraftListItem } from '#/lib/server/aircraft'

export const Route = createFileRoute('/_authed/aircraft')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(aircraftQueryOptions(pilotId))
  },
  component: AircraftPage,
})

function sortByTailNumber(list: Array<AircraftListItem>): Array<AircraftListItem> {
  return [...list].sort((a, b) => a.displayTailNumber.localeCompare(b.displayTailNumber))
}

function AircraftPage() {
  const { pilotId } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const { data: aircraftList } = useSuspenseQuery(aircraftQueryOptions(pilotId))

  const [showAddForm, setShowAddForm] = useState(false)
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState('')

  const handleCreated = (aircraft: AircraftListItem) => {
    queryClient.setQueryData(
      aircraftQueryOptions(pilotId).queryKey,
      (old: Array<AircraftListItem> = []) =>
        old.some((a) => a.id === aircraft.id)
          ? old
          : sortByTailNumber([...old, aircraft]),
    )
    setShowAddForm(false)
  }

  const handleRemove = async (pilotAircraftId: string) => {
    setRemoveError('')
    setRemovingId(pilotAircraftId)
    try {
      await removeAircraftFromFleet({ data: { pilotAircraftId } })
      queryClient.setQueryData(
        aircraftQueryOptions(pilotId).queryKey,
        (old: Array<AircraftListItem> = []) =>
          old.filter((a) => a.pilotAircraftId !== pilotAircraftId),
      )
      setConfirmingRemoveId(null)
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove aircraft')
    } finally {
      setRemovingId(null)
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
          <AircraftForm pilotId={pilotId} onCancel={() => setShowAddForm(false)} onSaved={handleCreated} />
        )}

        <div className="flex min-h-0 flex-grow flex-col gap-2.5 overflow-auto">
          {aircraftList.length === 0 && !showAddForm && (
            <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
              No aircraft yet. Add one to get started.
            </div>
          )}

          {aircraftList.map((a) => (
            <div key={a.pilotAircraftId} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex min-w-0 flex-grow flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-sm font-medium text-ink">
                      {a.displayTailNumber}
                    </span>
                    <span className="text-[12.5px] text-ink-dim">{a.type}</span>
                    <span className="text-[11px] text-ink-faint">
                      {isCategoryClass(a.categoryClass)
                        ? CATEGORY_CLASS_LABELS[a.categoryClass]
                        : a.categoryClass}
                    </span>
                  </div>
                  {(a.complex ||
                    a.highPerformance ||
                    a.tailwheel ||
                    a.instanceType !== 'real') && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.instanceType !== 'real' && (
                        <Badge
                          label={
                            isAircraftInstanceType(a.instanceType)
                              ? AIRCRAFT_INSTANCE_TYPE_LABELS[a.instanceType]
                              : a.instanceType
                          }
                        />
                      )}
                      {a.complex && <Badge label="Complex" />}
                      {a.highPerformance && <Badge label="High performance" />}
                      {a.tailwheel && <Badge label="Tailwheel" />}
                    </div>
                  )}
                </div>

                {confirmingRemoveId === a.pilotAircraftId ? (
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="text-xs text-ink-dim">Remove {a.displayTailNumber}?</span>
                    <button
                      type="button"
                      onClick={() => handleRemove(a.pilotAircraftId)}
                      disabled={removingId === a.pilotAircraftId}
                      className="flex h-7.5 items-center rounded-md bg-status-bad px-3 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {removingId === a.pilotAircraftId ? 'Removing…' : 'Confirm remove'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemoveId(null)}
                      className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink-dim"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingRemoveId(a.pilotAircraftId)}
                      className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-status-bad"
                    >
                      Remove from fleet
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {!!removeError && <p className="text-xs text-status-bad">{removeError}</p>}
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
