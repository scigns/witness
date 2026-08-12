'use client';

/**
 * Post-session recap — "here's what happened" (Client-Ready Experience
 * overhaul, Phase 18). Closing the participation loop matters for trust:
 * someone who contributed should be able to come back and see that their
 * participation produced something, without hunting through Summary/
 * Outcomes/Reports separately.
 *
 * Only confirmed/authoritative content is shown — a confirmed summary, and
 * decisions/commitments/actions in their confirmed-or-later states. A
 * proposed-but-not-yet-confirmed decision is exactly the kind of thing this
 * page must not present as settled.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  ActionItemSummary,
  CoDesignSessionDetail,
  CommitmentSummary,
  DecisionSummary,
  SessionSummaryView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import {
  ActionItemStatusBadge,
  Card,
  CommitmentStatusBadge,
  DecisionStatusBadge,
  EmptyState,
  ErrorNotice,
} from '@/components/ui';

const CONFIRMED_DECISION_STATES = new Set(['confirmed', 'superseded', 'reversed']);
const ACTIVE_COMMITMENT_STATES = new Set(['active', 'fulfilled', 'withdrawn', 'superseded']);
const STARTED_ACTION_STATES = new Set(['open', 'in_progress', 'blocked', 'completed', 'cancelled']);

export default function SessionRecapPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [session, setSession] = useState<CoDesignSessionDetail | null>(null);
  const [summary, setSummary] = useState<SessionSummaryView | null>(null);
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [commitments, setCommitments] = useState<CommitmentSummary[]>([]);
  const [actions, setActions] = useState<ActionItemSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [sessionResult, decisionsResult, commitmentsResult, actionsResult] =
          await Promise.all([
            api.getSession(workspaceId, sessionId, user),
            api.listDecisions(workspaceId, sessionId, user),
            api.listCommitments(workspaceId, sessionId, user),
            api.listActionItems(workspaceId, sessionId, user),
          ]);
        if (cancelledRef.current) return;

        setSession(sessionResult);
        setDecisions(
          decisionsResult.decisions.filter((d) => CONFIRMED_DECISION_STATES.has(d.status)),
        );
        setCommitments(
          commitmentsResult.commitments.filter((c) => ACTIVE_COMMITMENT_STATES.has(c.status)),
        );
        setActions(actionsResult.actions.filter((a) => STARTED_ACTION_STATES.has(a.status)));

        const summaryResult = await api.getSummary(workspaceId, sessionId, user).catch(() => null);
        if (cancelledRef.current) return;
        setSummary(summaryResult !== null && summaryResult.confirmed ? summaryResult : null);

        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [workspaceId, sessionId, user],
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

  if (session === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No session with id '${sessionId}'.`} />
        <Link href={`/workspaces/${workspaceId}`} className="text-sm underline">
          ← Back
        </Link>
      </div>
    );
  }

  const hasAnything =
    summary !== null || decisions.length > 0 || commitments.length > 0 || actions.length > 0;

  return (
    <div className="space-y-8">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
        className="inline-block text-sm underline"
      >
        ← Back to session
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          What we heard, decided and committed to
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{session.title}</h1>
      </div>

      {!hasAnything ? (
        <EmptyState
          title="Nothing confirmed yet"
          body="A recap appears here once the session's summary is confirmed and decisions, actions or commitments have been confirmed from it."
        />
      ) : (
        <>
          {summary !== null && (
            <section aria-labelledby="heard-heading" className="space-y-3">
              <h2 id="heard-heading" className="text-lg font-semibold">
                What we heard
              </h2>
              <Card>
                <p className="whitespace-pre-wrap text-sm">
                  {summary.editedText ?? summary.generatedText}
                </p>
              </Card>
            </section>
          )}

          {decisions.length > 0 && (
            <section aria-labelledby="decided-heading" className="space-y-3">
              <h2 id="decided-heading" className="text-lg font-semibold">
                What we decided
              </h2>
              <ul className="space-y-2">
                {decisions.map((decision) => (
                  <li key={decision.id}>
                    <Link
                      href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes/decisions/${decision.id}`}
                      className="block rounded-lg focus-visible:outline-none"
                    >
                      <Card className="flex items-center justify-between gap-3">
                        <span className="font-medium">{decision.title}</span>
                        <DecisionStatusBadge status={decision.status} />
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actions.length > 0 && (
            <section aria-labelledby="next-heading" className="space-y-3">
              <h2 id="next-heading" className="text-lg font-semibold">
                What happens next
              </h2>
              <ul className="space-y-2">
                {actions.map((action) => (
                  <li key={action.id}>
                    <Link
                      href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes/actions/${action.id}`}
                      className="block rounded-lg focus-visible:outline-none"
                    >
                      <Card className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{action.title}</p>
                          <p className="text-xs text-[var(--color-ink-muted)]">
                            {action.ownerDescription}
                            {action.dueDate !== null &&
                              ` · due ${new Date(action.dueDate).toLocaleDateString()}`}
                          </p>
                        </div>
                        <ActionItemStatusBadge status={action.status} />
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {commitments.length > 0 && (
            <section aria-labelledby="commitments-heading" className="space-y-3">
              <h2 id="commitments-heading" className="text-lg font-semibold">
                Commitments
              </h2>
              <ul className="space-y-2">
                {commitments.map((commitment) => (
                  <li key={commitment.id}>
                    <Link
                      href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes/commitments/${commitment.id}`}
                      className="block rounded-lg focus-visible:outline-none"
                    >
                      <Card className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{commitment.title}</p>
                          <p className="text-xs text-[var(--color-ink-muted)]">
                            {commitment.ownerDescription}
                            {commitment.dueDate !== null &&
                              ` · due ${new Date(commitment.dueDate).toLocaleDateString()}`}
                          </p>
                        </div>
                        <CommitmentStatusBadge status={commitment.status} />
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section aria-labelledby="resources-heading" className="space-y-3">
        <h2 id="resources-heading" className="text-lg font-semibold">
          More detail
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence`}
            className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
          >
            All contributions →
          </Link>
          <Link
            href={`/workspaces/${workspaceId}/sessions/${sessionId}/reports`}
            className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
          >
            Reports →
          </Link>
        </div>
      </section>
    </div>
  );
}
