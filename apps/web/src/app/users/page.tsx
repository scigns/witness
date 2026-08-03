'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { UserSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, ErrorNotice } from '@/components/ui';

export default function UsersPage() {
  const { user, ready } = useSession();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const result = await api.listUsers(user);
        if (cancelled) return;
        setUsers(result.users);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Registered Witness accounts. A user must exist here before they can be added to an
            organisation.
          </p>
        </div>
        <Link
          href="/users/new"
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Add user
        </Link>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      {loading ? (
        <Card>
          <p className="text-[var(--color-ink-muted)]">Loading…</p>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <p className="font-medium">No users yet.</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Add one — this requires the <code className="font-mono">admin</code> role.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Users, most recently added first</caption>
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Email
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Account state
                </th>
                <th scope="col" className="py-2 font-medium">
                  Added
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-line)]">
                  <td className="py-3 pr-4 font-medium">{row.displayName}</td>
                  <td className="py-3 pr-4 text-[var(--color-ink-muted)]">{row.email}</td>
                  <td className="py-3 pr-4 text-[var(--color-ink-muted)]">{row.accountState}</td>
                  <td className="py-3 text-[var(--color-ink-muted)]">
                    <time dateTime={row.createdAt}>
                      {new Date(row.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--color-ink-muted)]">
        &quot;Invited&quot; means registered, not that an email has been sent — Witness does not yet
        deliver invitation email. Add the user to an organisation and workspace from the
        organisation or workspace page.
      </p>
    </div>
  );
}
