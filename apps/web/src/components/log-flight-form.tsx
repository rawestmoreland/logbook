import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import {
  CATEGORY_CLASS_LABELS,
  computeEndorsementContentHash,
  defaultFlightFormValues,
  flightFormSchema,
  isCategoryClass,
  parseNumberValue,
} from '@logbook/core'

import type { EndorsementType, FlightFormValues } from '@logbook/core'

import { AircraftForm } from '#/components/aircraft-form'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { requestEndorsementSignature } from '#/lib/server/endorsement-signatures'
import { assignEndorsementInstructor, createEndorsement, findCfiByEmail, getEndorsementForFlight } from '#/lib/server/endorsements'
import { createFlight, updateFlight } from '#/lib/server/flights'

import type { AircraftListItem } from '#/lib/server/aircraft'
import type { CfiLookupResult, Endorsement } from '#/lib/server/endorsements'
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
  | 'crossCountryTime'
  | 'dualGivenTime'
  | 'groundSimTime'
>

type LandingsFieldName = Extract<
  keyof FlightFormValues,
  'totalLandings' | 'dayLandingsFullStop' | 'nightLandingsFullStop' | 'approaches'
>

type BooleanFieldName = Extract<keyof FlightFormValues, 'holding' | 'courseTracking' | 'pending'>

const fieldClass =
  'h-8 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent'

const RECENT_AIRCRAFT_LIMIT = 4

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

  // First flight has no aircraft to default to; every later flight defaults
  // to the top of the (alphabetically sorted) fleet until the pilot picks.
  useEffect(() => {
    if (mode === 'create' && !values.aircraftId && aircraftList.length > 0) {
      setValues((v) => ({ ...v, aircraftId: aircraftList[0].id }))
    }
  }, [mode, aircraftList, values.aircraftId])

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

  // The pilot's most-flown tails, most recently flown first — not the whole
  // fleet, which for anyone who's imported a large logbook (e.g. airline
  // pilots cycling through dozens of tails) would otherwise flood this row
  // with one-off aircraft. The rest of the fleet stays reachable through the
  // "More aircraft" picker below.
  const recentAircraft = useMemo(() => {
    const flown = aircraftList.filter((a) => a.flightCount > 0)
    // Nobody's logged a flight yet (a brand-new fleet) — fall back to
    // whatever's there instead of showing no badges at all.
    if (flown.length === 0) return aircraftList.slice(0, RECENT_AIRCRAFT_LIMIT)
    return [...flown]
      .sort((a, b) => b.flightCount - a.flightCount)
      .slice(0, RECENT_AIRCRAFT_LIMIT)
      .sort((a, b) => (b.lastFlownDate ?? '').localeCompare(a.lastFlownDate ?? ''))
  }, [aircraftList])
  const recentAircraftIds = new Set(recentAircraft.map((a) => a.id))
  const otherAircraft = aircraftList.filter((a) => !recentAircraftIds.has(a.id))

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
    { label: 'Cross-country', field: 'crossCountryTime' },
    { label: 'Dual given', field: 'dualGivenTime' },
    { label: 'Ground sim', field: 'groundSimTime' },
  ]
  const fieldForDelta: Record<string, NumberFieldName> = {
    totalTime: 'totalTime',
    picTime: 'picTime',
    dualTime: 'dualTime',
    nightTime: 'nightTime',
    crossCountryTime: 'crossCountryTime',
    dualGivenTime: 'dualGivenTime',
    groundSimTime: 'groundSimTime',
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
                {recentAircraft.map((a) => {
                  const selected = a.id === values.aircraftId
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setField('aircraftId', a.id)}
                      className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12.5px] ${
                        selected
                          ? 'border-accent bg-accent-soft font-medium text-ink'
                          : 'border-border-strong bg-surface text-ink-dim'
                      }`}
                    >
                      <span className="font-mono">{a.displayTailNumber}</span>
                      <span className="text-ink-faint">{a.type}</span>
                    </button>
                  )
                })}
                {otherAircraft.length > 0 && (
                  <select
                    value={otherAircraft.some((a) => a.id === values.aircraftId) ? values.aircraftId : ''}
                    onChange={(e) => {
                      if (e.target.value) setField('aircraftId', e.target.value)
                    }}
                    className="h-8 rounded-md border border-border-strong bg-surface px-2.5 text-[12.5px] text-ink-dim focus:outline-none"
                  >
                    <option value="">More aircraft…</option>
                    {otherAircraft.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayTailNumber} — {a.type}
                      </option>
                    ))}
                  </select>
                )}
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
            <div className="flex min-w-64 flex-grow flex-col gap-1.5">
              <label htmlFor="route" className="text-[11px] font-semibold tracking-wide text-ink-dim">
                Full route (optional)
              </label>
              <input
                id="route"
                value={values.route ?? ''}
                onChange={(e) => setField('route', e.target.value.toUpperCase())}
                placeholder="KPAO KSQL KHWD KPAO"
                className={`${fieldClass} uppercase`}
              />
              {fieldErrors.route && <p className="text-xs text-status-bad">{fieldErrors.route}</p>}
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
            <div className="flex flex-wrap gap-2.5">
              <LandingStepper label="Total" name="totalLandings" values={values} adjust={adjustLandings} />
              <LandingStepper
                label="Full stop (day)"
                name="dayLandingsFullStop"
                values={values}
                adjust={adjustLandings}
              />
              <LandingStepper
                label="Full stop (night)"
                name="nightLandingsFullStop"
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

          {/* pending flights */}
          <div className="flex flex-wrap items-start gap-4.5">
            <div className="w-42 flex-shrink-0 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
              Pending
            </div>
            <div className="flex flex-col gap-1">
              <BoolField label="Hold as pending" name="pending" values={values} setField={setField} />
              <p className="text-[11px] text-ink-faint">
                Held out of totals and currency until you confirm it from Pending Flights.
              </p>
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
              <EndorsementRow
                flightId={flightId}
                mode={mode}
                type="flight_review"
                label="Flight review"
                initialDate={initialValues?.date ?? defaultFlightFormValues().date}
              />

              <div className="h-px bg-border" />
              <EndorsementRow
                flightId={flightId}
                mode={mode}
                type="ipc"
                label="IPC"
                initialDate={initialValues?.date ?? defaultFlightFormValues().date}
              />

              <div className="h-px bg-border" />
              <EndorsementRow
                flightId={flightId}
                mode={mode}
                type="checkride"
                label="Checkride"
                initialDate={initialValues?.date ?? defaultFlightFormValues().date}
              />

              {/* 14 CFR 61.31(e)/(f)/(i) checkouts — only offered for an
                  aircraft that actually needs one, per `selectedAircraft`'s
                  model flags (see aircraft.ts's doc comments for what each
                  flag encodes). */}
              {selectedAircraft?.complex && (
                <>
                  <div className="h-px bg-border" />
                  <EndorsementRow
                    flightId={flightId}
                    mode={mode}
                    type="complex"
                    label="Complex checkout"
                    initialDate={initialValues?.date ?? defaultFlightFormValues().date}
                  />
                </>
              )}
              {selectedAircraft?.highPerformance && (
                <>
                  <div className="h-px bg-border" />
                  <EndorsementRow
                    flightId={flightId}
                    mode={mode}
                    type="high_performance"
                    label="High-performance checkout"
                    initialDate={initialValues?.date ?? defaultFlightFormValues().date}
                  />
                </>
              )}
              {selectedAircraft?.tailwheel && (
                <>
                  <div className="h-px bg-border" />
                  <EndorsementRow
                    flightId={flightId}
                    mode={mode}
                    type="tailwheel"
                    label="Tailwheel checkout"
                    initialDate={initialValues?.date ?? defaultFlightFormValues().date}
                  />
                </>
              )}
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
        checked={!!values[name]}
        onChange={(e) => setField(name, e.target.checked)}
        className="h-3.5 w-3.5 rounded border-border-strong accent-accent"
      />
      {label}
    </label>
  )
}

/**
 * One row of the edit-flight endorsement section — "already logged" readout
 * once one exists for this flight, otherwise a date + log button. Shared by
 * all six `EndorsementType`s (flight review, IPC, checkride, and the three
 * 61.31 checkouts) since the UX is identical; only `type` and `label` vary.
 *
 * Once logged, a pilot can optionally request an electronic signature
 * (issue #68) — a single-use link they send their CFI by whatever means
 * they like, no CFI account needed (see `endorsement-signatures.ts`). The
 * signed readout recomputes `computeEndorsementContentHash` from the
 * endorsement's current fields and compares it against the hash stored at
 * signing time: if they don't match, one of the signed-over fields changed
 * since the CFI signed, and that's surfaced as a warning rather than shown
 * as a normal signed endorsement.
 */
function EndorsementRow({
  flightId,
  mode,
  type,
  label,
  initialDate,
}: {
  flightId?: string
  mode: 'create' | 'edit'
  type: EndorsementType
  label: string
  initialDate: string
}) {
  const [endorsement, setEndorsement] = useState<Endorsement | null>(null)
  const [date, setDate] = useState(initialDate)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [requestingSignature, setRequestingSignature] = useState(false)
  const [signUrl, setSignUrl] = useState('')
  const [showCfiLink, setShowCfiLink] = useState(false)
  const [cfiEmail, setCfiEmail] = useState('')
  // undefined = not looked up yet; null = looked up, no match
  const [cfiLookupResult, setCfiLookupResult] = useState<CfiLookupResult | undefined>(undefined)
  const [lookingUpCfi, setLookingUpCfi] = useState(false)
  const [assigningCfi, setAssigningCfi] = useState(false)

  useEffect(() => {
    if (mode !== 'edit' || !flightId) return
    let cancelled = false
    setLoading(true)
    getEndorsementForFlight({ data: { flightId, type } })
      .then((existing) => {
        if (!cancelled) setEndorsement(existing)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, flightId, type])

  const handleLog = async () => {
    if (!flightId) return
    setError('')
    setSaving(true)
    try {
      const created = await createEndorsement({ data: { flightId, type, date } })
      setEndorsement(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not log ${label.toLowerCase()}`)
    } finally {
      setSaving(false)
    }
  }

  const handleRequestSignature = async () => {
    if (!endorsement) return
    setError('')
    setRequestingSignature(true)
    try {
      const { signUrl: url } = await requestEndorsementSignature({ data: { endorsementId: endorsement.id } })
      setSignUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a signature')
    } finally {
      setRequestingSignature(false)
    }
  }

  const handleLookupCfi = async () => {
    setError('')
    setLookingUpCfi(true)
    try {
      setCfiLookupResult(await findCfiByEmail({ data: { email: cfiEmail } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up that CFI')
    } finally {
      setLookingUpCfi(false)
    }
  }

  const handleAssignCfi = async () => {
    if (!endorsement || !cfiLookupResult) return
    setError('')
    setAssigningCfi(true)
    try {
      const updated = await assignEndorsementInstructor({
        data: { endorsementId: endorsement.id, instructorPilotId: cfiLookupResult.id },
      })
      setEndorsement(updated)
      setShowCfiLink(false)
      setCfiEmail('')
      setCfiLookupResult(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign that CFI')
    } finally {
      setAssigningCfi(false)
    }
  }

  const contentChanged =
    !!endorsement?.signedAt &&
    computeEndorsementContentHash({
      type: endorsement.type,
      date: endorsement.date,
      text: endorsement.text,
      flightId: endorsement.flightId,
      pilotId: endorsement.pilotId,
    }) !== endorsement.contentHash

  return (
    <div className="flex flex-wrap items-center gap-4.5">
      <div className="w-42 flex-shrink-0 text-[10px] font-semibold tracking-wider text-ink-dim uppercase">
        {label}
      </div>
      {loading ? (
        <div className="text-[12.5px] text-ink-dim">Loading…</div>
      ) : endorsement ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[12.5px] text-ink-dim">
            Logged on <span className="font-mono text-ink">{endorsement.date}</span>
            {endorsement.signedAt && (
              <>
                {' — Signed by '}
                <span className="text-ink">{endorsement.instructorName}</span>
                {' (CFI #'}
                {endorsement.instructorCertificateNumber}
                {') on '}
                <span className="font-mono text-ink">{endorsement.signedAt}</span>
              </>
            )}
          </div>
          {!!endorsement.signedAt && !!endorsement.signatureUrl && (
            <img
              src={endorsement.signatureUrl}
              alt="Instructor's drawn signature"
              className="h-14 w-fit max-w-full rounded-md border border-border bg-white object-contain p-1"
            />
          )}
          {contentChanged && (
            <p className="text-xs text-status-bad">
              Content changed since signing — this endorsement no longer matches what the CFI certified.
            </p>
          )}
          {!endorsement.signedAt && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleRequestSignature}
                disabled={requestingSignature}
                className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-ink disabled:opacity-60"
              >
                {requestingSignature
                  ? 'Requesting…'
                  : endorsement.signTokenExpires
                    ? 'Request a new signature link'
                    : 'Request instructor signature'}
              </button>
              {!!signUrl && (
                <input
                  type="text"
                  readOnly
                  value={signUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${fieldClass} w-64`}
                />
              )}
            </div>
          )}
          {!!endorsement.instructorPilotId && !endorsement.signedAt && (
            <p className="text-[12.5px] text-ink-dim">
              Assigned to <span className="text-ink">{endorsement.instructorPilotName || 'linked CFI'}</span> —
              awaiting their signature.
            </p>
          )}
          {!endorsement.signedAt &&
            (showCfiLink ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="email"
                  placeholder="CFI's email"
                  value={cfiEmail}
                  onChange={(e) => {
                    setCfiEmail(e.target.value)
                    setCfiLookupResult(undefined)
                  }}
                  className={`${fieldClass} w-56`}
                />
                {cfiLookupResult === undefined ? (
                  <button
                    type="button"
                    onClick={handleLookupCfi}
                    disabled={lookingUpCfi || !cfiEmail.trim()}
                    className="flex h-7 items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-ink disabled:opacity-60"
                  >
                    {lookingUpCfi ? 'Looking up…' : 'Find CFI'}
                  </button>
                ) : cfiLookupResult === null ? (
                  <span className="text-xs text-status-bad">No linked CFI found for that email.</span>
                ) : (
                  <>
                    <span className="text-xs text-ink">{cfiLookupResult.name}</span>
                    <button
                      type="button"
                      onClick={handleAssignCfi}
                      disabled={assigningCfi}
                      className="flex h-7 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {assigningCfi ? 'Assigning…' : 'Assign'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowCfiLink(false)
                    setCfiEmail('')
                    setCfiLookupResult(undefined)
                  }}
                  className="text-xs font-medium text-ink-dim underline underline-offset-2 hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCfiLink(true)}
                className="flex h-7 w-fit items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-ink"
              >
                {endorsement.instructorPilotId ? 'Assign a different linked CFI' : 'Assign to my linked CFI'}
              </button>
            ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          <button
            type="button"
            onClick={handleLog}
            disabled={saving}
            className="flex h-8 items-center rounded-md border border-border-strong px-3 text-[12.5px] font-medium text-ink disabled:opacity-60"
          >
            {saving ? 'Logging…' : `Log ${label.toLowerCase()} on this flight`}
          </button>
        </div>
      )}
      {!!error && <p className="w-full text-xs text-status-bad">{error}</p>}
    </div>
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
