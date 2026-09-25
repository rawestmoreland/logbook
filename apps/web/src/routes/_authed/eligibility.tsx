import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { eligibilityQueryOptions } from '#/lib/queries/eligibility'

import type { EligibilityRequirement } from '#/lib/server/eligibility'

export const Route = createFileRoute('/_authed/eligibility')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(eligibilityQueryOptions(pilotId))
  },
  component: EligibilityPage,
})

function formatAmount(r: EligibilityRequirement): string {
  const fmt = (n: number) => (r.unit === 'hours' ? n.toFixed(1) : String(n))
  return `${fmt(r.have)} / ${fmt(r.need)} ${r.unit}`.trim()
}

/** Pass (green) / fail (red) / needs-review (neutral gray) — deliberately a
 * third, distinct color from Currency's current/expiring/expired dots: this
 * isn't "expiring", it's "we don't know," and using the same warn color
 * would overstate how much this page actually verified. */
const heldCertificateLabels: Record<string, string> = {
  private: 'Private Pilot',
  commercial: 'Commercial Pilot',
  atp: 'Airline Transport Pilot',
}

function statusDotClass(r: EligibilityRequirement): string {
  if (r.needsManualReview) return 'bg-ink-faint'
  return r.met ? 'bg-status-good' : 'bg-status-bad'
}

function statusLabel(r: EligibilityRequirement): string {
  if (r.needsManualReview) return 'Needs review'
  return r.met ? 'Met' : 'Not met'
}

function statusBadgeClass(r: EligibilityRequirement): string {
  if (r.needsManualReview) return 'text-ink-dim border-border bg-surface-alt'
  return r.met
    ? 'text-status-good border-status-good/30 bg-status-good/5'
    : 'text-status-bad border-status-bad/30 bg-status-bad/5'
}

function RequirementRow({ requirement: r }: { requirement: EligibilityRequirement }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDotClass(r)}`} />
            {r.label}
          </div>
          <div className="text-[11px] text-ink-faint">{r.citation}</div>
        </div>
        <span
          className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${statusBadgeClass(r)}`}
        >
          {statusLabel(r)}
        </span>
      </div>
      {r.needsManualReview ? (
        <div className="text-[12px] text-ink-dim">{r.note}</div>
      ) : (
        <div className="flex items-baseline gap-1.5 text-[13px] text-ink-dim">
          <span className="font-mono text-ink">{formatAmount(r)}</span>
          <span>required</span>
        </div>
      )}
    </div>
  )
}

function EligibilityPage() {
  const { pilotId } = Route.useRouteContext()
  const { data } = useSuspenseQuery(eligibilityQueryOptions(pilotId))

  return (
    <>
      <div className="flex flex-shrink-0 flex-col gap-0.5 px-8 pt-6">
        <div className="text-lg font-semibold tracking-tight text-ink">
          Private Pilot eligibility — Airplane Single-Engine Land
        </div>
        <div className="text-xs text-ink-dim">
          14 CFR 61.109(a)'s logged-time minimums only — not age, knowledge test, English
          proficiency, or the practical test itself, and not a complete "am I ready to apply"
          answer.
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-2.5 px-8 pt-4.5 pb-6">
        {data.alreadyHeld ? (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-4 text-sm text-ink-dim">
            You already hold a{' '}
            {heldCertificateLabels[data.heldCertificateType ?? ''] ?? 'qualifying'} certificate
            (Airplane Single-Engine Land) — see your certificates on your{' '}
            <Link to="/profile" className="text-accent underline">
              profile
            </Link>
            .
          </div>
        ) : data.flightCount === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-8 text-center text-sm text-ink-dim">
            No flights logged yet — nothing to check yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {data.requirements.map((r) => (
              <RequirementRow key={r.citation + r.label} requirement={r} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
