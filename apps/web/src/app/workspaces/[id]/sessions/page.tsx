'use client';

/**
 * Co-design sessions in a workspace (BUILD_ROADMAP.md Milestone 2).
 *
 * Nested under the workspace, mirroring `WorkspacePage`'s membership list —
 * a session belongs to exactly one workspace, and the API itself is
 * organised the same way (`GET /api/v1/workspaces/:workspaceId/sessions`).
 */

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import type { CoDesignSessionSummary, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { Button, Card, ErrorNotice, SessionStatusBadge } from '@/components/ui';

export default function WorkspaceSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [sessions, setSessions] = useState<CoDesignSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const [workspacesResult, sessionsResult] = await Promise.all([
          api.listWorkspaces(user),
          api.listSessions(id, user),
        ]);
        if (cancelled) return;
        setWorkspace(workspacesResult.workspaces.find((w) => w.id === id) ?? null);
        setSessions(sessionsResult.sessions);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        // A workspace the caller cannot see resolves to FORBIDDEN or
        // WORKSPACE_NOT_FOUND from the API — surfaced here rather than a
        // generic failure, so the distinction between "does not exist" and
        // "you may not see this" stays visible.
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, id, user]);

  const role = currentUser?.workspaces.find((w) => w.id === id)?.role ?? null;
  const canManage = role === 'admin' || role === 'facilitator';

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to program
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-[var(--color-accent)]">
            {workspace?.name ?? 'Program'}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Sessions</h1>
          <p className="mt-2 text-[var(--color-ink-muted)]">
            Plan and run workshops, consultations and other structured conversations in this
            program.
          </p>
        </div>

        {canManage && (
          <Link href={`/workspaces/${id}/sessions/new`}>
            <Button variant="primary">Create session</Button>
          </Link>
        )}
      </div>

      <ProgramNav workspaceId={id} role={role} />

      {error !== null ? null : sessions.length === 0 ? (
        <Card>
          <p className="font-medium">No sessions yet</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {canManage
              ? 'Create the first session to begin preparing this program.'
              : 'Sessions will appear here when a facilitator schedules them.'}
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Sessions in this program</caption>
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Title
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Type
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Scheduled
                </th>
                <th scope="col" className="py-2 font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b border-[var(--color-line)]">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/workspaces/${id}/sessions/${session.id}`}
                      className="font-medium hover:underline"
                    >
                      {session.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-ink-muted)]">{session.sessionType}</td>
                  <td className="py-3 pr-4">
                    <SessionStatusBadge status={session.status} />
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-ink-muted)]">
                    {session.startAt === null ? '—' : new Date(session.startAt).toLocaleString()}
                  </td>
                  <td className="py-3 text-[var(--color-ink-muted)]">
                    {new Date(session.updatedAt).toLocaleString()}
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
