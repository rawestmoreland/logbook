import { useEffect } from 'react'

import type { ErrorComponentProps } from '@tanstack/react-router'

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <div className="font-mono text-xs font-medium tracking-[0.18em] text-ink">
          LOGBOOK
        </div>
        <h1 className="mt-4 text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-dim">
          We hit an unexpected error loading this page. It may be a temporary
          issue — try again in a moment.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
