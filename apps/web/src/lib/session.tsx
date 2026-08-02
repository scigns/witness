'use client';

/**
 * "Acting as" — the Developer Preview's stand-in for a session.
 *
 * This is a role switcher, not a login. It is presented as a role switcher on
 * purpose: a preview that renders a convincing sign-in form teaches everyone who
 * sees it that authentication exists, and it does not. Keycloak is Phase 2.
 *
 * Making the role switchable in one click is also the fastest way to demonstrate
 * that the authorisation boundary is real — switch to `reader`, and the review
 * controls stop working because the API denies them, not because the UI hid them.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ActingUser } from './api';

const STORAGE_KEY = 'witness.preview.actingUser';

const DEFAULT_USER: ActingUser = { name: 'Mele Tupou', role: 'reviewer' };

interface SessionContextValue {
  user: ActingUser;
  setUser: (user: ActingUser) => void;
  ready: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<ActingUser>(DEFAULT_USER);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setUserState(JSON.parse(stored) as ActingUser);
      }
    } catch {
      // Corrupt or unavailable storage is not worth failing over — fall back to
      // the default and carry on.
    }
    setReady(true);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      ready,
      setUser: (next: ActingUser) => {
        setUserState(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Non-fatal.
        }
      },
    }),
    [user, ready],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);

  if (context === null) {
    throw new Error('useSession must be used inside a SessionProvider.');
  }

  return context;
}
