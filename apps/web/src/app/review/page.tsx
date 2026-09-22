'use client';

/**
 * My Review Work — a cross-programme reviewer workbench (Phase 4G).
 *
 * A reviewer holding reviewer/admin tier in several programmes today has to
 * remember which of them has something waiting and visit each one's own
 * `/workspaces/[id]/review` queue separately. This page is that same queue's
 * logic (see that file — `NEEDS_ATTENTION`, the per-session evidence-review
 * aggregation) run across every programme the signed-in reviewer can reach,
 * not just one.
 *
 * Per-item authorization is unchanged: each evidence link still routes into
 * `/workspaces/[id]/sessions/[sessionId]/evidence/[evidenceId]`, which
 * re-checks `evidence_review:*` against that item's own workspace exactly as
 * it always has. This page only decides what to *list* — it grants nothing.
 * A workspace where the signed-in user's role is not reviewer or admin is
 * skipped entirely, the same restriction the single-programme queue's own
 * page-level role gate already enforces.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { CoDesignSessionSummary, EvidenceSummary, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { Card, EmptyState, ErrorNotice, EvidenceReviewStatusBadge } from '@/components/ui';

const NEEDS_ATTENTION = new Set(['submitted', 'under_review', 'needs_clarification']);
const REVIEW_ROLES = new Set(['admin', 'reviewer']);

interface QueueItem {
  evidence: EvidenceSummary;
  session: CoDesignSessionSummary;
  workspace: WorkspaceSummary;
}

export default function CrossProgrammeReviewPage() {
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [reviewWorkspaceCount, setReviewWorkspaceCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      if (currentUser === null) {
        if (!cancelledRef.current) setLoading(false);
        return;
      }

      try {
        const reviewWorkspaces = currentUser.workspaces.filter(
          (w) => w.role !== null && REVIEW_ROLES.has(w.role),
        );
        setReviewWorkspaceCount(reviewWorkspaces.length);

        const { workspaces } = await api.listWorkspaces(user);
        if (cancelledRef.current) return;
        const byId = new Map(workspaces.map((w) => [w.id, w]));

        const perWorkspace = await Promise.all(
          reviewWorkspaces.map(async (summary) => {
            const workspace = byId.get(summary.id);
            if (workspace === undefined) return [];

            const sessionsResult = await api.listSessions(workspace.id, user).catch(() => ({
              sessions: [] as CoDesignSessionSummary[],
            }));

            const perSession = await Promise.all(
              sessionsResult.sessions.map(async (session) => {
                const result = await api
                  .listEvidence(workspace.id, session.id, user)
                  .catch(() => ({ evidence: [] }));
                return result.evidence
                  .filter((item) => NEEDS_ATTENTION.has(item.reviewStatus) && !item.withdrawn)
                  .map((evidence) => ({ evidence, session, workspace }));
              }),
            );
            return perSession.flat();
          }),
        );
        if (cancelledRef.current) return;

        const flattened = perWorkspace.flat().sort((a, b) => {
          // Needs-clarification first — that is the state most likely blocked on someone else.
          const priority = (status: string) => (status === 'needs_clarification' ? 0 : 1);
          return (
            priority(a.evidence.reviewStatus) - priority(b.evidence.reviewStatus) ||
            b.evidence.updatedAt.localeCompare(a.evidence.updatedAt)
          );
        });
        setItems(flattened);
        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Something went wrong loading your review work.',
        );
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [currentUser, user],
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

  return (
    <div className="space-y-6">
      {error !== null && <ErrorNotice message={error} />}

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My review work</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Everything awaiting review across every programme you review in — not only one at a time.
        </p>
      </div>

      {reviewWorkspaceCount === 0 ? (
        <EmptyState
          title="You're not a reviewer in any programme yet"
          body="Once a programme gives you reviewer or admin access, work waiting for you there will appear here."
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing needs review right now"
          body="Submitted contributions across every programme you review in will appear here as soon as there's something to look at."
        />
      ) : (
        <ul className="space-y-3">
          {items.map(({ evidence, session, workspace }) => (
            <li key={evidence.id}>
              <Link
                href={`/workspaces/${workspace.id}/sessions/${session.id}/evidence/${evidence.id}`}
                className="block rounded-lg focus-visible:outline-none"
              >
                <Card className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{evidence.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                      {workspace.name} · {session.title} · {evidence.evidenceType} ·{' '}
                      {evidence.attributionMode.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <EvidenceReviewStatusBadge status={evidence.reviewStatus} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
