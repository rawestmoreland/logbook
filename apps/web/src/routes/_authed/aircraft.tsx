import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createColumnHelper, useTable } from '@tanstack/react-table'

import { AIRCRAFT_INSTANCE_TYPE_LABELS, CATEGORY_CLASS_LABELS, isAircraftInstanceType, isCategoryClass } from '@logbook/core'

import { AircraftCsvImport } from '#/components/aircraft-csv-import'
import { AircraftForm } from '#/components/aircraft-form'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { removeAircraftFromFleet } from '#/lib/server/aircraft'
import { resolveCellClassName, tableFeaturesWithMeta } from '#/lib/table'

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

function formatLastFlown(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function aircraftDetailBadges(a: AircraftListItem): Array<string> {
  return [
    a.instanceType !== 'real'
      ? isAircraftInstanceType(a.instanceType)
        ? AIRCRAFT_INSTANCE_TYPE_LABELS[a.instanceType]
        : a.instanceType
      : null,
    a.complex ? 'Complex' : null,
    a.highPerformance ? 'High performance' : null,
    a.tailwheel ? 'Tailwheel' : null,
  ].filter((label): label is string => !!label)
}

const aircraftFeatures = tableFeaturesWithMeta<AircraftListItem>()
const aircraftColumnHelper = createColumnHelper<typeof aircraftFeatures, AircraftListItem>()

function AircraftPage() {
  const { pilotId } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const { data: aircraftList } = useSuspenseQuery(aircraftQueryOptions(pilotId))

  const [showAddForm, setShowAddForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
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

  const columns = aircraftColumnHelper.columns([
    aircraftColumnHelper.accessor('displayTailNumber', {
      header: 'Tail number',
      meta: {
        headerClassName: 'px-3.5 py-2 font-semibold',
        cellClassName: 'px-3.5 py-2 font-mono text-sm font-medium text-ink',
      },
    }),
    aircraftColumnHelper.accessor('type', {
      header: 'Aircraft',
      meta: {
        headerClassName: 'px-2.5 py-2 font-semibold',
        cellClassName: 'px-2.5 py-2 text-ink-dim',
      },
    }),
    aircraftColumnHelper.display({
      id: 'categoryClass',
      header: 'Category/class',
      cell: (info) => {
        const cc = info.row.original.categoryClass
        return isCategoryClass(cc) ? CATEGORY_CLASS_LABELS[cc] : cc
      },
      meta: {
        headerClassName: 'px-2.5 py-2 font-semibold',
        cellClassName: 'px-2.5 py-2 text-ink-dim',
      },
    }),
    aircraftColumnHelper.display({
      id: 'details',
      header: 'Details',
      cell: (info) => {
        const badges = aircraftDetailBadges(info.row.original)
        if (badges.length === 0) return <span className="text-ink-faint">—</span>
        return (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((label) => (
              <Badge key={label} label={label} />
            ))}
          </div>
        )
      },
      meta: {
        headerClassName: 'px-2.5 py-2 font-semibold',
        cellClassName: 'px-2.5 py-2',
      },
    }),
    aircraftColumnHelper.accessor('flightCount', {
      header: 'Flights',
      meta: {
        headerClassName: 'px-2.5 py-2 text-right font-semibold',
        cellClassName: (a) =>
          `px-2.5 py-2 text-right font-mono ${a.flightCount === 0 ? 'text-ink-zero' : 'text-ink'}`,
      },
    }),
    aircraftColumnHelper.accessor('lastFlownDate', {
      header: 'Last flown',
      cell: (info) => formatLastFlown(info.getValue()),
      meta: {
        headerClassName: 'px-2.5 py-2 text-right font-semibold',
        cellClassName: (a) =>
          `px-2.5 py-2 text-right font-mono ${a.lastFlownDate ? 'text-ink-dim' : 'text-ink-faint'}`,
      },
    }),
    aircraftColumnHelper.display({
      id: 'actions',
      cell: (info) => {
        const a = info.row.original
        if (confirmingRemoveId === a.pilotAircraftId) {
          return (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-ink-dim">Remove?</span>
              <button
                type="button"
                onClick={() => handleRemove(a.pilotAircraftId)}
                disabled={removingId === a.pilotAircraftId}
                className="flex h-7 items-center rounded-md bg-status-bad px-2.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {removingId === a.pilotAircraftId ? 'Removing…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemoveId(null)}
                className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-ink-dim"
              >
                Cancel
              </button>
            </div>
          )
        }
        return (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setConfirmingRemoveId(a.pilotAircraftId)}
              className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-status-bad"
            >
              Remove
            </button>
          </div>
        )
      },
      meta: { headerClassName: 'px-3.5 py-2', cellClassName: 'px-3.5 py-2' },
    }),
  ])

  const table = useTable({
    features: aircraftFeatures,
    data: aircraftList,
    columns,
    getRowId: (a) => a.pilotAircraftId,
  })

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
        {!showAddForm && !showImport && (
          <>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-alt"
            >
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              + Add aircraft
            </button>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 px-8 pt-4.5 pb-6">
        {showAddForm && (
          <AircraftForm pilotId={pilotId} onCancel={() => setShowAddForm(false)} onSaved={handleCreated} />
        )}
        {showImport && <AircraftCsvImport pilotId={pilotId} onClose={() => setShowImport(false)} />}

        <div className="min-h-0 flex-grow overflow-auto rounded-lg border border-border bg-surface">
          {aircraftList.length === 0 && !showAddForm ? (
            <div className="px-3.5 py-8 text-center text-sm text-ink-dim">
              No aircraft yet. Add one to get started.
            </div>
          ) : (
            <table className="w-full text-left text-[12.5px]">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="border-b border-border bg-surface-alt text-[10.5px] font-semibold text-ink-dim"
                  >
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className={header.column.columnDef.meta?.headerClassName}>
                        <table.FlexRender header={header} />
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className={resolveCellClassName(cell.column.columnDef.meta, row.original)}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
