import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { ModelPicker } from '#/components/model-picker'
import { commitImport, previewImport } from '#/lib/server/import'

import type { ModelPickerHandle } from '#/components/model-picker'
import type {
  CommitImportResult,
  ImportPreviewResult,
  ImportResolution,
  UnresolvedTail,
} from '#/lib/server/import'

export const Route = createFileRoute('/_authed/import')({
  component: ImportPage,
})

type Stage = 'pick' | 'preview' | 'summary'

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
  const [summary, setSummary] = useState<CommitImportResult | null>(null)

  const handleFile = async (file: File) => {
    setLoadError('')
    setFileName(file.name)
    setLoadingPreview(true)
    try {
      const csvText = await file.text()
      const result = await previewImport({ data: { pilotId, csvText } })
      setPreview(result)
      setResolutions({})
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

  const allResolved = preview
    ? preview.unresolvedTails.every((t) => !!resolutions[t.tailKey])
    : false

  const handleCommit = async () => {
    if (!preview) return
    setCommitError('')
    setCommitting(true)
    try {
      const result = await commitImport({
        data: { pilotId, rows: preview.rows, resolutions },
      })
      setSummary(result)
      setStage('summary')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flights', pilotId] }),
        queryClient.invalidateQueries({ queryKey: ['aircraft', pilotId] }),
      ])
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Could not import flights')
    } finally {
      setCommitting(false)
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
            onCommit={handleCommit}
            onCancel={handleReset}
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
  onCommit,
  onCancel,
}: {
  fileName: string
  preview: ImportPreviewResult
  resolutions: Record<string, ImportResolution | undefined>
  onResolved: (tailKey: string, resolution: ImportResolution) => void
  allResolved: boolean
  committing: boolean
  commitError: string
  onCommit: () => void
  onCancel: () => void
}) {
  const hasUnresolved = preview.unresolvedTails.length > 0
  const canCommit = preview.rows.length > 0 && allResolved && !committing

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
            ? 'Importing…'
            : `Import ${preview.rows.length} ${preview.rows.length === 1 ? 'flight' : 'flights'}`}
        </button>
      </div>

      {!!commitError && <p className="text-xs text-status-bad">{commitError}</p>}

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
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Resolve aircraft
            </div>
            <div className="text-[12.5px] text-ink-dim">
              These tail numbers weren&apos;t found — point each at an existing model or add a
              new one before importing.
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {preview.unresolvedTails.map((tail) => (
              <UnresolvedTailRow
                key={tail.tailKey}
                tail={tail}
                resolved={!!resolutions[tail.tailKey]}
                onResolve={onResolved}
              />
            ))}
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

      <div className="min-h-0 flex-grow overflow-auto rounded-lg border border-border bg-surface">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="h-[30px] bg-surface-alt">
              {['Date', 'Tail', 'Model', 'From', 'To', 'Total'].map((h) => (
                <th
                  key={h}
                  className="border-b border-border px-2.5 text-left text-xs font-semibold text-ink-dim"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr key={r.row} className="h-8">
                <td className="border-b border-border/60 px-2.5 font-mono text-[12.5px] text-ink">
                  {r.values.date}
                </td>
                <td className="border-b border-border/60 px-2.5 font-mono text-[12.5px] text-ink">
                  {r.values.tailNumber || 'Anonymous'}
                </td>
                <td className="overflow-hidden border-b border-border/60 px-2.5 text-[12.5px] text-ellipsis whitespace-nowrap text-ink-dim">
                  {r.values.model || '—'}
                </td>
                <td className="border-b border-border/60 px-2.5 font-mono text-[12.5px] text-ink">
                  {r.values.routeFrom}
                </td>
                <td className="border-b border-border/60 px-2.5 font-mono text-[12.5px] text-ink">
                  {r.values.routeTo}
                </td>
                <td className="border-b border-border/60 px-2.5 text-right font-mono text-[12.5px] text-ink">
                  {r.values.totalTime}
                </td>
              </tr>
            ))}
            {preview.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-ink-dim">
                  No valid rows found in this file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UnresolvedTailRow({
  tail,
  resolved,
  onResolve,
}: {
  tail: UnresolvedTail
  resolved: boolean
  onResolve: (tailKey: string, resolution: ImportResolution) => void
}) {
  const pickerRef = useRef<ModelPickerHandle>(null)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')

  const handleResolveClick = async () => {
    setError('')
    setResolving(true)
    try {
      const model = await pickerRef.current?.resolve()
      if (!model) throw new Error('Search for a model, or enter a manufacturer and model to add one')
      onResolve(tail.tailKey, { modelId: model.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve this aircraft')
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-strong p-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[13px] font-medium text-ink">
          {tail.isAnonymous ? 'Anonymous aircraft' : tail.tailNumber}
        </span>
        {!!tail.csvModel && (
          <span className="text-[12.5px] text-ink-dim">CSV says &ldquo;{tail.csvModel}&rdquo;</span>
        )}
        <div className="flex-grow" />
        {resolved && (
          <span className="rounded border border-border-strong bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-dim uppercase">
            Resolved
          </span>
        )}
      </div>

      {!resolved && (
        <div className="flex flex-col gap-2">
          <ModelPicker ref={pickerRef} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResolveClick}
              disabled={resolving}
              className="flex h-7.5 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {resolving ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
          {!!error && <p className="text-xs text-status-bad">{error}</p>}
        </div>
      )}
    </div>
  )
}

function SummaryStage({
  summary,
  onImportAnother,
}: {
  summary: CommitImportResult
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
