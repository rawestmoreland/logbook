import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { AutoResolvedSection, UnresolvedTailRow } from '#/components/tail-resolution'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { previewAircraftImport } from '#/lib/server/aircraft-import'
import { resolveImportAircraft } from '#/lib/server/import'

import type { PreviewAircraftImportResult } from '#/lib/server/aircraft-import'
import type { ImportResolution } from '#/lib/server/import'

type Stage = 'pick' | 'preview' | 'summary'

type ImportSummary = {
  aircraftCreated: number
  aircraftMatched: number
}

/**
 * Bulk aircraft-only import for the `/aircraft` page (closes issue #21) —
 * the same pick -> preview -> commit -> summary shape as `/import`, scoped
 * down: no flight-chunking (fleets are small, one `resolveImportAircraft`
 * call is enough), and the summary counts aircraft, not flights. Shares its
 * tail-resolution UI (`AutoResolvedSection`/`UnresolvedTailRow`) and its
 * commit primitive (`resolveImportAircraft`) with the flight importer
 * rather than rebuilding either.
 */
export function AircraftCsvImport({ pilotId, onClose }: { pilotId: string; onClose: () => void }) {
  const queryClient = useQueryClient()

  const [stage, setStage] = useState<Stage>('pick')
  const [fileName, setFileName] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [preview, setPreview] = useState<PreviewAircraftImportResult | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution | undefined>>({})

  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const handleFile = async (file: File) => {
    setLoadError('')
    setFileName(file.name)
    setLoadingPreview(true)
    try {
      const csvText = await file.text()
      const result = await previewAircraftImport({ data: { pilotId, csvText } })
      setPreview(result)
      // Confidently-matched tails start pre-resolved — the pilot can still
      // override any of them before committing, same as `/import`.
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

  const allResolved = preview ? preview.unresolvedTails.every((t) => !!resolutions[t.tailKey]) : false
  const canCommit = !!preview && preview.rows.length > 0 && allResolved && !committing

  const handleCommit = async () => {
    if (!preview) return
    setCommitError('')
    setCommitting(true)
    try {
      const resolved = await resolveImportAircraft({
        data: {
          pilotId,
          rows: preview.rows.map((r) => ({ row: r.row, tailKey: r.tailKey, tailNumber: r.tailNumber })),
          resolutions,
        },
      })
      setSummary({ aircraftCreated: resolved.aircraftCreated, aircraftMatched: resolved.aircraftMatched })
      setStage('summary')
      await queryClient.invalidateQueries({ queryKey: aircraftQueryOptions(pilotId).queryKey })
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Could not import aircraft')
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
    <div className="mt-1 flex flex-col gap-3 rounded-md border border-border-strong bg-surface-alt p-3">
      {stage === 'pick' && (
        <>
          <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong text-center hover:bg-surface">
            <span className="text-sm font-medium text-ink">
              {loadingPreview ? 'Reading file…' : 'Choose a CSV file'}
            </span>
            <span className="text-[11px] text-ink-dim">Tail Number, Manufacturer, Model, …</span>
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
          <div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink-dim"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {stage === 'preview' && preview && (
        <PreviewStage
          fileName={fileName}
          preview={preview}
          resolutions={resolutions}
          onResolved={handleResolved}
          canCommit={canCommit}
          committing={committing}
          commitError={commitError}
          onCommit={handleCommit}
          onChooseDifferentFile={handleReset}
        />
      )}

      {stage === 'summary' && summary && <SummaryStage summary={summary} onDone={onClose} />}
    </div>
  )
}

function PreviewStage({
  fileName,
  preview,
  resolutions,
  onResolved,
  canCommit,
  committing,
  commitError,
  onCommit,
  onChooseDifferentFile,
}: {
  fileName: string
  preview: PreviewAircraftImportResult
  resolutions: Record<string, ImportResolution | undefined>
  onResolved: (tailKey: string, resolution: ImportResolution) => void
  canCommit: boolean
  committing: boolean
  commitError: string
  onCommit: () => void
  onChooseDifferentFile: () => void
}) {
  const hasUnresolved = preview.unresolvedTails.length > 0
  const resolvedCount = preview.unresolvedTails.filter((t) => !!resolutions[t.tailKey]).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-medium text-ink">{fileName}</div>
          <div className="text-[11px] text-ink-dim">
            {preview.rows.length} {preview.rows.length === 1 ? 'aircraft' : 'aircraft'} found
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
          onClick={onChooseDifferentFile}
          className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink-dim"
        >
          Choose a different file
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={!canCommit}
          className="flex h-7.5 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {committing
            ? 'Importing…'
            : `Import ${preview.rows.length} ${preview.rows.length === 1 ? 'aircraft' : 'aircraft'}`}
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
        <div className="flex flex-col gap-2 rounded-md border border-status-bad/40 bg-status-bad/5 p-3">
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
        <div className="flex flex-col gap-3 rounded-md border border-border-strong p-3">
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Resolve aircraft ({resolvedCount}/{preview.unresolvedTails.length})
            </div>
            <div className="text-[12.5px] text-ink-dim">
              These tail numbers weren&apos;t found — point each at an existing model or add a new
              one before importing.
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
        <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface p-3">
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

      {preview.rows.length === 0 && (
        <p className="px-1 py-3 text-center text-[12.5px] text-ink-dim">No aircraft found in this file.</p>
      )}
    </div>
  )
}

function SummaryStage({ summary, onDone }: { summary: ImportSummary; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink">
        <span className="font-mono font-medium">{summary.aircraftCreated}</span> aircraft added,{' '}
        <span className="font-mono font-medium">{summary.aircraftMatched}</span> already in your
        fleet.
      </p>
      <div>
        <button
          type="button"
          onClick={onDone}
          className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink-dim"
        >
          Done
        </button>
      </div>
    </div>
  )
}
