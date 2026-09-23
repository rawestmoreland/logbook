import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { CATEGORY_CLASS_LABELS, ENGINE_TYPE_LABELS } from '@logbook/core'

import { syncAircraftToCurrentClassification } from '#/lib/server/aircraft'

import type { AircraftTypeInfo } from '@logbook/core'
import type { AircraftListItem, SyncAircraftClassificationResult } from '#/lib/server/aircraft'

/**
 * Every query whose data reads a flight's `logged_*` snapshot (directly or
 * through `resolveAircraftType`), so it refetches once a sync rewrites it.
 */
const SNAPSHOT_DEPENDENT_QUERY_KEYS = [
  'aircraft',
  'currency',
  'analysis',
  'check-flights',
  'flights',
  'flights-page',
  'flights-summary',
  'flight',
  'pending-flights',
]

function describeType(type: AircraftTypeInfo): string {
  return [
    type.description,
    CATEGORY_CLASS_LABELS[type.categoryClass],
    type.engineType ? ENGINE_TYPE_LABELS[type.engineType] : null,
    type.complex ? 'Complex' : null,
    type.highPerformance ? 'High performance' : null,
    type.tailwheel ? 'Tailwheel' : null,
  ]
    .filter((part): part is string => !!part)
    .join(' · ')
}

function pluralFlights(n: number): string {
  return `${n} ${n === 1 ? 'flight' : 'flights'}`
}

/**
 * Confirm step for the fleet page's "sync to current classification" action
 * (issue #71): shows how many of the pilot's flights on this aircraft would
 * be re-snapshotted, what they were logged as vs. what the aircraft's model
 * says now, and — since it's the whole point, but easy to miss — that this
 * retroactively changes how those flights count toward part 61 currency.
 */
export function AircraftSyncConfirm({
  pilotId,
  aircraft,
  onCancel,
  onSynced,
}: {
  pilotId: string
  aircraft: AircraftListItem
  onCancel: () => void
  onSynced: (result: SyncAircraftClassificationResult) => void
}) {
  const queryClient = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const drift = aircraft.classificationDrift
  if (!drift) return null

  const handleSync = async () => {
    setError('')
    setSyncing(true)
    try {
      const result = await syncAircraftToCurrentClassification({ data: { pilotId, aircraftId: aircraft.id } })
      await queryClient.invalidateQueries({
        predicate: (query) => SNAPSHOT_DEPENDENT_QUERY_KEYS.includes(String(query.queryKey[0])),
      })
      if (result.failed > 0) {
        setError(
          `Updated ${pluralFlights(result.updated)}, but ${pluralFlights(result.failed)} could not be updated. Try again to retry the rest.`,
        )
        return
      }
      onSynced(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync flights')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-status-warn/30 bg-status-warn/5 p-4">
      <div className="flex flex-col gap-0.5">
        <div className="text-sm font-semibold text-ink">
          Sync {aircraft.displayTailNumber} to current classification
        </div>
        <div className="text-xs text-ink-dim">
          This aircraft's model data has changed since {pluralFlights(drift.flightCount)} on it{' '}
          {drift.flightCount === 1 ? 'was' : 'were'} logged. Those flights still record the aircraft as it was
          when you logged them.
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-xs">
        {drift.from.map((group) => (
          <div key={describeType(group.type)} className="flex flex-col gap-0.5">
            <div className="text-ink-dim">
              <span className="font-mono text-ink">{pluralFlights(group.flightCount)}</span> logged as
            </div>
            <div className="pl-3 text-ink-dim line-through decoration-ink-faint">{describeType(group.type)}</div>
          </div>
        ))}
        <div className="flex flex-col gap-0.5">
          <div className="text-ink-dim">will be updated to</div>
          <div className="pl-3 font-medium text-ink">{describeType(drift.to)}</div>
        </div>
      </div>

      <p className="text-xs font-medium text-status-warn">
        This may change your part 61 currency, totals and flight checks for {pluralFlights(drift.flightCount)}{' '}
        already in your logbook. It can't be undone automatically.
      </p>

      {!!error && <p className="text-xs text-status-bad">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="flex h-8 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {syncing ? 'Syncing…' : `Sync ${pluralFlights(drift.flightCount)}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={syncing}
          className="flex h-8 items-center rounded-md border border-border-strong px-3.5 text-sm font-medium text-ink-dim"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
