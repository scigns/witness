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

import { useSession } from '@/lib/session';
import type { ActingUser } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/records', label: 'Records' },
  { href: '/records/new', label: 'Capture' },
  { href: '/organisations', label: 'Organisations' },
  { href: '/workspaces', label: 'Workspaces' },
  { href: '/users', label: 'Users' },
] as const;

const ROLES: ReadonlyArray<ActingUser['role']> = ['reader', 'contributor', 'reviewer', 'admin'];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, setUser } = useSession();

  return (
    <div className="min-h-dvh flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <div
        role="status"
        className="border-b border-[var(--color-line)] bg-[var(--color-accent-soft)] px-4 py-2 text-center text-sm"
      >
        <strong>Developer Preview</strong> — not production software. Requests are{' '}
        <strong>not authenticated</strong>. Content here is synthetic.
      </div>

      <header className="border-b border-[var(--color-line)] bg-[var(--color-paper-raised)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 place-items-center rounded bg-[var(--color-accent)] text-sm font-bold text-white"
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
        </div>

        <div className="border-t border-[var(--color-line)] bg-[var(--color-paper)]">
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
