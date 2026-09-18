import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { pendingFlightsQueryOptions } from '#/lib/queries/flights'
import { confirmPendingFlight, deleteFlight } from '#/lib/server/flights'

import type { FlightListItem } from '#/lib/server/flights'

export const Route = createFileRoute('/_authed/pending-flights')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(pendingFlightsQueryOptions(pilotId))
  },
  component: PendingFlightsPage,
})

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

function PendingFlightsPage() {
  const { pilotId } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const { data: flights } = useSuspenseQuery(pendingFlightsQueryOptions(pilotId))

  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [discardingId, setDiscardingId] = useState<string | null>(null)
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pending-flights', pilotId] }),
      queryClient.invalidateQueries({ queryKey: ['flights-summary', pilotId] }),
      queryClient.invalidateQueries({ queryKey: ['flights-page', pilotId] }),
    ])

  const handleConfirm = async (id: string) => {
    setActionError('')
    setConfirmingId(id)
    try {
      await confirmPendingFlight({ data: { id } })
      await invalidateAll()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not confirm flight')
    } finally {
      setConfirmingId(null)
    }
  }

  const handleDiscard = async (id: string) => {
    setActionError('')
    setDiscardingId(id)
    try {
      await deleteFlight({ data: { id } })
      await invalidateAll()
      setConfirmingDiscardId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not discard flight')
    } finally {
      setDiscardingId(null)
    }
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-end gap-4 px-8 pt-6">
        <div className="flex flex-col gap-0.5">
          <div className="text-lg font-semibold tracking-tight text-ink">Pending Flights</div>
          <div className="text-xs text-ink-dim">
            Logged but not yet confirmed — held out of totals and currency until reviewed
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px]">
          <span className="text-[10px] font-semibold tracking-wider text-ink-dim uppercase">Pending</span>
          <span className="font-mono font-medium text-ink">{flights.length}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-2.5 px-8 pt-4.5 pb-6">
        {flights.length === 0 && (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            No pending flights — everything logged has been confirmed.
          </div>
        )}

        {flights.map((flight: FlightListItem) => {
          const confirming = confirmingId === flight.id
          const discarding = discardingId === flight.id
          const confirmingDiscard = confirmingDiscardId === flight.id
          return (
            <div
              key={flight.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-sm font-medium text-ink">{fmtDate(flight.date)}</span>
                {flight.aircraftIdent && (
                  <span className="font-mono text-xs text-ink-dim">{flight.aircraftIdent}</span>
                )}
                {flight.route && (
                  <span className="text-xs text-ink-faint">{flight.route}</span>
                )}
                <span className="font-mono text-xs text-ink-dim">
                  {flight.totalTime.toFixed(1)} hrs · {flight.totalLandings} ldg
                  {flight.totalLandings === 1 ? '' : 's'}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  <Link
                    to="/log-flight/$flightId"
                    params={{ flightId: flight.id }}
                    className="flex h-7 items-center rounded-md border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink"
                  >
                    Edit
                  </Link>

                  {confirmingDiscard ? (
                    <>
                      <span className="text-xs text-ink-dim">Discard this flight?</span>
                      <button
                        type="button"
                        onClick={() => handleDiscard(flight.id)}
                        disabled={discarding}
                        className="flex h-7 items-center rounded-md bg-status-bad px-2.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {discarding ? 'Discarding…' : 'Confirm discard'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDiscardId(null)}
                        disabled={discarding}
                        className="flex h-7 items-center rounded-md border border-border-strong bg-surface px-2.5 text-xs font-medium text-ink disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDiscardId(flight.id)}
                      className="flex h-7 items-center rounded-md border border-border-strong bg-surface px-2.5 text-xs font-medium text-status-bad"
                    >
                      Discard
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleConfirm(flight.id)}
                    disabled={confirming}
                    className="flex h-7 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    {confirming ? 'Confirming…' : 'Confirm'}
                  </button>
                </div>
              </div>
              {flight.remarks && <p className="text-xs text-ink-dim">{flight.remarks}</p>}
            </div>
          )
        })}
      </div>

      {!!actionError && <p className="px-8 pb-4 text-xs text-status-bad">{actionError}</p>}
    </>
  )
}
