'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { OrganisationSummary, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { Card, EmptyState, ErrorNotice, RoleBadge } from '@/components/ui';

export default function WorkspacesPage() {
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

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
    'Organisation';

  const workspaceRole = (workspaceId: string) =>
    currentUser?.workspaces.find((workspace) => workspace.id === workspaceId)?.role ?? null;

  const canCreateProgram =
    currentUser?.organisations.some((organisation) => organisation.role === 'admin') ?? false;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-[var(--color-accent)]">Your work</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Programs</h1>
          <p className="mt-2 text-[var(--color-ink-muted)]">
            Open a program to continue sessions, work with participants, review contributions and
            turn evidence into decisions and actions.
          </p>
        </div>

        {canCreateProgram && (
          <Link
            href="/workspaces/new"
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] transition-opacity hover:opacity-90"
          >
            Create program
          </Link>
        )}
      </section>

      {error !== null && <ErrorNotice message={error} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <p role="status" className="text-sm text-[var(--color-ink-muted)]">
              Loading your programs…
            </p>
          </Card>
        </div>
      ) : workspaces.length === 0 ? (
        <EmptyState
          title="No programs yet"
          body={
            canCreateProgram
              ? 'Create your first program to begin organising sessions, people and evidence.'
              : 'You have not been added to a program yet. Your organisation administrator can give you access.'
          }
          action={
            canCreateProgram ? (
              <Link
                href="/workspaces/new"
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)]"
              >
                Create program
              </Link>
            ) : undefined
          }
        />
      ) : (
        <section aria-labelledby="program-list-heading" className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="program-list-heading" className="text-lg font-semibold">
                Your programs
              </h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {workspaces.length} {workspaces.length === 1 ? 'program' : 'programs'} available to
                you
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {workspaces.map((workspace) => {
              const role = workspaceRole(workspace.id);

              return (
                <Link
                  key={workspace.id}
                  href={`/workspaces/${workspace.id}`}
                  className="group block rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-5 transition hover:border-[var(--color-accent)] hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--color-ink-muted)]">
                        {organisationName(workspace.organisationId)}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight group-hover:text-[var(--color-accent)]">
                        {workspace.name}
                      </h3>
                    </div>

                    {role !== null && <RoleBadge role={role} />}
                  </div>

                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--color-ink-muted)]">
                    {workspace.description?.trim() ||
                      'Sessions, participants, evidence, decisions and actions for this program.'}
                  </p>

                  <div className="mt-5 flex items-center justify-between border-t border-[var(--color-line)] pt-4 text-sm">
                    <span className="text-[var(--color-ink-muted)]">
                      Created{' '}
                      <time dateTime={workspace.createdAt}>
                        {new Date(workspace.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </span>

                    <span className="font-medium text-[var(--color-accent)]">Open program →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
