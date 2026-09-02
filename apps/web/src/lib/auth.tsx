'use client';

/**
 * The real, signed-in session (BUILD_ROADMAP.md Milestone 1.3, Authentication) —
 * deliberately separate from `session.tsx`'s "Acting as" role switcher, which
 * remains the Developer Preview's dev-header convenience and is untouched by
 * this file.
 *
 * The session token travels in the URL fragment after the OIDC callback
 * (`/auth/callback#token=...`), read once by that page and handed here — a
 * fragment is never sent to any server, including Witness's own, so this is
 * the one hop where the token is briefly visible in a URL at all. From then
 * on it lives in `sessionStorage` (cleared when the tab closes) and is sent
 * only as `Authorization: Bearer <token>`.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { CurrentUserView } from '@witness/contracts';

import { ApiError, authApi } from './api';

const STORAGE_KEY = 'witness.auth.sessionToken';
const LOGOUT_EVENT_KEY = 'witness.auth.logout';

/**
 * `'unauthenticated'` means "no session, or one that will never become
 * valid again" — the sign-in prompt is the right next step. `'suspended'`
 * and `'deactivated'` are a *different* problem the person didn't cause and
 * signing in again will not fix, so they get their own message rather than
 * being folded into `'unauthenticated'`. `'error'` is a `GET /api/v1/me`
 * that failed for a reason that says nothing about the session's validity
 * (network failure, a 5xx) — the token is kept, not discarded, because
 * discarding it here would force a full OIDC round trip to recover from
 * what might just be the API restarting.
 */
export type AuthStatus =
  'loading' | 'authenticated' | 'unauthenticated' | 'suspended' | 'deactivated' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  currentUser: CurrentUserView | null;
  /** Set only when `status` is `'error'` — the message the API gave for why `/me` could not be checked. */
  errorMessage: string | null;
  setSessionToken: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Codes for which the session itself is genuinely, permanently invalid — clear it and re-prompt. */
const DISCARD_TOKEN_CODES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'UNKNOWN_ACCOUNT']);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<CurrentUserView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      setToken(stored);
      if (stored === null) setStatus('unauthenticated');
    } catch {
      setStatus('unauthenticated');
    }
  }, []);

  // sessionStorage is intentionally tab-scoped, so a logout in one tab would
  // otherwise leave another tab presenting stale authenticated UI. Broadcast
  // only a logout signal; never send the bearer token or any session material.
  useEffect(() => {
    const clearLocalSession = () => {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // Non-fatal.
      }
      setToken(null);
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
      if (event.data === 'logout') clearLocalSession();
    });

    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
    };
  }, []);

  useEffect(() => {
    if (token === null) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    // A single failed check on a flaky connection (mobile data, poor wifi)
    // shouldn't strand the badge on "Could not verify sign-in — retrying…"
    // with nothing actually retrying behind it — that text is a promise, and
    // this is what keeps it true. Bounded by `cancelled`/the cleanup below,
    // so it stops the moment the token changes or the provider unmounts.
    const check = () => {
      authApi
        .me(token)
        .then((user) => {
          if (cancelled) return;
          setCurrentUser(user);
          setErrorMessage(null);
          setStatus('authenticated');
        })
        .catch((error: unknown) => {
          if (cancelled) return;

          const code = error instanceof ApiError ? error.code : 'SESSION_CHECK_FAILED';

          if (!DISCARD_TOKEN_CODES.has(code)) {
            // Suspended/deactivated (403 — the account, not the session, is
            // the problem) and any network/server failure keep the token:
            // discarding it would force a full OIDC round trip to recover
            // from something that isn't a session problem at all.
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

          try {
            window.sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            // Non-fatal.
          }
          setCurrentUser(null);
          setStatus('unauthenticated');
        });
    };

    check();

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      currentUser,
      errorMessage,
      setSessionToken: (next: string) => {
        try {
          window.sessionStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Non-fatal — the token still works for this page load via state.
        }
        setToken(next);
        setStatus('loading');
      },
      signOut: () => {
        if (token !== null) {
          void authApi.logout(token);
        }
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
          window.localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()));
        } catch {
          // Non-fatal.
        }
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('witness-auth');
          channel.postMessage('logout');
          channel.close();
        }
        setToken(null);
        setCurrentUser(null);
        setErrorMessage(null);
        setStatus('unauthenticated');
      },
    }),
    [status, currentUser, errorMessage, token],
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
