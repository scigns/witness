'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { CoDesignSessionSummary, RecordSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import {
  Card,
  EmptyState,
  ErrorNotice,
  RoleBadge,
  SessionStatusBadge,
  StateBadge,
} from '@/components/ui';

interface DashboardSession {
  session: CoDesignSessionSummary;
  workspaceId: string;
  workspaceName: string;
}

const CAPTURE_ROLES = new Set(['admin', 'facilitator', 'contributor']);
const REVIEW_ROLES = new Set(['admin', 'reviewer']);

function firstName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed === '') return 'there';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function sessionTimestamp(session: CoDesignSessionSummary): number {
  return session.startAt === null ? 0 : new Date(session.startAt).getTime();
}

export default function DashboardPage() {
  const { user, ready } = useSession();
  const { status: authStatus, currentUser } = useAuth();

  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || authStatus !== 'authenticated' || currentUser === null) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);

      try {
        const recordsPromise = api
          .listRecords(user)
          .then((result) => result.records)
          .catch(() => [] as RecordSummary[]);

        const sessionResults = await Promise.allSettled(
          currentUser.workspaces.map(async (workspace) => {
            const result = await api.listSessions(workspace.id, user);

            return result.sessions.map((session): DashboardSession => ({
              session,
              workspaceId: workspace.id,
              workspaceName: workspace.name,
            }));
          }),
        );

        if (cancelled) return;

        const loadedSessions = sessionResults.flatMap((result) =>
          result.status === 'fulfilled' ? result.value : [],
        );

        const loadedRecords = await recordsPromise;

        if (cancelled) return;

        setSessions(loadedSessions);
        setRecords(loadedRecords);
        setError(null);
      } catch (caught) {
        if (cancelled) return;

        setError(
          caught instanceof ApiError
            ? caught.message
            : 'We could not load your dashboard right now.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, authStatus, currentUser, user]);

  const openSessions = useMemo(
    () =>
      sessions
        .filter(({ session }) => session.status === 'open')
        .sort((a, b) => sessionTimestamp(b.session) - sessionTimestamp(a.session)),
    [sessions],
  );

  const upcomingSessions = useMemo(
    () =>
      sessions
        .filter(({ session }) => session.status === 'scheduled' || session.status === 'draft')
        .sort((a, b) => sessionTimestamp(a.session) - sessionTimestamp(b.session))
        .slice(0, 4),
    [sessions],
  );

  const recentSessions = useMemo(
    () =>
      sessions
        .filter(({ session }) => session.status === 'closed')
        .sort((a, b) => sessionTimestamp(b.session) - sessionTimestamp(a.session))
        .slice(0, 4),
    [sessions],
  );

  const recentRecords = useMemo(
    () =>
      [...records]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [records],
  );

  const recordsAwaitingReview = records.filter(
    (record) => record.reviewState === 'in_review',
  ).length;

  const canCapture =
    currentUser?.workspaces.some(
      (workspace) => workspace.role !== null && CAPTURE_ROLES.has(workspace.role),
    ) ?? false;

  const canReview =
    currentUser?.workspaces.some(
      (workspace) => workspace.role !== null && REVIEW_ROLES.has(workspace.role),
    ) ?? false;

  if (authStatus !== 'authenticated' || currentUser === null) {
    return (
      <div className="space-y-5">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-[var(--color-accent)]">Witness</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Evidence into accountable action
          </h1>
          <p className="mt-3 leading-7 text-[var(--color-ink-muted)]">
            Capture what people contributed, preserve consent and provenance, review it with people
            in the loop, and carry decisions and commitments forward.
          </p>
        </div>

        <Link
          href="/signin"
          className="inline-flex rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)]"
        >
          Sign in to Witness
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-[var(--color-accent)]">Your workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Welcome, {firstName(currentUser.displayName)}
          </h1>
          <p className="mt-2 text-[var(--color-ink-muted)]">
            Continue your programs, prepare for upcoming sessions and move reviewed evidence into
            decisions and action.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/workspaces"
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
          >
            View all programs
          </Link>

          {canCapture && (
            <Link
              href="/records/new"
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
            >
              Capture evidence
            </Link>
          )}
        </div>
      </section>

      {error !== null && <ErrorNotice message={error} />}

      {loading ? (
        <Card>
          <p role="status" className="text-sm text-[var(--color-ink-muted)]">
            Loading your work…
          </p>
        </Card>
      ) : (
        <>
          <section aria-labelledby="continue-heading" className="space-y-4">
            <div>
              <h2 id="continue-heading" className="text-lg font-semibold">
                Continue your work
              </h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Programs you can access right now.
              </p>
            </div>

            {currentUser.workspaces.length === 0 ? (
              <EmptyState
                title="No programs assigned yet"
                body="Your organisation administrator can add you to a program when it is ready."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {currentUser.workspaces.slice(0, 6).map((workspace) => (
                  <Link
                    key={workspace.id}
                    href={`/workspaces/${workspace.id}`}
                    className="group rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-5 transition hover:border-[var(--color-accent)] hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold tracking-tight group-hover:text-[var(--color-accent)]">
                        {workspace.name}
                      </h3>
                      <RoleBadge role={workspace.role} />
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--color-ink-muted)]">
                      {workspace.description?.trim() ||
                        'Open this program to work with its sessions, people and evidence.'}
                    </p>

                    <p className="mt-4 text-sm font-medium text-[var(--color-accent)]">
                      Open program →
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="attention-heading" className="space-y-4">
            <div>
              <h2 id="attention-heading" className="text-lg font-semibold">
                Needs your attention
              </h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                The work most likely to need a next step.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="!p-5">
                <p className="text-sm text-[var(--color-ink-muted)]">Open sessions</p>
                <p className="mt-1 text-3xl font-semibold">{openSessions.length}</p>
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                  {openSessions.length === 0
                    ? 'No session is currently open.'
                    : 'A live session may need facilitation or capture.'}
                </p>
              </Card>

              <Card className="!p-5">
                <p className="text-sm text-[var(--color-ink-muted)]">Upcoming sessions</p>
                <p className="mt-1 text-3xl font-semibold">{upcomingSessions.length}</p>
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                  Draft or scheduled sessions across your programs.
                </p>
              </Card>

              {canReview && (
                <Card className="!p-5">
                  <p className="text-sm text-[var(--color-ink-muted)]">Records awaiting review</p>
                  <p className="mt-1 text-3xl font-semibold">{recordsAwaitingReview}</p>
                  <Link
                    href="/records"
                    className="mt-2 inline-block text-sm font-medium text-[var(--color-accent)] hover:underline"
                  >
                    Review records →
                  </Link>
                </Card>
              )}
            </div>
          </section>

          {(openSessions.length > 0 || upcomingSessions.length > 0) && (
            <section aria-labelledby="sessions-heading" className="space-y-4">
              <div>
                <h2 id="sessions-heading" className="text-lg font-semibold">
                  Sessions
                </h2>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  What is live now and what is coming next.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[...openSessions, ...upcomingSessions]
                  .slice(0, 4)
                  .map(({ session, workspaceId, workspaceName }) => (
                    <Link
                      key={session.id}
                      href={`/workspaces/${workspaceId}/sessions`}
                      className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-5 transition hover:border-[var(--color-accent)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-[var(--color-ink-muted)]">{workspaceName}</p>
                          <h3 className="mt-1 font-semibold">{session.title}</h3>
                        </div>
                        <SessionStatusBadge status={session.status} />
                      </div>

                      {session.startAt !== null && (
                        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                          <time dateTime={session.startAt}>
                            {new Date(session.startAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </time>
                        </p>
                      )}
                    </Link>
                  ))}
              </div>
            </section>
          )}

          <div className="grid gap-8 lg:grid-cols-2">
            <section aria-labelledby="recent-records-heading" className="space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="recent-records-heading" className="text-lg font-semibold">
                    Recent records
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    Recently updated institutional memory.
                  </p>
                </div>
                <Link
                  href="/records"
                  className="text-sm font-medium text-[var(--color-accent)] hover:underline"
                >
                  View all
                </Link>
              </div>

              {recentRecords.length === 0 ? (
                <Card>
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    No records have been captured yet.
                  </p>
                </Card>
              ) : (
                <Card className="!p-0">
                  <ul className="divide-y divide-[var(--color-line)]">
                    {recentRecords.map((record) => (
                      <li key={record.id}>
                        <Link
                          href={`/records/${record.id}`}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--color-accent-soft)]"
                        >
                          <span className="font-medium">{record.title}</span>
                          <StateBadge state={record.reviewState} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>

            <section aria-labelledby="recent-sessions-heading" className="space-y-4">
              <div>
                <h2 id="recent-sessions-heading" className="text-lg font-semibold">
                  Recent sessions
                </h2>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  Return to completed sessions and their evidence.
                </p>
              </div>

              {recentSessions.length === 0 ? (
                <Card>
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    No completed sessions yet.
                  </p>
                </Card>
              ) : (
                <Card className="!p-0">
                  <ul className="divide-y divide-[var(--color-line)]">
                    {recentSessions.map(({ session, workspaceId, workspaceName }) => (
                      <li key={session.id}>
                        <Link
                          href={`/workspaces/${workspaceId}/sessions`}
                          className="block px-5 py-4 hover:bg-[var(--color-accent-soft)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{session.title}</p>
                              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                                {workspaceName}
                              </p>
                            </div>
                            <SessionStatusBadge status={session.status} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          </div>

          <section aria-labelledby="quick-actions-heading" className="space-y-4">
            <h2 id="quick-actions-heading" className="text-lg font-semibold">
              Quick actions
            </h2>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/workspaces"
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
              >
                Open a program
              </Link>

              {canCapture && (
                <Link
                  href="/records/new"
                  className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
                >
                  Capture evidence
                </Link>
              )}

              <Link
                href="/records"
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
              >
                Browse records
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
