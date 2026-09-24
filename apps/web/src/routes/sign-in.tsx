import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthError, useAuthActions } from '#/contexts/auth-context'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

function SignInPage() {
  const { signIn } = useAuthActions()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setFormError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      await navigate({ to: '/' })
    } catch (error) {
      if (error instanceof AuthError && error.fields) {
        setFieldErrors(error.fields)
      } else if (error instanceof AuthError) {
        setFormError(error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6">
          <div className="font-mono text-xs font-medium tracking-[0.18em] text-ink">
            OpenFlyLog
          </div>
          <h1 className="mt-3 text-lg font-semibold text-ink">Sign in</h1>
        </div>

        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-ink-dim">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
            />
            {fieldErrors.email && (
              <p className="text-xs text-status-bad">{fieldErrors.email}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium text-ink-dim"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
            />
            {fieldErrors.password && (
              <p className="text-xs text-status-bad">{fieldErrors.password}</p>
            )}
          </div>

          {!!formError && (
            <p className="text-xs text-status-bad">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 h-9 rounded-md bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-dim">
          No account?{' '}
          <Link
            to="/sign-up"
            className="font-medium text-accent hover:text-accent-hover"
          >
            Sign up
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-ink-dim">
          Forgot your password?{' '}
          <Link
            to="/pass-reset"
            className="font-medium text-accent hover:text-accent-hover"
          >
            Request a reset
          </Link>
        </p>
      </div>
    </div>
  )
}
