import { memo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createColumnHelper, useTable } from '@tanstack/react-table'

import { AutoResolvedSection, UnresolvedTailRow } from '#/components/tail-resolution'
import { resolveCellClassName, tableFeaturesWithMeta } from '#/lib/table'
import { commitImportFlights, previewImport, resolveImportAircraft } from '#/lib/server/import'
import { findOrCreateModel } from '#/lib/server/models'

import type { ImportPreviewResult, ImportResolution } from '#/lib/server/import'

export const Route = createFileRoute('/_authed/import')({
  component: ImportPage,
})

type Stage = 'pick' | 'preview' | 'summary'

type ImportSummary = {
  flightsImported: number
  aircraftCreated: number
  aircraftMatched: number
  skipped: Array<{ row: number; reason: string }>
}

// `commitImportFlights` batches flight creation internally (PocketBase's own
// batch endpoint caps operations per call — see import.ts), but that only
// bounds subrequests *within* one call. A large enough file still needs more
// flight-batch calls than a single Cloudflare Workers invocation can make
// while staying under the free tier's 50-subrequest ceiling, so the client
// makes multiple `commitImportFlights` calls instead of one — each handling
// up to this many rows, comfortably fewer than 50 batch calls even at the
// default 50-per-batch chunk size (1500 / 50 = 30).
const FLIGHT_COMMIT_CHUNK_SIZE = 1500

function ImportPage() {
  const { pilotId } = Route.useRouteContext()
  const queryClient = useQueryClient()

  const [stage, setStage] = useState<Stage>('pick')
  const [fileName, setFileName] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution | undefined>>({})

  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const handleFile = async (file: File) => {
    setLoadError('')
    setFileName(file.name)
    setLoadingPreview(true)
    try {
      const csvText = await file.text()
      const result = await previewImport({ data: { pilotId, csvText } })
      setPreview(result)
      // Confidently-matched tails (see `AutoResolvedTail`) start pre-resolved
      // — the pilot can still override any of them in the preview before
      // committing, same as a manually-resolved one.
      const initialResolutions: Record<string, ImportResolution> = {}
      for (const t of result.autoResolvedTails) {
        initialResolutions[t.tailKey] = {
          modelId: t.modelId,
          instanceType: t.suggestedInstanceType ?? 'real',
        }
      }
      setResolutions(initialResolutions)
      setStage('preview')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read that file')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleResolved = (tailKey: string, resolution: ImportResolution) => {
    setResolutions((prev) => ({ ...prev, [tailKey]: resolution }))
  }

  // TEMPORARY (this branch only): bulk-accept every unresolved tail's
  // alias suggestion (findAircraftModelAlias) instead of clicking
  // "Resolve" one tail at a time — built for importing a real logbook
  // export with 250+ distinct CRJ tails, all sharing just 3 underlying
  // model identities. One findOrCreateModel call per distinct suggestion
  // (keyed by icao, falling back to manufacturer+model), reused across
  // every tail whose suggestion resolves to it, so e.g. every "Canadair
  // CL-600-2B19" tail costs one network call, not one per tail.
  const [autoResolving, setAutoResolving] = useState(false)
  const [autoResolveError, setAutoResolveError] = useState('')

  const suggestedUnresolvedCount = preview
    ? preview.unresolvedTails.filter((t) => t.suggestedModel && !resolutions[t.tailKey]).length
    : 0

  const handleAutoResolveSuggested = async () => {
    if (!preview) return
    setAutoResolveError('')
    setAutoResolving(true)
    try {
      const modelIdByAliasKey = new Map<string, string>()
      const updates: Record<string, ImportResolution> = {}

      for (const tail of preview.unresolvedTails) {
        if (resolutions[tail.tailKey]) continue
        const suggestion = tail.suggestedModel
        if (!suggestion) continue

        const aliasKey = suggestion.icao || `${suggestion.manufacturerName}|${suggestion.model}`
        let modelId = modelIdByAliasKey.get(aliasKey)
        if (!modelId) {
          const model = await findOrCreateModel({
            data: {
              manufacturerName: suggestion.manufacturerName,
              model: suggestion.model,
              commonName: suggestion.commonName,
              categoryClass: suggestion.categoryClass,
              highPerformance: suggestion.highPerformance,
              tailwheel: suggestion.tailwheel,
              engineType: suggestion.engineType,
              flaps: suggestion.flaps,
              controllablePitchProp: suggestion.controllablePitchProp,
              retractableGear: suggestion.retractableGear,
              icao: suggestion.icao,
            },
          })
          modelId = model.id
          modelIdByAliasKey.set(aliasKey, modelId)
        }
        updates[tail.tailKey] = { modelId, instanceType: tail.suggestedInstanceType ?? 'real' }
      }

      setResolutions((prev) => ({ ...prev, ...updates }))
    } catch (err) {
      setAutoResolveError(err instanceof Error ? err.message : 'Could not auto-resolve those tails')
    } finally {
      setAutoResolving(false)
    }
  }

  const allResolved = preview
    ? preview.unresolvedTails.every((t) => !!resolutions[t.tailKey])
    : false

  const handleCommit = async () => {
    if (!preview) return
    setCommitError('')
    setCommitting(true)
    setCommitProgress({ done: 0, total: preview.rows.length })
    try {
      const resolved = await resolveImportAircraft({
        data: {
          pilotId,
          rows: preview.rows.map((r) => ({ row: r.row, tailKey: r.tailKey, tailNumber: r.values.tailNumber })),
          resolutions,
        },
      })

      let flightsImported = 0
      const skipped: ImportSummary['skipped'] = []
      for (let i = 0; i < preview.rows.length; i += FLIGHT_COMMIT_CHUNK_SIZE) {
        const chunk = preview.rows.slice(i, i + FLIGHT_COMMIT_CHUNK_SIZE)
        const result = await commitImportFlights({
          data: {
            pilotId,
            rows: chunk,
            aircraftIdByTailKey: resolved.aircraftIdByTailKey,
            tailKeyErrors: resolved.tailKeyErrors,
          },
        })
        flightsImported += result.flightsImported
        skipped.push(...result.skipped)
        setCommitProgress({ done: Math.min(i + chunk.length, preview.rows.length), total: preview.rows.length })
      }

      setSummary({
        flightsImported,
        aircraftCreated: resolved.aircraftCreated,
        aircraftMatched: resolved.aircraftMatched,
        skipped,
      })
      setStage('summary')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flights', pilotId] }),
        queryClient.invalidateQueries({ queryKey: ['aircraft', pilotId] }),
      ])
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Could not import flights')
    } finally {
      setCommitting(false)
      setCommitProgress(null)
    }
  }

  const handleReset = () => {
    setStage('pick')
    setFileName('')
    setPreview(null)
    setResolutions({})
    setSummary(null)
    setLoadError('')
    setCommitError('')
    setCommitProgress(null)
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">Import</div>
          <div className="text-xs text-ink-dim">
            Import flights from a CSV file — your own exported logbook, or one you hand-write.
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 px-8 pt-4.5 pb-6">
        {stage === 'pick' && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
            <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong text-center hover:bg-surface-alt">
              <span className="text-sm font-medium text-ink">
                {loadingPreview ? 'Reading file…' : 'Choose a CSV file'}
              </span>
              <span className="text-[11px] text-ink-dim">
                Date, Tail Number, Model, From, To, Total Time, …
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={loadingPreview}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                  e.target.value = ''
                }}
              />
            </label>
            {!!loadError && <p className="text-xs text-status-bad">{loadError}</p>}
          </div>
        )}

        {stage === 'preview' && preview && (
          <PreviewStage
            fileName={fileName}
            preview={preview}
            resolutions={resolutions}
            onResolved={handleResolved}
            allResolved={allResolved}
            committing={committing}
            commitError={commitError}
            commitProgress={commitProgress}
            onCommit={handleCommit}
            onCancel={handleReset}
            suggestedUnresolvedCount={suggestedUnresolvedCount}
            autoResolving={autoResolving}
            autoResolveError={autoResolveError}
            onAutoResolveSuggested={handleAutoResolveSuggested}
          />
        )}

        {stage === 'summary' && summary && (
          <SummaryStage summary={summary} onImportAnother={handleReset} />
        )}
      </div>
    </>
  )
}

function PreviewStage({
  fileName,
  preview,
  resolutions,
  onResolved,
  allResolved,
  committing,
  commitError,
  commitProgress,
  onCommit,
  onCancel,
  suggestedUnresolvedCount,
  autoResolving,
  autoResolveError,
  onAutoResolveSuggested,
}: {
  fileName: string
  preview: ImportPreviewResult
  resolutions: Record<string, ImportResolution | undefined>
  onResolved: (tailKey: string, resolution: ImportResolution) => void
  allResolved: boolean
  committing: boolean
  commitError: string
  commitProgress: { done: number; total: number } | null
  onCommit: () => void
  onCancel: () => void
  suggestedUnresolvedCount: number
  autoResolving: boolean
  autoResolveError: string
  onAutoResolveSuggested: () => void
}) {
  const hasUnresolved = preview.unresolvedTails.length > 0
  const canCommit = preview.rows.length > 0 && allResolved && !committing

  const [tailFilter, setTailFilter] = useState('')
  const [hideResolved, setHideResolved] = useState(false)
  const resolvedCount = preview.unresolvedTails.filter((t) => !!resolutions[t.tailKey]).length
  const filter = tailFilter.trim().toLowerCase()
  const visibleUnresolvedTails = preview.unresolvedTails.filter((t) => {
    if (hideResolved && resolutions[t.tailKey]) return false
    if (!filter) return true
    return t.tailNumber.toLowerCase().includes(filter) || t.csvModel.toLowerCase().includes(filter)
  })

  return (
    <div className="flex min-h-0 flex-grow flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-medium text-ink">{fileName}</div>
          <div className="text-[11px] text-ink-dim">
            {preview.rows.length} {preview.rows.length === 1 ? 'row' : 'rows'} ready
            {preview.rowErrors.length > 0 && (
              <>
                {' '}
                · {preview.rowErrors.length} with errors
              </>
            )}
          </div>
        </div>
        <div className="flex-grow" />
        <button
          type="button"
          onClick={onCancel}
          className="flex h-8 items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-ink"
        >
          Choose a different file
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={!canCommit}
          className="flex h-8 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {committing
            ? commitProgress && commitProgress.total > 0
              ? `Importing ${commitProgress.done}/${commitProgress.total}…`
              : 'Importing…'
            : `Import ${preview.rows.length} ${preview.rows.length === 1 ? 'flight' : 'flights'}`}
        </button>
      </div>

      {!!commitError && <p className="text-xs text-status-bad">{commitError}</p>}

      {preview.autoResolvedTails.length > 0 && (
        <AutoResolvedSection
          autoResolvedTails={preview.autoResolvedTails}
          resolutions={resolutions}
          onResolved={onResolved}
        />
      )}

      {preview.rowErrors.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-status-bad/40 bg-status-bad/5 p-4">
          <div className="text-[10px] font-semibold tracking-wider text-status-bad uppercase">
            Rows that won&apos;t be imported
          </div>
          <div className="flex flex-col gap-1">
            {preview.rowErrors.map((e) => (
              <div key={e.row} className="text-[12.5px] text-ink">
                <span className="font-mono text-ink-dim">Row {e.row}:</span> {e.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasUnresolved && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
                Resolve aircraft ({resolvedCount}/{preview.unresolvedTails.length})
              </div>
              <div className="text-[12.5px] text-ink-dim">
                These tail numbers weren&apos;t found — point each at an existing model or add a
                new one before importing.
              </div>
              {!!autoResolveError && <p className="text-xs text-status-bad">{autoResolveError}</p>}
            </div>
            {suggestedUnresolvedCount > 0 && (
              <button
                type="button"
                onClick={onAutoResolveSuggested}
                disabled={autoResolving}
                className="flex h-8 items-center rounded-md border border-accent bg-accent/10 px-3 text-[12.5px] font-medium text-accent hover:bg-accent/20 disabled:opacity-60"
                title="Accepts each unresolved tail's suggested model (from a known type-design designator or marketing name) without resolving them one at a time"
              >
                {autoResolving
                  ? 'Auto-resolving…'
                  : `Auto-resolve ${suggestedUnresolvedCount} suggested`}
              </button>
            )}
            {preview.unresolvedTails.length > 8 && (
              <div className="flex items-center gap-3">
                <input
                  value={tailFilter}
                  onChange={(e) => setTailFilter(e.target.value)}
                  placeholder="Filter by tail or CSV model…"
                  className="h-8 w-56 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
                />
                <label className="flex items-center gap-1.5 text-[12.5px] whitespace-nowrap text-ink-dim">
                  <input
                    type="checkbox"
                    checked={hideResolved}
                    onChange={(e) => setHideResolved(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
                  />
                  Hide resolved
                </label>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {visibleUnresolvedTails.map((tail) => (
              <UnresolvedTailRow
                key={tail.tailKey}
                tail={tail}
                resolved={!!resolutions[tail.tailKey]}
                onResolve={onResolved}
              />
            ))}
            {visibleUnresolvedTails.length === 0 && (
              <p className="px-1 py-3 text-center text-[12.5px] text-ink-dim">
                No tails match this filter.
              </p>
            )}
          </div>
        </div>
      )}

      {preview.modelMismatchWarnings.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-alt p-4">
          <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
            Worth a second look
          </div>
          <div className="flex flex-col gap-1">
            {preview.modelMismatchWarnings.map((w, i) => (
              <div key={`${w.tailNumber}-${i}`} className="text-[12.5px] text-ink-dim">
                <span className="font-mono text-ink">{w.tailNumber}</span> is registered as{' '}
                <span className="text-ink">{w.actualModel}</span>, but your CSV says &ldquo;
                {w.csvModel}&rdquo; — using the existing aircraft.
              </div>
            ))}
          </div>
        </div>
      )}

      <FlightsPreviewTable rows={preview.rows} />
    </div>
  )
}

type PreviewRow = ImportPreviewResult['rows'][number]

const previewFeatures = tableFeaturesWithMeta<PreviewRow>()
const previewColumnHelper = createColumnHelper<typeof previewFeatures, PreviewRow>()

const previewColumns = previewColumnHelper.columns([
  previewColumnHelper.accessor((r) => r.values.date, {
    id: 'date',
    header: 'Date',
    meta: { cellClassName: 'px-2.5 font-mono text-[12.5px] text-ink' },
  }),
  previewColumnHelper.accessor((r) => r.values.tailNumber || 'Anonymous', {
    id: 'tail',
    header: 'Tail',
    meta: { cellClassName: 'px-2.5 font-mono text-[12.5px] text-ink' },
  }),
  previewColumnHelper.accessor((r) => r.values.model || '—', {
    id: 'model',
    header: 'Model',
    meta: {
      cellClassName: 'overflow-hidden px-2.5 text-[12.5px] text-ellipsis whitespace-nowrap text-ink-dim',
    },
  }),
  previewColumnHelper.accessor((r) => r.values.routeFrom, {
    id: 'from',
    header: 'From',
    meta: { cellClassName: 'px-2.5 font-mono text-[12.5px] text-ink' },
  }),
  previewColumnHelper.accessor((r) => r.values.routeTo, {
    id: 'to',
    header: 'To',
    meta: { cellClassName: 'px-2.5 font-mono text-[12.5px] text-ink' },
  }),
  previewColumnHelper.accessor((r) => r.values.totalTime, {
    id: 'total',
    header: 'Total',
    meta: { cellClassName: 'px-2.5 text-right font-mono text-[12.5px] text-ink' },
  }),
])

/**
 * Pulled out of `PreviewStage` and memoized so a file with thousands of rows
 * doesn't re-render this whole table on every unrelated state change —
 * resolving one of a few hundred unresolved tails updates `resolutions` on
 * every click, and without memoization each of those clicks was forcing a
 * full re-render of every row in this table too, compounding into a very
 * sluggish resolution flow at scale (confirmed via a real multi-thousand-row
 * stress test, not just a theoretical concern).
 */
const FlightsPreviewTable = memo(function FlightsPreviewTable({
  rows,
}: {
  rows: ImportPreviewResult['rows']
}) {
  const table = useTable({
    features: previewFeatures,
    data: rows,
    columns: previewColumns,
    getRowId: (row) => String(row.row),
  })

  return (
    <div className="min-h-0 flex-grow overflow-auto rounded-lg border border-border bg-surface">
      <table className="w-full table-fixed border-collapse">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="h-[30px] bg-surface-alt">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="border-b border-border px-2.5 text-left text-xs font-semibold text-ink-dim"
                >
                  <table.FlexRender header={header} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="h-8">
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`border-b border-border/60 ${resolveCellClassName(cell.column.columnDef.meta, row.original) ?? ''}`}
                >
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-sm text-ink-dim">
                No valid rows found in this file.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
})

function SummaryStage({
  summary,
  onImportAnother,
}: {
  summary: ImportSummary
  onImportAnother: () => void
}) {
  const stats = [
    { label: 'Flights imported', value: summary.flightsImported },
    { label: 'Aircraft matched', value: summary.aircraftMatched },
    { label: 'Aircraft created', value: summary.aircraftCreated },
    { label: 'Rows skipped', value: summary.skipped.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3.5 py-3"
          >
            <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              {s.label}
            </div>
            <div className="font-mono text-2xl leading-none font-medium tracking-tight tabular-nums">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {summary.skipped.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-status-bad/40 bg-status-bad/5 p-4">
          <div className="text-[10px] font-semibold tracking-wider text-status-bad uppercase">
            Skipped rows
          </div>
          <div className="flex flex-col gap-1">
            {summary.skipped.map((s, i) => (
              <div key={`${s.row}-${i}`} className="text-[12.5px] text-ink">
                <span className="font-mono text-ink-dim">Row {s.row}:</span> {s.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={onImportAnother}
          className="flex h-8 items-center rounded-md border border-border-strong bg-surface px-3.5 text-sm font-medium text-ink"
        >
          Import another file
        </button>
      </div>
    </div>
  )
}
