import { ClientResponseError } from 'pocketbase'
import { createContext, use } from 'react'

import type { UsersRecord } from '@logbook/core'
import type { PropsWithChildren } from 'react'

import { pb } from '@/lib/pocketbase'

// Normalized shape every call site can rely on, regardless of what
// PocketBase actually threw. Mirrors the mobile app's auth-context.tsx.
export class AuthError extends Error {
  status: number
  fields?: Record<string, string>

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.fields = fields
  }
}

function toAuthError(err: unknown): AuthError {
  if (err instanceof ClientResponseError) {
    if (err.status === 0) {
      return new AuthError('Unable to reach the server. Check your connection.', 0)
    }

    if (err.status === 429) {
      return new AuthError('Too many attempts. Please wait and try again.', 429)
    }

    const rawFields = err.data.data as Record<string, { message: string }> | undefined
    const fields =
      rawFields && Object.keys(rawFields).length > 0
        ? Object.fromEntries(Object.entries(rawFields).map(([key, val]) => [key, val.message]))
        : undefined

    return new AuthError(err.message || 'Something went wrong.', err.status, fields)
  }

  console.error('Unexpected auth error:', err)
  return new AuthError('Something went wrong. Please try again.', -1)
}

const AuthContext = createContext<{
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, passwordConfirm: string) => Promise<void>
  signOut: () => void
} | null>(null)

export function useAuthActions() {
  const value = use(AuthContext)
  if (!value) {
    throw new Error('useAuthActions must be used within a <AuthProvider>')
  }
  return value
}

export function AuthProvider({ children }: PropsWithChildren) {
  return (
    <AuthContext.Provider
      value={{
        signIn: async (email, password) => {
          try {
            await pb.collection('users').authWithPassword(email, password)
          } catch (err) {
            throw toAuthError(err)
          }
        },
        signUp: async (email, password, passwordConfirm) => {
          try {
            await pb.collection<UsersRecord>('users').create({
              email,
              password,
              passwordConfirm,
            })
            await pb.collection('users').authWithPassword(email, password)
          } catch (err) {
            throw toAuthError(err)
          }
        },
        signOut: () => {
          pb.authStore.clear()
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
