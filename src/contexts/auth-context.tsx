import { UsersRecord } from '@/lib/pocketbase-types';
import { pb } from '@/lib/sync/pocketbase';
import { AuthRecord, ClientResponseError } from 'pocketbase';
import {
  createContext,
  use,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

// Normalized shape every call site can rely on, regardless of what
// PocketBase actually threw.
export class AuthError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.fields = fields;
  }
}

function toAuthError(err: unknown): AuthError {
  if (err instanceof ClientResponseError) {
    // Network/offline errors have no meaningful status from the server.
    if (err.status === 0) {
      return new AuthError(
        'Unable to reach the server. Check your connection.',
        0,
      );
    }

    if (err.status === 429) {
      return new AuthError(
        'Too many attempts. Please wait and try again.',
        429,
      );
    }

    // Per-field validation errors, e.g. { password: { message: '...' } }
    const rawFields = err.data?.data as
      | Record<string, { message: string }>
      | undefined;
    const fields =
      rawFields && Object.keys(rawFields).length > 0
        ? Object.fromEntries(
            Object.entries(rawFields).map(([key, val]) => [key, val.message]),
          )
        : undefined;

    // PocketBase intentionally gives a generic message for bad credentials
    // (to avoid leaking which emails exist) — pass that through as-is
    // rather than trying to be more specific.
    return new AuthError(
      err.message || 'Something went wrong.',
      err.status,
      fields,
    );
  }

  // Not a PocketBase error at all (e.g. a bug elsewhere) — don't leak
  // internals, but don't swallow it silently either.
  console.error('Unexpected auth error:', err);
  return new AuthError('Something went wrong. Please try again.', -1);
}

const AuthContext = createContext<{
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    passwordConfirm: string,
  ) => Promise<void>;
  signOut: () => void;
  isValid: boolean;
  user?: AuthRecord | undefined;
} | null>(null);

// Use this hook to access the user info.
export function useSession() {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useSession must be wrapped in a <SessionProvider />');
  }

  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  // authStore.onChange doesn't fire on initial mount, so seed from
  // current state, then subscribe for updates (sign-in/sign-out/refresh).
  const [isValid, setIsValid] = useState(pb.authStore.isValid);
  const [user, setUser] = useState(pb.authStore.record);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      setIsValid(pb.authStore.isValid);
      setUser(pb.authStore.record);
    });

    // The stored token may still look locally valid (unexpired) even
    // though the underlying user was deleted or the token was revoked
    // server-side. Revalidate on load and drop the stale session if so.
    if (pb.authStore.isValid) {
      pb.collection('users')
        .authRefresh()
        .catch(() => {
          pb.authStore.clear();
        });
    }

    return unsub;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        signIn: async (email, password) => {
          try {
            await pb.collection('users').authWithPassword(email, password);
          } catch (err) {
            throw toAuthError(err);
          }
        },
        signUp: async (email, password, passwordConfirm) => {
          try {
            await pb.collection<UsersRecord>('users').create({
              email,
              password,
              passwordConfirm,
            });
            await pb.collection('users').authWithPassword(email, password);
          } catch (err) {
            throw toAuthError(err);
          }
        },
        signOut: () => {
          pb.authStore.clear();
        },
        isValid,
        user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
