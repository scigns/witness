'use client';

/**
 * Application shell — navigation, identity, and the honesty banner.
 *
 * The preview banner is not decoration. A user who cannot tell whether a
 * capability is broken or simply not built yet will report bugs against features
 * that do not exist, and — worse — may trust an unreviewed record as though it
 * were institutional memory. The banner is persistent for that reason.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import type { CurrentUserView } from '@witness/contracts';

import { useAuth, type AuthStatus } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { IS_DEVELOPMENT_BUILD, type ActingUser } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/workspaces', label: 'Programs' },
  { href: '/records', label: 'Records' },
  { href: '/records/new', label: 'Capture' },
  { href: '/pricing', label: 'Pricing' },
] as const;

const ROLES: ReadonlyArray<ActingUser['role']> = ['reader', 'contributor', 'reviewer', 'admin'];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, setUser } = useSession();
  const { status, currentUser, errorMessage, signOut } = useAuth();

  return (
    <div className="min-h-dvh flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-[var(--color-accent-contrast)]"
      >
        Skip to main content
      </a>

      <div
        role="status"
        className="border-b border-[var(--color-line)] bg-[var(--color-accent-soft)] px-4 py-2 text-center text-sm"
      >
        {IS_DEVELOPMENT_BUILD ? (
          <>
            <strong>Developer Preview</strong> — not production software. Requests are{' '}
            <strong>not authenticated</strong>. Content here is synthetic.
          </>
        ) : (
          <>
            <strong>Protected workspace</strong> — your work is authenticated, recorded and
            traceable to its source.
          </>
        )}
      </div>

      <header className="border-b border-[var(--color-line)] bg-[var(--color-paper-raised)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 place-items-center rounded bg-[var(--color-accent)] text-sm font-bold text-[var(--color-accent-contrast)]"
              >
                W
              </span>
              <span className="text-lg">Witness</span>
            </Link>
            <span className="hidden text-sm text-[var(--color-ink-muted)] sm:inline">
              Institutional memory
            </span>
          </div>

          <nav aria-label="Primary" className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'rounded px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {currentUser !== null &&
              currentUser.organisations.some((organisation) => organisation.role === 'admin') && (
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded px-3 py-1.5 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)]">
                    Administration
                  </summary>
                  <div className="absolute right-0 z-40 mt-2 min-w-44 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-2 shadow-lg">
                    <Link
                      href="/organisations"
                      className="block rounded px-3 py-2 text-sm hover:bg-[var(--color-accent-soft)]"
                    >
                      Organisations
                    </Link>
                    <Link
                      href="/users"
                      className="block rounded px-3 py-2 text-sm hover:bg-[var(--color-accent-soft)]"
                    >
                      Users
                    </Link>
                    {currentUser.organisations
                      .filter((organisation) => organisation.role === 'admin')
                      .map((organisation) => (
                        <Link
                          key={organisation.id}
                          href={`/organisations/${organisation.id}/billing`}
                          className="block rounded px-3 py-2 text-sm hover:bg-[var(--color-accent-soft)]"
                        >
                          {organisation.name} billing
                        </Link>
                      ))}
                  </div>
                </details>
              )}

            <AuthStatusBadge
              status={status}
              currentUser={currentUser}
              errorMessage={errorMessage}
              signOut={signOut}
            />
          </div>
        </div>

        {/*
          The "Acting as" switcher drives the unverified `X-Witness-Dev-User`
          header, which only a development build ever sends. Rendering it on a
          deployed instance would offer every pilot user a role selector that
          silently does nothing — an invitation to believe they had changed
          their permissions when they had not.
        */}
        <div
          hidden={!IS_DEVELOPMENT_BUILD}
          className="border-t border-[var(--color-line)] bg-[var(--color-paper)]"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
            <label htmlFor="acting-role" className="text-[var(--color-ink-muted)]">
              Acting as
            </label>
            <input
              id="acting-name"
              aria-label="Acting user name"
              value={user.name}
              onChange={(event) => setUser({ ...user, name: event.target.value })}
              className="w-44 rounded border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-2 py-1"
            />
            <select
              id="acting-role"
              value={user.role}
              onChange={(event) =>
                setUser({ ...user, role: event.target.value as ActingUser['role'] })
              }
              className="rounded border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-2 py-1"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--color-ink-muted)]">
              Unverified header — switching role changes what the API permits, not what the UI
              hides.
            </span>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>

      <Footer />
    </div>
  );
}

/**
 * Real, signed-in status — distinct from the "Acting as" dev-header switcher
 * below it. When authenticated, only the organisations and workspaces the
 * signed-in user actually belongs to are visible here, because that's all
 * `GET /api/v1/me` (and therefore `currentUser`) ever returns.
 */
function AuthStatusBadge({
  status,
  currentUser,
  errorMessage,
  signOut,
}: {
  status: AuthStatus;
  currentUser: CurrentUserView | null;
  errorMessage: string | null;
  signOut: () => void;
}) {
  if (status === 'loading') {
    return <span className="text-sm text-[var(--color-ink-muted)]">Checking sign-in…</span>;
  }

  if (status === 'suspended' || status === 'deactivated') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-red-700 dark:text-red-400">
          Account {status === 'suspended' ? 'suspended' : 'deactivated'} — contact an administrator.
        </span>
        <button
          type="button"
          onClick={signOut}
          className="rounded px-2 py-1 text-[var(--color-ink-muted)] underline hover:text-[var(--color-ink)]"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <span className="text-sm text-[var(--color-ink-muted)]" title={errorMessage ?? undefined}>
        Could not verify sign-in — retrying…
      </span>
    );
  }

  if (status === 'unauthenticated' || currentUser === null) {
    return (
      <Link
        href="/signin"
        className="rounded px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] hover:underline"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Link
        href="/profile"
        title={currentUser.email}
        className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        Signed in as <strong className="text-[var(--color-ink)]">{currentUser.displayName}</strong>
      </Link>
      <button
        type="button"
        onClick={signOut}
        className="rounded px-2 py-1 text-[var(--color-ink-muted)] underline hover:text-[var(--color-ink)]"
      >
        Sign out
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--color-line)] px-4 py-6 text-sm text-[var(--color-ink-muted)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:justify-between">
        <span>Witness — open-source digital public infrastructure for institutional memory.</span>
        <span>GPL-3.0-or-later · SDKs and contracts Apache-2.0</span>
      </div>
    </footer>
  );
}
