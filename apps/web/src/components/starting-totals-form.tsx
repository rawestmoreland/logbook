import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { defaultStartingTotalsFormValues, startingTotalsFormSchema } from '@logbook/core'

import type { StartingTotalsFormValues } from '@logbook/core'

import { saveStartingTotals } from '#/lib/server/flights'

type NumberFieldName = Extract<
  keyof StartingTotalsFormValues,
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
  | 'groundSimTime'
>

type LandingsFieldName = Extract<
  keyof StartingTotalsFormValues,
  'totalLandings' | 'dayLandingsFullStop' | 'nightLandingsFullStop' | 'approaches'
>

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

/**
 * Single edit-in-place form for a pilot's carry-forward totals from before
 * they started using this app — a subset of `LogFlightForm`'s fields (no
 * date/aircraft/route/holding/course-tracking, since this isn't a flight;
 * see `startingTotalsFormShape` in `@logbook/core`). There's always exactly
 * zero or one of these per pilot, so unlike `LogFlightForm` there's no
 * create/edit mode split in the route layer — `initialValues` being `null`
 * is the only difference, and it only changes the submit button's label.
 */
export function StartingTotalsForm({
  pilotId,
  initialValues,
}: {
  pilotId: string
  initialValues: StartingTotalsFormValues | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [values, setValues] = useState<StartingTotalsFormValues>(
    () => initialValues ?? defaultStartingTotalsFormValues(),
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function setField<TKey extends keyof StartingTotalsFormValues>(
    key: TKey,
    val: StartingTotalsFormValues[TKey],
  ) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setFormError('')

    const result = startingTotalsFormSchema.safeParse(values)
    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !errors[key]) errors[key] = issue.message
      }
      setFieldErrors(errors)
      return
    }

    setSubmitting(true)
    try {
      await saveStartingTotals({ data: { ...result.data, pilotId } })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['starting-totals', pilotId] }),
        queryClient.invalidateQueries({ queryKey: ['flights-summary', pilotId] }),
      ])
      await navigate({ to: '/' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">
            Starting totals
          </div>
          <div className="text-xs text-ink-dim">
            Carry forward everything logged before this app, from your paper logbook or a
            previous app — enter it once, edit it any time.
          </div>
        </div>
        <div className="flex-grow" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: '/' })}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="starting-totals-form"
            disabled={submitting}
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? 'Saving…' : initialValues ? 'Save changes' : 'Save starting totals'}
          </button>
        </div>
      </div>

      <form
        id="starting-totals-form"
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-grow gap-4 px-8 pt-4.5 pb-6"
      >
        <div className="flex min-w-0 flex-grow flex-col gap-4 overflow-auto rounded-lg border border-border bg-surface p-5">
          {/* time */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Time
            </div>
            <div className="flex flex-wrap items-start gap-4.5">
              <div className="flex w-42 flex-col gap-1.5">
                <label htmlFor="totalTime" className="text-[11px] font-semibold tracking-wide text-ink-dim">
                  Total time
                </label>
                <input
                  id="totalTime"
                  value={values.totalTime}
                  onChange={(e) => setField('totalTime', e.target.value)}
                  inputMode="decimal"
                  className="h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-2xl font-medium tracking-tight text-ink outline-none focus:border-accent"
                />
                {fieldErrors.totalTime && (
                  <p className="text-xs text-status-bad">{fieldErrors.totalTime}</p>
                )}
              </div>
              <div className="grid flex-grow grid-cols-2 gap-2.5 sm:grid-cols-4">
                <NumField label="PIC" name="picTime" values={values} setField={setField} errors={fieldErrors} />
                <NumField label="SIC" name="sicTime" values={values} setField={setField} errors={fieldErrors} />
                <NumField label="Dual" name="dualTime" values={values} setField={setField} errors={fieldErrors} />
                <NumField label="Solo" name="soloTime" values={values} setField={setField} errors={fieldErrors} />
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-4.5">
              <div className="w-42 flex-shrink-0" />
              <div className="grid flex-grow grid-cols-2 gap-2.5 sm:grid-cols-3">
                <NumField label="Night" name="nightTime" values={values} setField={setField} errors={fieldErrors} />
                <NumField
                  label="Actual instrument"
                  name="actualInstrument"
                  values={values}
                  setField={setField}
                  errors={fieldErrors}
                />
                <NumField
                  label="Simulated instrument"
                  name="simInstrument"
                  values={values}
                  setField={setField}
                  errors={fieldErrors}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-4.5">
              <div className="w-42 flex-shrink-0" />
              <div className="grid flex-grow grid-cols-2 gap-2.5 sm:grid-cols-3">
                <NumField
                  label="Cross-country"
                  name="crossCountryTime"
                  values={values}
                  setField={setField}
                  errors={fieldErrors}
                />
                <NumField
                  label="Dual given"
                  name="dualGivenTime"
                  values={values}
                  setField={setField}
                  errors={fieldErrors}
                />
                <NumField
                  label="Ground sim"
                  name="groundSimTime"
                  values={values}
                  setField={setField}
                  errors={fieldErrors}
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* landings */}
          <div className="flex flex-wrap items-start gap-4.5">
            <div className="w-42 flex-shrink-0 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Landings
            </div>
            <div className="flex flex-wrap gap-4.5">
              <NumField
                label="Total"
                name="totalLandings"
                values={values}
                setField={setField}
                errors={fieldErrors}
                integer
              />
              <NumField
                label="Full stop (day)"
                name="dayLandingsFullStop"
                values={values}
                setField={setField}
                errors={fieldErrors}
                integer
              />
              <NumField
                label="Full stop (night)"
                name="nightLandingsFullStop"
                values={values}
                setField={setField}
                errors={fieldErrors}
                integer
              />
            </div>
            {fieldErrors.dayLandingsFullStop && (
              <p className="w-full text-xs text-status-bad">{fieldErrors.dayLandingsFullStop}</p>
            )}
          </div>

          <div className="h-px bg-border" />

          {/* instrument */}
          <div className="flex flex-wrap items-start gap-4.5">
            <div className="w-42 flex-shrink-0 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Instrument
            </div>
            <NumField
              label="Approaches"
              name="approaches"
              values={values}
              setField={setField}
              errors={fieldErrors}
              integer
            />
          </div>

          {!!formError && <p className="text-xs text-status-bad">{formError}</p>}
        </div>
      </form>
    </>
  )
}

function NumField({
  label,
  name,
  values,
  setField,
  errors,
  integer,
}: {
  label: string
  name: NumberFieldName | LandingsFieldName
  values: StartingTotalsFormValues
  setField: <TKey extends keyof StartingTotalsFormValues>(
    key: TKey,
    val: StartingTotalsFormValues[TKey],
  ) => void
  errors: Record<string, string>
  integer?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-[11px] font-semibold tracking-wide text-ink-dim">
        {label}
      </label>
      <input
        id={name}
        value={values[name]}
        onChange={(e) => setField(name, e.target.value)}
        inputMode={integer ? 'numeric' : 'decimal'}
        placeholder="0"
        className={`${fieldClass} w-24`}
      />
      {errors[name] && <p className="text-xs text-status-bad">{errors[name]}</p>}
    </div>
  )
}
