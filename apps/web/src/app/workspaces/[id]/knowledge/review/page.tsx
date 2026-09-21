'use client';

/**
 * Review Queue (3E). Every action here is auditable at the service layer
 * (each writes its own `AUDIT_ACTIONS` entry) — this page is only the
 * surface for triggering them. "Modify/restate" never overwrites what the
 * proposer submitted: a `correctedPayload` here is recorded on the review
 * decision, and the original candidate payload is preserved untouched.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { CandidateAssertionView, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { KnowledgeNav } from '@/components/knowledge-nav';
import { Button, Card, EmptyState, ErrorNotice } from '@/components/ui';

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'needs_clarification', label: 'Needs clarification' },
  { key: 'pending_community_validation', label: 'Community validation' },
  { key: '', label: 'All' },
] as const;

function payloadSummary(candidate: CandidateAssertionView): string {
  if (candidate.assertionType === 'entity_attribute') {
    return `${String(candidate.payload['attributeKey'])}: ${String(candidate.payload['attributeValue'])}`;
  }
  return `${String(candidate.payload['relationshipType'])} (${String(candidate.payload['fromEntityId']).slice(0, 8)}… → ${String(candidate.payload['toEntityId']).slice(0, 8)}…)`;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  needs_clarification: 'Needs clarification',
  pending_community_validation: 'Awaiting community validation',
  confirmed: 'Confirmed',
  corrected: 'Corrected',
  rejected: 'Rejected',
  superseded: 'Superseded',
  expired: 'Expired',
};

export default function ReviewQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [candidates, setCandidates] = useState<CandidateAssertionView[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('pending');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [openAction, setOpenAction] = useState<{ id: string; kind: string } | null>(null);
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const workspaceResult = await api.getWorkspace(id, user);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);

        const result = await api.listKnowledgeCandidates(
          workspaceResult.organisationId,
          id,
          user,
          filter || undefined,
        );
        if (cancelledRef.current) return;
        setCandidates(result.candidates);
        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user, filter],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const role = currentUser?.workspaces.find((w) => w.id === id)?.role ?? null;

  const runReview = async (
    candidateId: string,
    decision: 'approved' | 'rejected' | 'clarification_requested' | 'returned_for_community_review',
    rationaleText?: string,
  ) => {
    if (workspace === null) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.reviewKnowledgeCandidate(
        workspace.organisationId,
        id,
        candidateId,
        {
          decision,
          reviewStartedAt: new Date(Date.now() - 2000).toISOString(),
          ...(rationaleText ? { rationale: rationaleText } : {}),
        },
        user,
      );
      setOpenAction(null);
      setRationale('');
      const cancelledRef = { current: false };
      await load(cancelledRef);
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
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
        ← Back to program
      </Link>

      {error !== null && <ErrorNotice message={error} />}
      {error !== null && error.toLowerCase().includes('permission') && (
        <p className="text-sm text-[var(--color-ink-muted)]">
          The review queue is available to reviewers, stewards and administrators.
        </p>
      )}

      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--color-accent)]">{workspace.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Review Queue</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Proposed concepts and relationships awaiting a decision, each citing the evidence it comes
          from.
        </p>
      </div>

      <ProgramNav workspaceId={id} role={role} />
      <KnowledgeNav workspaceId={id} role={role} />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={[
              'rounded-full border px-3 py-1 text-sm',
              filter === f.key
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-muted)]',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {actionError !== null && <ErrorNotice message={actionError} />}

      {candidates.length === 0 ? (
        <EmptyState title="Nothing here" body="No candidates match this filter right now." />
      ) : (
        <ul className="space-y-3">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{payloadSummary(candidate)}</p>
                    <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                      {candidate.assertionType === 'entity_attribute'
                        ? 'Attribute'
                        : 'Relationship'}{' '}
                      · proposed by {candidate.proposedByName} ·{' '}
                      {candidate.sourceEvidenceIds.length} evidence item
                      {candidate.sourceEvidenceIds.length === 1 ? '' : 's'} ·{' '}
                      {new Date(candidate.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="rounded-full border border-current px-2 py-0.5 text-xs font-medium text-[var(--color-ink-muted)]">
                    {STATUS_LABELS[candidate.status] ?? candidate.status}
                  </span>
                </div>

                {candidate.status === 'pending' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => void runReview(candidate.id, 'approved')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setOpenAction({ id: candidate.id, kind: 'reject' });
                        setRationale('');
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setOpenAction({ id: candidate.id, kind: 'clarify' });
                        setRationale('');
                      }}
                    >
                      Request clarification
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setOpenAction({ id: candidate.id, kind: 'community' });
                        setRationale('');
                      }}
                    >
                      Send for community validation
                    </Button>
                  </div>
                )}

                {openAction?.id === candidate.id && (
                  <div className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-3">
                    <label className="block text-sm">
                      <span className="mb-1 block text-[var(--color-ink-muted)]">
                        {openAction.kind === 'reject'
                          ? 'Why is this being rejected? (required)'
                          : openAction.kind === 'clarify'
                            ? 'What needs clarifying? (required)'
                            : 'Note for the community reviewers (optional)'}
                      </span>
                      <textarea
                        rows={2}
                        value={rationale}
                        onChange={(event) => setRationale(event.target.value)}
                        className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        disabled={
                          busy || (openAction.kind !== 'community' && rationale.trim() === '')
                        }
                        onClick={() =>
                          void runReview(
                            candidate.id,
                            openAction.kind === 'reject'
                              ? 'rejected'
                              : openAction.kind === 'clarify'
                                ? 'clarification_requested'
                                : 'returned_for_community_review',
                            rationale,
                          )
                        }
                      >
                        Confirm
                      </Button>
                      <Button variant="secondary" onClick={() => setOpenAction(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
