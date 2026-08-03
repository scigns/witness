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

import { authApi } from './api';

const STORAGE_KEY = 'witness.auth.sessionToken';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  currentUser: CurrentUserView | null;
  setSessionToken: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<CurrentUserView | null>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      setToken(stored);
      if (stored === null) setStatus('unauthenticated');
    } catch {
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    if (token === null) return;

    let cancelled = false;

    authApi
      .me(token)
      .then((user) => {
        if (cancelled) return;
        setCurrentUser(user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        // An expired or otherwise invalid session reads the same as never
        // having signed in — no error state the user has to dismiss, just
        // back to signed-out.
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // Non-fatal.
        }
        setCurrentUser(null);
        setStatus('unauthenticated');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      currentUser,
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
        } catch {
          // Non-fatal.
        }
        setToken(null);
        setCurrentUser(null);
        setStatus('unauthenticated');
      },
    }),
    [status, currentUser, token],
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
