import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'

import { flightFormSchema } from '@logbook/core'

import type { FlightFormValues } from '@logbook/core'

import { flightQueryOptions } from '#/lib/queries/flights'
import { updateFlight } from '#/lib/server/flights'

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

const ROUTE_FIELDS = new Set(['route'])

type NumericFieldName = Extract<
  keyof FlightFormValues,
  | 'totalTime'
  | 'picTime'
  | 'sicTime'
  | 'dualTime'
  | 'soloTime'
  | 'nightTime'
  | 'actualInstrument'
  | 'simInstrument'
  | 'crossCountryTime'
  | 'dualGivenTime'
  | 'totalLandings'
  | 'dayLandingsFullStop'
  | 'nightLandingsFullStop'
>

const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  route: 'Route',
  totalTime: 'Total',
  picTime: 'PIC',
  sicTime: 'SIC',
  dualTime: 'Dual received',
  soloTime: 'Solo',
  nightTime: 'Night',
  actualInstrument: 'Actual instrument',
  simInstrument: 'Simulated instrument',
  crossCountryTime: 'Cross-country',
  dualGivenTime: 'Dual given',
  totalLandings: 'Total landings',
  dayLandingsFullStop: 'Day full-stop landings',
  nightLandingsFullStop: 'Night full-stop landings',
}

function setFormField<TKey extends keyof FlightFormValues>(
  setValues: Dispatch<SetStateAction<FlightFormValues | null>>,
  key: TKey,
  val: FlightFormValues[TKey],
) {
  setValues((prev) => (prev ? { ...prev, [key]: val } : prev))
}

function FixField({
  field,
  values,
  setField,
  error,
}: {
  field: string
  values: FlightFormValues
  setField: <TKey extends keyof FlightFormValues>(key: TKey, val: FlightFormValues[TKey]) => void
  error?: string
}) {
  const label = FIELD_LABELS[field] ?? field

  if (field === 'date') {
    return (
      <div className="flex w-36 flex-col gap-1">
        <label htmlFor={`fix-${field}`} className="text-[11px] font-semibold tracking-wide text-ink-dim">
          {label}
        </label>
        <input
          id={`fix-${field}`}
          type="date"
          value={values.date}
          onChange={(e) => setField('date', e.target.value)}
          className={fieldClass}
        />
        {error && <p className="text-xs text-status-bad">{error}</p>}
      </div>
    )
  }

  if (ROUTE_FIELDS.has(field)) {
    const key = field as 'route'
    return (
      <div className="flex w-36 flex-col gap-1">
        <label htmlFor={`fix-${field}`} className="text-[11px] font-semibold tracking-wide text-ink-dim">
          {label}
        </label>
        <input
          id={`fix-${field}`}
          value={values[key] ?? ''}
          onChange={(e) => setField(key, e.target.value.toUpperCase())}
          className={`${fieldClass} uppercase`}
        />
        {error && <p className="text-xs text-status-bad">{error}</p>}
      </div>
    )
  }

  const key = field as NumericFieldName
  return (
    <div className="flex w-22 flex-col gap-1">
      <label htmlFor={`fix-${field}`} className="text-[11px] font-semibold tracking-wide text-ink-dim">
        {label}
      </label>
      <input
        id={`fix-${field}`}
        value={values[key]}
        onChange={(e) => setField(key, e.target.value)}
        inputMode="decimal"
        className={fieldClass}
      />
      {error && <p className="text-xs text-status-bad">{error}</p>}
    </div>
  )
}

/**
 * Inline "fix it here" form for the Check Flights accordion — shows only
 * the fields relevant to a flight's warnings (see `fieldsForWarnings`) so a
 * pilot can correct a typo without navigating to the full flight page and
 * losing their place in the checks list. Saves through the same
 * `updateFlight`/`flightFormSchema` path as the full edit form, on the
 * fetched flight's complete values — so fields not shown here (aircraft,
 * remarks, etc.) round-trip unchanged.
 */
export function InlineFlightFixForm({
  flightId,
  fields,
  onCancel,
  onSaved,
}: {
  flightId: string
  fields: ReadonlyArray<string>
  onCancel: () => void
  onSaved: () => void
}) {
  const { data, isLoading } = useQuery(flightQueryOptions(flightId))
  const [values, setValues] = useState<FlightFormValues | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setValues(data)
  }, [data])

  const setField = <TKey extends keyof FlightFormValues>(key: TKey, val: FlightFormValues[TKey]) =>
    setFormField(setValues, key, val)

  const handleSave = async () => {
    if (!values) return
    setError('')
    const result = flightFormSchema.safeParse(values)
    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !errors[key]) errors[key] = issue.message
      }
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      await updateFlight({ data: { ...result.data, id: flightId } })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save flight')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !values) {
    return (
      <div className="mt-1 rounded-md border border-border-strong bg-surface-alt p-3 text-xs text-ink-dim">
        Loading flight…
      </div>
    )
  }

  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-md border border-border-strong bg-surface-alt p-3">
      <div className="flex flex-wrap gap-3">
        {fields.map((field) => (
          <FixField key={field} field={field} values={values} setField={setField} error={fieldErrors[field]} />
        ))}
      </div>
      {!!error && <p className="text-xs text-status-bad">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex h-7.5 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save & recheck'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7.5 items-center rounded-md border border-border-strong px-3 text-xs font-medium text-ink-dim"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
