'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { OrganisationSummary, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, ErrorNotice } from '@/components/ui';

export default function WorkspacesPage() {
  const { user, ready } = useSession();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [organisations, setOrganisations] = useState<OrganisationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        // Two independent lists, joined client-side — a workspace only carries
        // its organisation's id, not its name, so the reviewer's name lookup is
        // the browser's job, not the API's.
        const [workspaceResult, organisationResult] = await Promise.all([
          api.listWorkspaces(user),
          api.listOrganisations(user),
        ]);
        if (cancelled) return;
        setWorkspaces(workspaceResult.workspaces);
        setOrganisations(organisationResult.organisations);
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

  const organisationName = (organisationId: string): string =>
    organisations.find((organisation) => organisation.id === organisationId)?.name ??
    organisationId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Scoped working areas inside an organisation — where sessions will live.
          </p>
        </div>
        <Link
          href="/workspaces/new"
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
        >
          Create workspace
        </Link>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      {loading ? (
        <Card>
          <p className="text-[var(--color-ink-muted)]">Loading…</p>
        </Card>
      ) : workspaces.length === 0 ? (
        <Card>
          <p className="font-medium">No workspaces yet.</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Create one — this requires an organisation to already exist and the{' '}
            <code className="font-mono">admin</code> role.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Workspaces, most recently created first</caption>
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Organisation
                </th>
                <th scope="col" className="py-2 font-medium">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((workspace) => (
                <tr key={workspace.id} className="border-b border-[var(--color-line)]">
                  <td className="py-3 pr-4 font-medium">
                    <Link href={`/workspaces/${workspace.id}`} className="hover:underline">
                      {workspace.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-ink-muted)]">
                    {organisationName(workspace.organisationId)}
                  </td>
                  <td className="py-3 text-[var(--color-ink-muted)]">
                    <time dateTime={workspace.createdAt}>
                      {new Date(workspace.createdAt).toLocaleDateString(undefined, {
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
