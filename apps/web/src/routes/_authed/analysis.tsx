import { useMemo, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { aggregateFlights, BUCKET_GROUPINGS, GRAPHABLE_FIELDS, parseDateValue, withRunningAverage } from '@logbook/core'

import type { TooltipContentProps } from 'recharts'
import type { AnalysisFlight, GraphableField, GraphableFieldUnit } from '@logbook/core'

import { analysisQueryOptions } from '#/lib/queries/analysis'

export const Route = createFileRoute('/_authed/analysis')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(analysisQueryOptions(pilotId))
  },
  component: AnalysisPage,
})

// Design tokens from styles.css — Recharts renders SVG presentation
// attributes, which don't resolve `var(--color-*)`, so the hex values are
// duplicated here rather than referenced.
const COLOR_ACCENT = '#1b4f8f'
const COLOR_AVERAGE = '#929ca6'
const COLOR_BORDER = '#e0e5ea'
const COLOR_BORDER_STRONG = '#cdd5dd'
const COLOR_INK_FAINT = '#929ca6'

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

function formatValue(value: number, unit: GraphableFieldUnit): string {
  const fractionDigits = unit === 'hours' ? 1 : 0
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function toAnalysisFlight(f: {
  id: string
  date: string
  totalTime: number
  picTime: number
  sicTime: number
  dualTime: number
  soloTime: number
  nightTime: number
  actualInstrument: number
  simInstrument: number
  crossCountryTime: number
  dualGivenTime: number
  groundSimTime: number
  approaches: number
  totalLandings: number
  dayLandingsFullStop: number
  nightLandingsFullStop: number
  tailNumber: string
  aircraftModel: string
  categoryClass: AnalysisFlight['categoryClass']
  instanceType: AnalysisFlight['instanceType']
}): AnalysisFlight {
  return { ...f, date: parseDateValue(f.date) }
}

type ChartPoint = { key: string; label: string; value: number; runningAverage?: number }

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: TooltipContentProps & { unit: GraphableFieldUnit }) {
  if (!active || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-sm">
      <div className="mb-1 text-[11px] font-semibold text-ink-dim">{label}</div>
      <div className="flex flex-col gap-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-1.5 text-[12.5px]">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: entry.color }} />
            <span className="font-mono font-medium text-ink">{formatValue(Number(entry.value), unit)}</span>
            <span className="text-ink-faint">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AnalysisChart({
  points,
  field,
  showAverage,
  rotateLabels,
}: {
  points: Array<ChartPoint>
  field: GraphableField
  showAverage: boolean
  rotateLabels: boolean
}) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: rotateLabels ? 32 : 4 }}>
        <CartesianGrid vertical={false} stroke={COLOR_BORDER} />
        <XAxis
          dataKey="label"
          tick={{ fill: COLOR_INK_FAINT, fontSize: 11 }}
          axisLine={{ stroke: COLOR_BORDER_STRONG }}
          tickLine={false}
          angle={rotateLabels ? -30 : 0}
          textAnchor={rotateLabels ? 'end' : 'middle'}
          height={rotateLabels ? 48 : 24}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: COLOR_INK_FAINT, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v: number) => formatValue(v, field.unit)}
        />
        <Tooltip
          content={(props) => <ChartTooltip {...props} unit={field.unit} />}
          cursor={{ fill: COLOR_BORDER, opacity: 0.5 }}
        />
        <Bar dataKey="value" name={field.label} fill={COLOR_ACCENT} radius={[4, 4, 0, 0]} maxBarSize={24} />
        {showAverage && (
          <Line
            type="monotone"
            dataKey="runningAverage"
            name="Running average"
            stroke={COLOR_AVERAGE}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function AnalysisTable({ points, field, showAverage }: { points: Array<ChartPoint>; field: GraphableField; showAverage: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface-alt text-[10.5px] font-semibold text-ink-dim">
            <th className="px-3.5 py-2">Bucket</th>
            <th className="px-3.5 py-2 text-right">{field.label}</th>
            {showAverage && <th className="px-3.5 py-2 text-right">Running average</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key} className="border-b border-border/60 last:border-0">
              <td className="px-3.5 py-2 text-ink">{p.label}</td>
              <td className="px-3.5 py-2 text-right font-mono text-ink">{formatValue(p.value, field.unit)}</td>
              {showAverage && (
                <td className="px-3.5 py-2 text-right font-mono text-ink-dim">
                  {p.runningAverage !== undefined ? formatValue(p.runningAverage, field.unit) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CHRONOLOGICAL_GROUPINGS = BUCKET_GROUPINGS.filter((g) => g.kind === 'chronological')
const CATEGORICAL_GROUPINGS = BUCKET_GROUPINGS.filter((g) => g.kind === 'categorical')

function AnalysisPage() {
  const { pilotId } = Route.useRouteContext()
  const { data } = useSuspenseQuery(analysisQueryOptions(pilotId))

  const [fieldId, setFieldId] = useState('totalTime')
  const [groupingId, setGroupingId] = useState('year')
  const [showAverage, setShowAverage] = useState(false)
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const flights = useMemo(() => data.flights.map(toAnalysisFlight), [data.flights])

  const field = GRAPHABLE_FIELDS.find((f) => f.id === fieldId) ?? GRAPHABLE_FIELDS[0]
  const grouping = BUCKET_GROUPINGS.find((g) => g.id === groupingId) ?? BUCKET_GROUPINGS[0]
  const canShowAverage = grouping.kind === 'chronological'

  const points: Array<ChartPoint> = useMemo(() => {
    const aggregated = aggregateFlights(flights, field, grouping)
    return canShowAverage && showAverage ? withRunningAverage(aggregated) : aggregated
  }, [flights, field, grouping, canShowAverage, showAverage])

  const rotateLabels = grouping.kind === 'categorical' && points.length > 8

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">Analysis</div>
          <div className="text-xs text-ink-dim">Visual breakdown of your logged flight time</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 px-8 pt-4.5 pb-6">
        {flights.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            No flights logged yet — nothing to analyze.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Field</label>
                <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} className={`${fieldClass} min-w-48`}>
                  {GRAPHABLE_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold tracking-wide text-ink-dim">Group by</label>
                <select
                  value={groupingId}
                  onChange={(e) => setGroupingId(e.target.value)}
                  className={`${fieldClass} min-w-48`}
                >
                  <optgroup label="Time">
                    {CHRONOLOGICAL_GROUPINGS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Aircraft">
                    {CATEGORICAL_GROUPINGS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {canShowAverage && (
                <label className="flex h-8 items-center gap-1.5 text-[12.5px] text-ink-dim">
                  <input
                    type="checkbox"
                    checked={showAverage}
                    onChange={(e) => setShowAverage(e.target.checked)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  Running average
                </label>
              )}

              <div className="ml-auto flex items-center gap-1 rounded-md border border-border-strong bg-surface p-0.5">
                <button
                  onClick={() => setView('chart')}
                  className={`rounded px-2.5 py-1 text-[12px] font-medium ${
                    view === 'chart' ? 'bg-accent text-white' : 'text-ink-dim'
                  }`}
                >
                  Chart
                </button>
                <button
                  onClick={() => setView('table')}
                  className={`rounded px-2.5 py-1 text-[12px] font-medium ${
                    view === 'table' ? 'bg-accent text-white' : 'text-ink-dim'
                  }`}
                >
                  Table
                </button>
              </div>
            </div>

            {showAverage && canShowAverage && (
              <div className="flex items-center gap-4 text-[11.5px] text-ink-dim">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLOR_ACCENT }} />
                  {field.label}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3" style={{ background: COLOR_AVERAGE }} />
                  Running average
                </span>
              </div>
            )}

            {points.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
                No flights match this grouping.
              </div>
            ) : view === 'chart' ? (
              <div className="rounded-lg border border-border bg-surface p-4">
                <AnalysisChart points={points} field={field} showAverage={showAverage && canShowAverage} rotateLabels={rotateLabels} />
              </div>
            ) : (
              <AnalysisTable points={points} field={field} showAverage={showAverage && canShowAverage} />
            )}
          </>
        )}
      </div>
    </>
  )
}
