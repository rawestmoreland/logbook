import { Link } from '@tanstack/react-router'

export function RootNotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <div className="font-mono text-xs font-medium tracking-[0.18em] text-ink">
          LOGBOOK
        </div>
        <h1 className="mt-4 text-lg font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-dim">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Back to flights
        </Link>
      </div>
    </div>
  )
}
