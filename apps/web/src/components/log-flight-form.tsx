import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import {
  CATEGORY_CLASS_LABELS,
  defaultFlightFormValues,
  flightFormSchema,
  isCategoryClass,
  parseNumberValue,
} from '@logbook/core'

import type { FlightFormValues } from '@logbook/core'

import { AircraftForm } from '#/components/aircraft-form'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import {
  createFlightReviewEndorsement,
  createIpcEndorsement,
  getFlightReviewForFlight,
  getIpcForFlight,
} from '#/lib/server/endorsements'
import { createFlight, updateFlight } from '#/lib/server/flights'

import type { AircraftListItem } from '#/lib/server/aircraft'
import type { FlightReviewEndorsement, IpcEndorsement } from '#/lib/server/endorsements'
import type { FlightsSummary } from '#/lib/server/flights'

type NumberFieldName = Extract<
  keyof FlightFormValues,
  | 'totalTime'
  | 'picTime'
  | 'sicTime'
  | 'dualTime'
  | 'soloTime'
  | 'nightTime'
  | 'actualInstrument'
  | 'simInstrument'
>

type LandingsFieldName = Extract<
  keyof FlightFormValues,
  'dayLandings' | 'nightLandings' | 'dayLandingsFullStop' | 'approaches'
>

type BooleanFieldName = Extract<keyof FlightFormValues, 'holding' | 'courseTracking'>

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

/**
 * Shared by the create (`/log-flight`) and edit (`/log-flight/$flightId`)
 * routes — everything from the page header down is identical between the
 * two, save for which server function submit calls and whether the "this
 * flight adds" panel (a delta against the *current* grand totals) makes
 * sense to show, which it doesn't once the flight being edited is already
 * baked into those totals.
 */
export function LogFlightForm({
  pilotId,
  aircraftList,
  flightsData,
  mode,
  flightId,
  initialValues,
}: {
  pilotId: string
  aircraftList: Array<AircraftListItem>
  flightsData: FlightsSummary
  mode: 'create' | 'edit'
  flightId?: string
  initialValues?: FlightFormValues
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [values, setValues] = useState<FlightFormValues>(
    () => initialValues ?? defaultFlightFormValues(),
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAddAircraft, setShowAddAircraft] = useState(
    mode === 'create' && aircraftList.length === 0,
  )

  const [flightReview, setFlightReview] = useState<FlightReviewEndorsement | null>(null)
  const [reviewDate, setReviewDate] = useState(() => initialValues?.date ?? defaultFlightFormValues().date)
  const [loadingReview, setLoadingReview] = useState(mode === 'edit')
  const [savingReview, setSavingReview] = useState(false)
  const [reviewError, setReviewError] = useState('')

  const [ipc, setIpc] = useState<IpcEndorsement | null>(null)
  const [ipcDate, setIpcDate] = useState(() => initialValues?.date ?? defaultFlightFormValues().date)
  const [loadingIpc, setLoadingIpc] = useState(mode === 'edit')
  const [savingIpc, setSavingIpc] = useState(false)
  const [ipcError, setIpcError] = useState('')

  // First flight has no aircraft to default to; every later flight defaults
  // to the top of the (alphabetically sorted) fleet until the pilot picks.
  useEffect(() => {
    if (mode === 'create' && !values.aircraftId && aircraftList.length > 0) {
      setValues((v) => ({ ...v, aircraftId: aircraftList[0].id }))
    }
  }, [mode, aircraftList, values.aircraftId])

  useEffect(() => {
    if (mode !== 'edit' || !flightId) return
    let cancelled = false
    setLoadingReview(true)
    getFlightReviewForFlight({ data: { flightId } })
      .then((existing) => {
        if (!cancelled) setFlightReview(existing)
      })
      .finally(() => {
        if (!cancelled) setLoadingReview(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, flightId])

  const handleLogFlightReview = async () => {
    if (!flightId) return
    setReviewError('')
    setSavingReview(true)
    try {
      const created = await createFlightReviewEndorsement({ data: { flightId, date: reviewDate } })
      setFlightReview(created)
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Could not log flight review')
    } finally {
      setSavingReview(false)
    }
  }

  useEffect(() => {
    if (mode !== 'edit' || !flightId) return
    let cancelled = false
    setLoadingIpc(true)
    getIpcForFlight({ data: { flightId } })
      .then((existing) => {
        if (!cancelled) setIpc(existing)
      })
      .finally(() => {
        if (!cancelled) setLoadingIpc(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, flightId])

  const handleLogIpc = async () => {
    if (!flightId) return
    setIpcError('')
    setSavingIpc(true)
    try {
      const created = await createIpcEndorsement({ data: { flightId, date: ipcDate } })
      setIpc(created)
    } catch (err) {
      setIpcError(err instanceof Error ? err.message : 'Could not log IPC')
    } finally {
      setSavingIpc(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        const form = document.getElementById('log-flight-form')
        if (form instanceof HTMLFormElement) form.requestSubmit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const selectedAircraft = aircraftList.find((a) => a.id === values.aircraftId)

  function setField<TKey extends keyof FlightFormValues>(key: TKey, val: FlightFormValues[TKey]) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  function adjustLandings(name: LandingsFieldName, delta: number) {
    setField(name, String(Math.max(0, parseNumberValue(values[name]) + delta)))
  }

  const handleAircraftCreated = (aircraft: AircraftListItem) => {
    queryClient.setQueryData(
      aircraftQueryOptions(pilotId).queryKey,
      (old: Array<AircraftListItem> = []) =>
        old.some((a) => a.id === aircraft.id) ? old : [...old, aircraft],
    )
    setField('aircraftId', aircraft.id)
    setShowAddAircraft(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setFormError('')

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

    setSubmitting(true)
    try {
      if (mode === 'edit' && flightId) {
        await updateFlight({ data: { ...result.data, id: flightId } })
      } else {
        await createFlight({ data: { ...result.data, pilotId } })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['flights-summary', pilotId] }),
        queryClient.invalidateQueries({ queryKey: ['flights-page', pilotId] }),
      ])
      await navigate({ to: '/' })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  const deltas: Array<{ label: string; field: keyof typeof flightsData.grandTotals }> = [
    { label: 'Total time', field: 'totalTime' },
    { label: 'PIC', field: 'picTime' },
    { label: 'Dual', field: 'dualTime' },
    { label: 'Night', field: 'nightTime' },
  ]
  const fieldForDelta: Record<string, NumberFieldName> = {
    totalTime: 'totalTime',
    picTime: 'picTime',
    dualTime: 'dualTime',
    nightTime: 'nightTime',
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">
            {mode === 'edit' ? 'Edit flight' : 'Log flight'}
          </div>
          <div className="text-xs text-ink-dim">Enter the details from your logbook</div>
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
            form="log-flight-form"
            disabled={submitting}
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save flight'}
            <span className="font-mono text-[11px] opacity-70">⌘↵</span>
          </button>
        </div>
      </div>

      <form
        id="log-flight-form"
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-grow gap-4 px-8 pt-4.5 pb-6"
      >
        <div className="flex min-w-0 flex-grow flex-col gap-4 overflow-auto rounded-lg border border-border bg-surface p-5">
          {/* date + aircraft */}
          <div className="flex flex-wrap items-start gap-4.5">
            <div className="flex w-42 flex-col gap-1.5">
              <label htmlFor="date" className="text-[11px] font-semibold tracking-wide text-ink-dim">
                Date
              </label>
              <input
                id="date"
                type="date"
                value={values.date}
                onChange={(e) => setField('date', e.target.value)}
                className={fieldClass}
              />
              {fieldErrors.date && <p className="text-xs text-status-bad">{fieldErrors.date}</p>}
            </div>

            <div className="flex min-w-64 flex-grow flex-col gap-1.5">
              <div className="text-[11px] font-semibold tracking-wide text-ink-dim">Aircraft</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {aircraftList.map((a) => {
                  const selected = a.id === values.aircraftId
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setField('aircraftId', a.id)}
                      className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12.5px] ${
                        selected
                          ? 'border-accent bg-[#eef3f9] font-medium text-ink'
                          : 'border-border-strong bg-surface text-ink-dim'
                      }`}
                    >
                      <span className="font-mono">{a.displayTailNumber}</span>
                      <span className="text-ink-faint">{a.type}</span>
                    </button>
                  )
                })}
                {aircraftList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddAircraft((s) => !s)}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2.5 text-[12.5px] text-ink-dim"
                  >
                    + Add aircraft
                  </button>
                )}
              </div>
              {fieldErrors.aircraftId && (
                <p className="text-xs text-status-bad">{fieldErrors.aircraftId}</p>
              )}
              {selectedAircraft && (
                <div className="text-[11px] text-ink-faint">
                  {isCategoryClass(selectedAircraft.categoryClass)
                    ? CATEGORY_CLASS_LABELS[selectedAircraft.categoryClass]
                    : selectedAircraft.categoryClass}
                </div>
              )}

              {(showAddAircraft || aircraftList.length === 0) && (
                <AircraftForm
                  pilotId={pilotId}
                  onCancel={aircraftList.length > 0 ? () => setShowAddAircraft(false) : undefined}
                  onSaved={handleAircraftCreated}
                />
              )}
            </div>
          </div>

          {/* route */}
          <div className="flex flex-wrap gap-4.5">
            <div className="flex w-42 flex-col gap-1.5">
              <label htmlFor="routeFrom" className="text-[11px] font-semibold tracking-wide text-ink-dim">
                From
              </label>
              <input
                id="routeFrom"
                value={values.routeFrom}
                onChange={(e) => setField('routeFrom', e.target.value.toUpperCase())}
                placeholder="KPAO"
                className={`${fieldClass} uppercase`}
              />
              {fieldErrors.routeFrom && (
                <p className="text-xs text-status-bad">{fieldErrors.routeFrom}</p>
              )}
            </div>
            <div className="flex w-42 flex-col gap-1.5">
              <label htmlFor="routeTo" className="text-[11px] font-semibold tracking-wide text-ink-dim">
                To
              </label>
              <input
                id="routeTo"
                value={values.routeTo}
                onChange={(e) => setField('routeTo', e.target.value.toUpperCase())}
                placeholder="KMRY"
                className={`${fieldClass} uppercase`}
              />
              {fieldErrors.routeTo && (
                <p className="text-xs text-status-bad">{fieldErrors.routeTo}</p>
              )}
            </div>
          </div>

          <div className="h-px bg-border" />

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
          </div>

          <div className="h-px bg-border" />

          {/* landings */}
          <div className="flex flex-wrap items-start gap-4.5">
            <div className="w-42 flex-shrink-0 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Landings
            </div>
            <div className="flex flex-wrap gap-2.5">
              <LandingStepper label="Day" name="dayLandings" values={values} adjust={adjustLandings} />
              <LandingStepper label="Night" name="nightLandings" values={values} adjust={adjustLandings} />
              <LandingStepper
                label="Day, full stop"
                name="dayLandingsFullStop"
                values={values}
                adjust={adjustLandings}
              />
            </div>
            {fieldErrors.dayLandingsFullStop && (
              <p className="w-full text-xs text-status-bad">{fieldErrors.dayLandingsFullStop}</p>
            )}
          </div>

          <div className="h-px bg-border" />

          {/* instrument currency */}
          <div className="flex flex-wrap items-start gap-4.5">
            <div className="w-42 flex-shrink-0 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Instrument
            </div>
            <div className="flex flex-wrap items-start gap-4.5">
              <LandingStepper label="Approaches" name="approaches" values={values} adjust={adjustLandings} />
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-semibold tracking-wide text-ink-dim">&nbsp;</div>
                <div className="flex h-8 items-center gap-4">
                  <BoolField label="Holding" name="holding" values={values} setField={setField} />
                  <BoolField label="Course tracking" name="courseTracking" values={values} setField={setField} />
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* remarks */}
          <div className="flex flex-grow flex-wrap items-start gap-4.5">
            <div className="w-42 flex-shrink-0 pt-0.5 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Remarks
            </div>
            <textarea
              value={values.remarks}
              onChange={(e) => setField('remarks', e.target.value)}
              rows={3}
              className="min-h-15.5 min-w-64 flex-grow rounded-md border border-border-strong bg-surface p-2.5 text-sm text-ink outline-none focus:border-accent"
            />
          </div>

          {mode === 'edit' && (
            <>
              <div className="h-px bg-border" />

              {/* flight review (61.56) */}
              <div className="flex flex-wrap items-center gap-4.5">
                <div className="w-42 flex-shrink-0 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
                  Flight review
                </div>
                {loadingReview ? (
                  <div className="text-[12.5px] text-ink-dim">Loading…</div>
                ) : flightReview ? (
                  <div className="text-[12.5px] text-ink-dim">
                    Logged on <span className="font-mono text-ink">{flightReview.date}</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="date"
                      value={reviewDate}
                      onChange={(e) => setReviewDate(e.target.value)}
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      onClick={handleLogFlightReview}
                      disabled={savingReview}
                      className="flex h-8 items-center rounded-md border border-border-strong px-3 text-[12.5px] font-medium text-ink disabled:opacity-60"
                    >
                      {savingReview ? 'Logging…' : 'Log flight review on this flight'}
                    </button>
                  </div>
                )}
                {!!reviewError && <p className="w-full text-xs text-status-bad">{reviewError}</p>}
              </div>

              <div className="h-px bg-border" />

              {/* instrument proficiency check (61.57(d)) */}
              <div className="flex flex-wrap items-center gap-4.5">
                <div className="w-42 flex-shrink-0 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
                  IPC
                </div>
                {loadingIpc ? (
                  <div className="text-[12.5px] text-ink-dim">Loading…</div>
                ) : ipc ? (
                  <div className="text-[12.5px] text-ink-dim">
                    Logged on <span className="font-mono text-ink">{ipc.date}</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="date"
                      value={ipcDate}
                      onChange={(e) => setIpcDate(e.target.value)}
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      onClick={handleLogIpc}
                      disabled={savingIpc}
                      className="flex h-8 items-center rounded-md border border-border-strong px-3 text-[12.5px] font-medium text-ink disabled:opacity-60"
                    >
                      {savingIpc ? 'Logging…' : 'Log IPC on this flight'}
                    </button>
                  </div>
                )}
                {!!ipcError && <p className="w-full text-xs text-status-bad">{ipcError}</p>}
              </div>
            </>
          )}

          {!!formError && <p className="text-xs text-status-bad">{formError}</p>}
        </div>

        {/* this flight adds */}
        {mode === 'create' && (
          <div className="hidden w-72 flex-shrink-0 flex-col gap-3 lg:flex">
            <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-4">
              <div className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
                This flight adds
              </div>
              {deltas.map((d) => {
                const from = flightsData.grandTotals[d.field]
                const to = from + parseNumberValue(values[fieldForDelta[d.field]])
                return (
                  <div key={d.field} className="flex items-baseline gap-2.5">
                    <div className="flex-grow text-[12.5px] text-ink-dim">{d.label}</div>
                    <div className="font-mono text-[12.5px] text-ink-faint">{from.toFixed(1)}</div>
                    <span className="text-ink-zero">→</span>
                    <div className="w-14 text-right font-mono text-[13px] font-medium text-ink">
                      {to.toFixed(1)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
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
}: {
  label: string
  name: NumberFieldName
  values: FlightFormValues
  setField: <TKey extends keyof FlightFormValues>(key: TKey, val: FlightFormValues[TKey]) => void
  errors: Record<string, string>
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
        inputMode="decimal"
        placeholder="0"
        className={fieldClass}
      />
      {errors[name] && <p className="text-xs text-status-bad">{errors[name]}</p>}
    </div>
  )
}

function BoolField({
  label,
  name,
  values,
  setField,
}: {
  label: string
  name: BooleanFieldName
  values: FlightFormValues
  setField: <TKey extends keyof FlightFormValues>(key: TKey, val: FlightFormValues[TKey]) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
      <input
        type="checkbox"
        checked={values[name]}
        onChange={(e) => setField(name, e.target.checked)}
        className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
      />
      {label}
    </label>
  )
}

function LandingStepper({
  label,
  name,
  values,
  adjust,
}: {
  label: string
  name: LandingsFieldName
  values: FlightFormValues
  adjust: (name: LandingsFieldName, delta: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold tracking-wide text-ink-dim">{label}</div>
      <div className="flex h-8 items-stretch overflow-hidden rounded-md border border-border-strong bg-surface">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => adjust(name, -1)}
          className="w-7.5 border-r border-border text-ink-dim"
        >
          −
        </button>
        <div className="flex w-11 items-center justify-center font-mono text-[13px] font-medium text-ink">
          {values[name]}
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => adjust(name, 1)}
          className="w-7.5 border-l border-border text-ink-dim"
        >
          +
        </button>
      </div>
    </div>
  )
}
