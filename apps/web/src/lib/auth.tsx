'use client';

/**
 * The real, signed-in session (BUILD_ROADMAP.md Milestone 1.3, Authentication) —
 * deliberately separate from `session.tsx`'s "Acting as" role switcher, which
 * remains the Developer Preview's dev-header convenience and is untouched by
 * this file.
 *
 * Browser session authority is an opaque, host-only HttpOnly cookie owned by
 * the API. Every tab resolves it independently through `GET /api/v1/me`;
 * frontend JavaScript never receives or stores the credential.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { CurrentUserView } from '@witness/contracts';

import { ApiError, authApi } from './api';

const LOGOUT_EVENT_KEY = 'witness.auth.logout';
const LEGACY_SESSION_STORAGE_KEY = 'witness.auth.sessionToken';

/**
 * `'unauthenticated'` means "no session, or one that will never become
 * valid again" — the sign-in prompt is the right next step. `'suspended'`
 * and `'deactivated'` are a *different* problem the person didn't cause and
 * signing in again will not fix, so they get their own message rather than
 * being folded into `'unauthenticated'`. `'error'` is a `GET /api/v1/me`
 * that failed for a reason that says nothing about the session's validity
 * (network failure, a 5xx) — the cookie is left untouched because a transient
 * outage says nothing about the server session's validity.
 */
export type AuthStatus =
  'loading' | 'authenticated' | 'unauthenticated' | 'suspended' | 'deactivated' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  currentUser: CurrentUserView | null;
  /** Set only when `status` is `'error'` — the message the API gave for why `/me` could not be checked. */
  errorMessage: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Codes for which the session itself is genuinely, permanently invalid — clear it and re-prompt. */
const DISCARD_SESSION_CODES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'UNKNOWN_ACCOUNT']);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<CurrentUserView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Controlled cutover: discard the legacy client-readable credential. It is
  // never read, copied into the cookie, or accepted as a second browser authority.
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    } catch {
      // Storage can be unavailable; the cookie flow does not depend on it.
    }
  }, []);

  // The cookie is shared automatically. This signal only removes stale UI
  // promptly after the server has revoked it; it contains no session material.
  useEffect(() => {
    const clearLocalSession = () => {
      setCurrentUser(null);
      setErrorMessage(null);
      setStatus('unauthenticated');
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_EVENT_KEY) clearLocalSession();
    };

    window.addEventListener('storage', onStorage);
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('witness-auth');
    channel?.addEventListener('message', (event: MessageEvent) => {
      if (event.data === 'session-invalidated') clearLocalSession();
    });

    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    // A single failed check on a flaky connection (mobile data, poor wifi)
    // shouldn't strand the badge on "Could not verify sign-in — retrying…"
    // with nothing actually retrying behind it — that text is a promise, and
    // this is what keeps it true. Bounded by `cancelled`/the cleanup below,
    // so it stops when the provider unmounts.
    const check = () => {
      authApi
        .me()
        .then((user) => {
          if (cancelled) return;
          setCurrentUser(user);
          setErrorMessage(null);
          setStatus('authenticated');
        })
        .catch((error: unknown) => {
          if (cancelled) return;

          const code = error instanceof ApiError ? error.code : 'SESSION_CHECK_FAILED';

          if (!DISCARD_SESSION_CODES.has(code)) {
            // Suspended/deactivated (403 — the account, not the session, is
            // the problem) and network/server failures leave the HttpOnly
            // cookie untouched; only the server decides session validity.
            setCurrentUser(null);
            if (code === 'ACCOUNT_SUSPENDED') {
              setStatus('suspended');
            } else if (code === 'ACCOUNT_DEACTIVATED') {
              setStatus('deactivated');
            } else {
              setErrorMessage(
                error instanceof ApiError
                  ? error.message
                  : 'Could not verify the session. Try again.',
              );
              setStatus('error');
              retryTimer = setTimeout(check, 5_000);
            }
            return;
          }

          setCurrentUser(null);
          setStatus('unauthenticated');
        });
    };

    check();
    const refreshTimer = setInterval(check, 60_000);

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      clearInterval(refreshTimer);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      currentUser,
      errorMessage,
      signOut: async () => {
        setStatus('loading');
        try {
          await authApi.logout();
          try {
            window.localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()));
          } catch {
            // Non-fatal.
          }
          if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('witness-auth');
            channel.postMessage('session-invalidated');
            channel.close();
          }
          setCurrentUser(null);
          setErrorMessage(null);
          setStatus('unauthenticated');
        } catch (error: unknown) {
          setErrorMessage(
            error instanceof ApiError ? error.message : 'Could not sign out. Try again.',
          );
          setStatus('error');
        }
      },
    }),
    [status, currentUser, errorMessage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}
