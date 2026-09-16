import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthError, useAuthActions } from '#/contexts/auth-context'

export const Route = createFileRoute('/sign-up')({ component: SignUpPage })

function SignUpPage() {
  const { signUp, signInWithOTP } = useAuthActions()
  const navigate = useNavigate()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [otpId, setOtpId] = useState('')
  const [code, setCode] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    setFormError('')
    setSubmitting(true)
    try {
      const id = await signUp(email)
      setOtpId(id)
      setStep('code')
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

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      await signInWithOTP(otpId, code)
      await navigate({ to: '/' })
    } catch (error) {
      if (error instanceof AuthError) {
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
            LOGBOOK
          </div>
          <h1 className="mt-3 text-lg font-semibold text-ink">Create an account</h1>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleCreateAccount} className="flex flex-col gap-4">
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

            {!!formError && <p className="text-xs text-status-bad">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 h-9 rounded-md bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {submitting ? 'Sending code…' : 'Send sign-up code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <p className="text-xs text-ink-dim">
              We sent a one-time code to <span className="text-ink">{email}</span>.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-xs font-medium text-ink-dim">
                One-time code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
              />
            </div>

            {!!formError && <p className="text-xs text-status-bad">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 h-9 rounded-md bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {submitting ? 'Verifying…' : 'Verify and create account'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('email')
                setCode('')
                setFormError('')
              }}
              className="text-center text-xs text-ink-dim hover:text-ink"
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-ink-dim">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-medium text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
