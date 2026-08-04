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
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, SessionStatusBadge } from '@/components/ui';

export default function WorkspaceSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

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

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to workspace
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Co-design sessions{workspace !== null ? ` — ${workspace.name}` : ''}
          </h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Workshops, consultations, and other structured conversations run in this workspace.
          </p>
        </div>
        <Link href={`/workspaces/${id}/sessions/new`}>
          <Button variant="primary">New session</Button>
        </Link>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No sessions yet. Create one to start preparing a co-design workshop.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Co-design sessions in this workspace</caption>
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
