'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { OrganisationSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, EmptyState, ErrorNotice } from '@/components/ui';

export default function OrganisationsPage() {
  const { user, ready } = useSession();
  const [organisations, setOrganisations] = useState<OrganisationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const result = await api.listOrganisations(user);
        if (cancelled) return;
        setOrganisations(result.organisations);
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
          <h1 className="text-2xl font-semibold tracking-tight">Organisations</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            The tenant boundary everything else in Witness sits inside.
          </p>
        </div>
        <Link
          href="/organisations/new"
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
        >
          Create organisation
        </Link>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      {loading ? (
        <Card>
          <p role="status" className="text-[var(--color-ink-muted)]">
            Loading…
          </p>
        </Card>
      ) : organisations.length === 0 ? (
        <EmptyState
          title="No organisations yet"
          body="Create one — this requires a platform-operator session, not an organisation admin role."
          action={
            <Link
              href="/organisations/new"
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)]"
            >
              Create organisation
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Organisations, most recently created first</caption>
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 font-medium">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {organisations.map((organisation) => (
                <tr key={organisation.id} className="border-b border-[var(--color-line)]">
                  <td className="py-3 pr-4 font-medium">
                    <Link href={`/organisations/${organisation.id}`} className="hover:underline">
                      {organisation.name}
                    </Link>
                  </td>
                  <td className="py-3 text-[var(--color-ink-muted)]">
                    <time dateTime={organisation.createdAt}>
                      {new Date(organisation.createdAt).toLocaleDateString(undefined, {
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
    </div>
  );
}
