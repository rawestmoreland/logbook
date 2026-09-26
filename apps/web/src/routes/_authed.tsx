import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { classNames } from '#/lib/helpers'
import { CURRENCY_STATE_DOT_CLASS, nextCurrencyDeadline } from '#/lib/currency-summary'
import { currencyQueryOptions } from '#/lib/queries/currency'
import { POCKETBASE_URL } from '#/lib/pocketbase'
import { getAuthUser } from '#/lib/server/auth'
import { getOrCreatePilot } from '#/lib/server/pilots'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import {
  ClipboardCheckIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  LibraryBigIcon,
  MenuIcon,
  PlaneIcon,
  PlaneTakeoffIcon,
  Settings2Icon,
  ShieldCheckIcon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'

import type { AuthUser } from '#/lib/server/auth'
import type { Pilot } from '#/lib/server/pilots'
import type { LucideIcon } from 'lucide-react'

/**
 * Icon language: each icon reflects what kind of page it leads to, not
 * whichever lucide glyph looked plane-adjacent.
 *  - Flights is the ledger of things that happened (a takeoff)
 *  - Aircraft is your fleet (a static aircraft), Aircraft catalog is
 *    reference data about aircraft you don't own (a library)
 *  - Currency is regulatory compliance (a shield)
 *  - IACRA totals and Eligibility are both FAA paperwork — the clipboard
 *    family — split by list (totals) vs. pass/fail (a checklist)
 *  - Instruct/Admin are role-gated, not everyday nav, so they get their own
 *    icons (a cap for teaching, a gear for configuration) in a separate
 *    section rather than blending into the primary list
 */
const NAVIGATION: Array<{ name: string; href: string; icon: LucideIcon }> = [
  { name: 'Flights', href: '/', icon: PlaneTakeoffIcon },
  { name: 'Aircraft', href: '/aircraft', icon: PlaneIcon },
  { name: 'Aircraft catalog', href: '/aircraft-models', icon: LibraryBigIcon },
  { name: 'Currency', href: '/currency', icon: ShieldCheckIcon },
  { name: 'IACRA totals', href: '/iacra-totals', icon: ClipboardListIcon },
  { name: 'Eligibility', href: '/eligibility', icon: ClipboardCheckIcon },
]

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const user = await getAuthUser()
    if (!user) {
      throw redirect({ to: '/sign-in' })
    }

    const pilot = await getOrCreatePilot()
    return {
      user,
      pilot,
      pilotId: pilot.id,
      isInstructor: pilot.isInstructor,
      isAdmin: pilot.isAdmin,
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const location = useLocation()
  const { user, pilot, isInstructor, isAdmin, pilotId } = Route.useRouteContext()

  const roleNav: Array<{ name: string; href: string; icon: LucideIcon }> = [
    ...(isInstructor ? [{ name: 'Instruct', href: '/instruct', icon: GraduationCapIcon }] : []),
    ...(isAdmin ? [{ name: 'Admin', href: '/admin', icon: Settings2Icon }] : []),
  ]

  return (
    <div className="flex h-full print:h-auto">
      {/* mobile drawer */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden print:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-ink/40 transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />
        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative flex w-full max-w-72 flex-1 transform flex-col bg-surface transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border px-4">
              <span className="font-mono text-[13px] font-medium tracking-[0.18em] text-ink">
                LOGBOOK
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="-m-2 p-2 text-ink-dim hover:text-ink"
              >
                <span className="sr-only">Close menu</span>
                <XIcon aria-hidden="true" className="size-5" />
              </button>
            </div>
            <SidebarContents
              location={location.pathname}
              roleNav={roleNav}
              pilotId={pilotId}
              pilot={pilot}
              user={user}
              onNavigate={() => setSidebarOpen(false)}
            />
          </DialogPanel>
        </div>
      </Dialog>

      {/* desktop sidebar */}
      <div className="hidden w-60 flex-shrink-0 flex-col border-r border-border bg-surface lg:flex print:hidden">
        <div className="flex h-14 flex-shrink-0 items-center px-5">
          <Link to="/" className="font-mono text-[13px] font-medium tracking-[0.18em] text-ink">
            LOGBOOK
          </Link>
        </div>
        <SidebarContents
          location={location.pathname}
          roleNav={roleNav}
          pilotId={pilotId}
          pilot={pilot}
          user={user}
        />
      </div>

      <div className="flex min-h-0 flex-grow flex-col print:h-auto">
        {/* mobile topbar */}
        <div className="flex h-13 flex-shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden print:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-m-2 p-2 text-ink-dim hover:text-ink"
          >
            <span className="sr-only">Open menu</span>
            <MenuIcon aria-hidden="true" className="size-5" />
          </button>
          <span className="font-mono text-[12px] font-medium tracking-[0.16em] text-ink">
            LOGBOOK
          </span>
          <div className="flex-grow" />
          <Link to="/profile">
            <span className="sr-only">Your profile</span>
            <PilotAvatar user={user} pilot={pilot} size="sm" />
          </Link>
        </div>

        <main className="min-h-0 flex-grow overflow-auto print:h-auto print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Shared between the desktop rail and the mobile drawer — same nav list, status card, and profile row either way. */
function SidebarContents({
  location,
  roleNav,
  pilotId,
  pilot,
  user,
  onNavigate,
}: {
  location: string
  roleNav: Array<{ name: string; href: string; icon: LucideIcon }>
  pilotId: string
  pilot: Pilot
  user: AuthUser
  onNavigate?: () => void
}) {
  return (
    <>
      <nav className="flex min-h-0 flex-grow flex-col overflow-y-auto py-2">
        <NavList items={NAVIGATION} location={location} onNavigate={onNavigate} />
        {roleNav.length > 0 && (
          <>
            <div className="mt-2 border-t border-border/70 pt-2">
              <div className="px-4 pb-1 text-[9.5px] font-semibold tracking-wider text-ink-faint uppercase">
                Instructor
              </div>
              <NavList items={roleNav} location={location} onNavigate={onNavigate} />
            </div>
          </>
        )}
      </nav>

      <div className="flex-shrink-0 px-3 pb-2.5">
        <CurrencyStatus pilotId={pilotId} onNavigate={onNavigate} />
      </div>

      <Link
        to="/profile"
        onClick={onNavigate}
        className="flex flex-shrink-0 items-center gap-2.5 border-t border-border px-4 py-3 hover:bg-surface-alt"
      >
        <PilotAvatar user={user} pilot={pilot} size="md" />
        <span className="overflow-hidden text-[12.5px] font-medium text-ink text-ellipsis whitespace-nowrap">
          {pilot.name}
        </span>
      </Link>
    </>
  )
}

function NavList({
  items,
  location,
  onNavigate,
}: {
  items: Array<{ name: string; href: string; icon: LucideIcon }>
  location: string
  onNavigate?: () => void
}) {
  return (
    <ul className="flex flex-col gap-0.5 px-3">
      {items.map((item) => {
        const active = location === item.href
        return (
          <li key={item.name}>
            <Link
              to={item.href}
              onClick={onNavigate}
              className={classNames(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px]',
                active
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-ink-dim hover:bg-surface-alt hover:text-ink',
              )}
            >
              <item.icon
                aria-hidden="true"
                className={classNames('size-3.5 flex-shrink-0', active ? 'text-accent' : 'text-ink-faint')}
              />
              {item.name}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The sidebar's one non-navigation opportunity: the nearest currency
 * deadline across every rule the server computed, so a pilot sees whether
 * anything needs attention without opening the Currency page. Hidden
 * outright rather than erroring the whole shell if the currency fetch
 * fails, and while there's nothing due (a brand-new pilot with no flights).
 */
function CurrencyStatus({ pilotId, onNavigate }: { pilotId: string; onNavigate?: () => void }) {
  const { data, isPending, isError } = useQuery(currencyQueryOptions(pilotId))

  if (isError) return null

  if (isPending) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-alt px-2.5 py-2.5">
        <div className="h-2 w-14 animate-pulse rounded bg-ink-zero" />
        <div className="h-2.5 w-24 animate-pulse rounded bg-ink-zero" />
      </div>
    )
  }

  const deadline = nextCurrencyDeadline(data)
  if (!deadline) return null

  const headline =
    deadline.state === 'expired'
      ? 'Expired'
      : deadline.state === 'current'
        ? 'Current'
        : `Expires in ${deadline.daysRemaining} day${deadline.daysRemaining === 1 ? '' : 's'}`

  return (
    <Link
      to="/currency"
      onClick={onNavigate}
      className="flex flex-col gap-1 rounded-lg border border-border bg-surface-alt px-2.5 py-2.5 hover:border-border-strong"
    >
      <div className="flex items-center gap-1.5">
        <span className={classNames('h-1.5 w-1.5 rounded-full', CURRENCY_STATE_DOT_CLASS[deadline.state])} />
        <span className="text-[9.5px] font-semibold tracking-wider text-ink-dim uppercase">Currency</span>
      </div>
      <div className="text-[12.5px] font-medium text-ink">{headline}</div>
      <div className="overflow-hidden text-[10.5px] text-ink-faint text-ellipsis whitespace-nowrap">
        {deadline.label}
      </div>
    </Link>
  )
}

function PilotAvatar({
  user,
  pilot,
  size,
}: {
  user: AuthUser
  pilot: Pilot
  size: 'sm' | 'md'
}) {
  const dims = size === 'sm' ? 'size-6.5 text-[10px]' : 'size-7 text-[11px]'

  if (user.avatar) {
    return (
      <img
        alt=""
        src={`${POCKETBASE_URL}/api/files/users/${user.id}/${user.avatar}`}
        className={classNames(dims, 'flex-shrink-0 rounded-full bg-accent-soft object-cover')}
      />
    )
  }

  const initials =
    pilot.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?'

  return (
    <div
      className={classNames(
        dims,
        'flex flex-shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent',
      )}
    >
      {initials}
    </div>
  )
}
