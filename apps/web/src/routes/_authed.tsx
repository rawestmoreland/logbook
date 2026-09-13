import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router'

import { useAuthActions } from '#/contexts/auth-context'
import { getAuthUser } from '#/lib/server/auth'
import { getOrCreatePilot } from '#/lib/server/pilots'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const user = await getAuthUser()
    if (!user) {
      throw redirect({ to: '/sign-in' })
    }

    const pilot = await getOrCreatePilot()
    return { user, pilotId: pilot.id }
  },
  component: AuthedLayout,
})

// Currency/Aircraft/Import aren't built yet (see the brief's next-block-of-work
// ordering) — shown as inert labels rather than dead links.
const NAV_ITEMS = ['Flights', 'Currency', 'Aircraft', 'Import']

function AuthedLayout() {
  const { user } = Route.useRouteContext()
  const { signOut } = useAuthActions()
  const navigate = useNavigate()

  const initials = user.email.slice(0, 2).toUpperCase()

  const handleSignOut = () => {
    signOut()
    navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <div className="flex h-14 flex-shrink-0 items-center gap-8 border-b border-border bg-surface px-8">
        <div className="font-mono text-xs font-medium tracking-[0.18em] text-ink">
          LOGBOOK
        </div>
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((label, i) => (
            <div
              key={label}
              className={
                i === 0
                  ? 'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim'
              }
            >
              {label}
            </div>
          ))}
        </div>
        <div className="flex-grow" />
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 text-sm text-ink-dim hover:text-ink"
        >
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border bg-ground text-[11px] font-semibold text-ink-dim">
            {initials}
          </span>
          {user.email}
        </button>
      </div>

      <Outlet />
    </div>
  )
}
