'use client';

/**
 * Organisation dashboard — Programmes.
 *
 * Lists workspaces (called "programmes" in the UI, ADR-0028) scoped to
 * this organisation. `api.listWorkspaces` is already scoped to what the
 * caller can see (`WorkspacesController.list` reads from
 * `request.principal`), so filtering by `organisationId` client-side is
 * exactly the set this organisation's dashboard should show — no new
 * backend endpoint needed.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { OrganisationSummary, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, ErrorNotice, LinkButton } from '@/components/ui';
import { OrganisationNav } from '@/components/organisation-nav';

export default function OrganisationProgrammesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [organisation, setOrganisation] = useState<OrganisationSummary | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [organisationsResult, workspacesResult] = await Promise.all([
          api.listOrganisations(user),
          api.listWorkspaces(user),
        ]);
        if (cancelledRef.current) return;
        setOrganisation(organisationsResult.organisations.find((o) => o.id === id) ?? null);
        setWorkspaces(workspacesResult.workspaces.filter((w) => w.organisationId === id));
        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user],
  );

  useEffect(() => {
    if (!ready) return;

    const cancelledRef = { current: false };
    void load(cancelledRef);

    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (organisation === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No organisation with id '${id}'.`} />
        <Link href="/organisations" className="text-sm underline">
          ← Back to organisations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/organisations" className="inline-block text-sm underline">
        ← Back to organisations
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{organisation.name}</h1>
        <LinkButton href="/workspaces/new">Create a programme</LinkButton>
      </div>

      <OrganisationNav organisationId={id} />

      <section aria-labelledby="programmes-heading">
        <h2 id="programmes-heading" className="sr-only">
          Programmes
        </h2>
        {workspaces.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">
              No programmes yet.{' '}
              <Link href="/workspaces/new" className="underline">
                Create the first one
              </Link>
              .
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {workspaces.map((workspace) => (
              <Link key={workspace.id} href={`/workspaces/${workspace.id}`} className="block">
                <Card className="h-full space-y-1 transition-colors hover:border-[var(--color-accent)]">
                  <p className="font-medium text-[var(--color-ink)]">{workspace.name}</p>
                  {workspace.description !== null && (
                    <p className="text-sm text-[var(--color-ink-muted)]">{workspace.description}</p>
                  )}
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Created {new Date(workspace.createdAt).toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
