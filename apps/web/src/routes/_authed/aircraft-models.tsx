import { useState } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import {
  CATEGORY_CLASSES,
  CATEGORY_CLASS_LABELS,
  ENGINE_TYPES,
  ENGINE_TYPE_LABELS,
  MINIMUM_AVIONICS_LABELS,
  isCategoryClass,
  isMinimumAvionics,
} from '@logbook/core'

import { ReportModelIssue } from '#/components/report-model-issue'
import { manufacturersQueryOptions, modelsQueryOptions } from '#/lib/queries/models'

import type { AircraftModelItem } from '#/lib/server/models'

export const Route = createFileRoute('/_authed/aircraft-models')({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(manufacturersQueryOptions()),
      queryClient.ensureQueryData(modelsQueryOptions({ page: 1 })),
    ])
  },
  component: AircraftModelsPage,
})

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-accent'

function modelBadges(m: AircraftModelItem): Array<string> {
  return [
    m.complex ? 'Complex' : null,
    m.highPerformance ? 'High performance' : null,
    m.tailwheel ? 'Tailwheel' : null,
    m.minimumAvionics && isMinimumAvionics(m.minimumAvionics)
      ? MINIMUM_AVIONICS_LABELS[m.minimumAvionics]
      : null,
  ].filter((label): label is string => !!label)
}

function AircraftModelsPage() {
  const { data: manufacturers } = useSuspenseQuery(manufacturersQueryOptions())

  const [manufacturerId, setManufacturerId] = useState('')
  const [categoryClass, setCategoryClass] = useState('')
  const [engineType, setEngineType] = useState('')
  const [page, setPage] = useState(1)
  const [reportingId, setReportingId] = useState<string | null>(null)

  const filters = {
    page,
    manufacturerId: manufacturerId || undefined,
    categoryClass: categoryClass || undefined,
    engineType: engineType || undefined,
  }
  const { data, isFetching } = useQuery({
    ...modelsQueryOptions(filters),
    placeholderData: (prev) => prev,
  })

  const resetToFirstPage = (apply: () => void) => {
    apply()
    setPage(1)
  }

  return (
    <>
      <div className="flex flex-shrink-0 flex-col gap-0.5 px-8 pt-6">
        <div className="text-lg font-semibold tracking-tight text-ink">
          Aircraft catalog
        </div>
        <div className="text-xs text-ink-dim">
          Browse the shared manufacturer/model catalog
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 px-8 pt-4.5 pb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={manufacturerId}
            onChange={(e) =>
              resetToFirstPage(() => setManufacturerId(e.target.value))
            }
            className={fieldClass}
          >
            <option value="">All manufacturers</option>
            {manufacturers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={categoryClass}
            onChange={(e) =>
              resetToFirstPage(() => setCategoryClass(e.target.value))
            }
            className={fieldClass}
          >
            <option value="">All category/classes</option>
            {CATEGORY_CLASSES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_CLASS_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={engineType}
            onChange={(e) =>
              resetToFirstPage(() => setEngineType(e.target.value))
            }
            className={fieldClass}
          >
            <option value="">All engine types</option>
            {ENGINE_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENGINE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-grow overflow-auto rounded-lg border border-border bg-surface">
          {!data || data.items.length === 0 ? (
            <div className="px-3.5 py-8 text-center text-sm text-ink-dim">
              {isFetching ? 'Loading…' : 'No models match these filters.'}
            </div>
          ) : (
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-alt text-[10.5px] font-semibold text-ink-dim">
                  <th className="px-3.5 py-2">Manufacturer</th>
                  <th className="px-2.5 py-2">Model</th>
                  <th className="px-2.5 py-2">Category/class</th>
                  <th className="px-2.5 py-2">Details</th>
                  <th className="px-3.5 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => {
                  const badges = modelBadges(m)
                  return (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3.5 py-2 font-medium text-ink">
                        {m.manufacturerName}
                      </td>
                      <td className="px-2.5 py-2 text-ink-dim">
                        {m.model}
                        {m.commonName ? ` (${m.commonName})` : ''}
                      </td>
                      <td className="px-2.5 py-2 text-ink-dim">
                        {isCategoryClass(m.categoryClass)
                          ? CATEGORY_CLASS_LABELS[m.categoryClass]
                          : m.categoryClass}
                      </td>
                      <td className="px-2.5 py-2">
                        {badges.length === 0 ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {badges.map((label) => (
                              <span
                                key={label}
                                className="rounded border border-border-strong bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-dim uppercase"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2 text-right">
                        {reportingId === m.id ? (
                          <ReportModelIssue modelId={m.id} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReportingId(m.id)}
                            className="text-[11px] font-medium text-ink-dim hover:text-ink"
                          >
                            Report a problem
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {!!data && data.totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-ink-dim">
            <span>
              Page {data.page} of {data.totalPages} ({data.totalItems} models)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-ink-dim disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-ink-dim disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
