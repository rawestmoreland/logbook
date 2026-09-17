import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
} from '@tanstack/react-router'

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

const navItemClass = 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim'
const navItemActiveClass =
  'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white'

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
          OpenFlyLog
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className={navItemClass}
            activeProps={{ className: navItemActiveClass }}
          >
            Flights
          </Link>
          <Link
            to="/currency"
            className={navItemClass}
            activeProps={{ className: navItemActiveClass }}
          >
            Currency
          </Link>
          <Link
            to="/analysis"
            className={navItemClass}
            activeProps={{ className: navItemActiveClass }}
          >
            Analysis
          </Link>
          <Link
            to="/aircraft"
            className={navItemClass}
            activeProps={{ className: navItemActiveClass }}
          >
            Aircraft
          </Link>
          <Link
            to="/import"
            className={navItemClass}
            activeProps={{ className: navItemActiveClass }}
          >
            Import
          </Link>
          <Link
            to="/starting-totals"
            className={navItemClass}
            activeProps={{ className: navItemActiveClass }}
          >
            Starting totals
          </Link>
        </div>
        <div className="flex-grow" />
        <Link
          to="/profile"
          className="flex items-center gap-2.5 text-sm text-ink-dim hover:text-ink"
          activeProps={{
            className:
              'flex items-center gap-2.5 text-sm text-ink hover:text-ink',
          }}
        >
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border bg-ground text-[11px] font-semibold text-ink-dim">
            {initials}
          </span>
          {user.email}
        </Link>
        <button
          onClick={handleSignOut}
          className="text-sm text-ink-dim hover:text-ink"
        >
          Sign out
        </button>
      </div>

      <Outlet />
    </div>
  )
}
