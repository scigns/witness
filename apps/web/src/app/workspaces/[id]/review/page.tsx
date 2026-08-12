'use client';

/**
 * Reviewer queue — "what requires my attention?" (Client-Ready Experience
 * overhaul, Phase 17). A reviewer should never have to hunt through
 * administration screens to find review work.
 *
 * There is no per-session "assigned reviewer" restriction in this domain —
 * any reviewer-tier holder in a workspace's scope may act on any evidence
 * there (see `packages/policy/policy.csv`'s header comment on
 * `evidence_review:*`). This queue matches that exactly: it aggregates
 * everything awaiting review across every session in the program, not only
 * items formally assigned to the signed-in reviewer, because the domain
 * itself draws no such line.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { CoDesignSessionSummary, EvidenceSummary, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, EmptyState, ErrorNotice, EvidenceReviewStatusBadge } from '@/components/ui';

const NEEDS_ATTENTION = new Set(['submitted', 'under_review', 'needs_clarification']);

interface QueueItem {
  evidence: EvidenceSummary;
  session: CoDesignSessionSummary;
}

export default function ReviewQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [workspaceResult, sessionsResult] = await Promise.all([
          api.getWorkspace(id, user),
          api.listSessions(id, user),
        ]);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);

        const perSession = await Promise.all(
          sessionsResult.sessions.map(async (session) => {
            const result = await api
              .listEvidence(id, session.id, user)
              .catch(() => ({ evidence: [] }));
            return result.evidence
              .filter((item) => NEEDS_ATTENTION.has(item.reviewStatus) && !item.withdrawn)
              .map((evidence) => ({ evidence, session }));
          }),
        );
        if (cancelledRef.current) return;

        const flattened = perSession.flat().sort((a, b) => {
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
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (workspace === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No program with id '${id}'.`} />
        <Link href="/workspaces" className="text-sm underline">
          ← Back to programs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to {workspace.name}
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Needs your review</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Contributions across {workspace.name} that are submitted, under review, or waiting on a
          clarification.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing needs review right now"
          body="Submitted contributions across every session in this program will appear here as soon as there's something to look at."
        />
      ) : (
        <ul className="space-y-3">
          {items.map(({ evidence, session }) => (
            <li key={evidence.id}>
              <Link
                href={`/workspaces/${id}/sessions/${session.id}/evidence/${evidence.id}`}
                className="block rounded-lg focus-visible:outline-none"
              >
                <Card className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{evidence.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                      {session.title} · {evidence.evidenceType} ·{' '}
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
