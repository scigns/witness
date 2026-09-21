'use client';

/**
 * Knowledge Overview — the Knowledge section's default tab (3A/3B).
 *
 * Deliberately not a vanity-metrics dashboard: every number here is a count
 * of things that need a decision or are otherwise actionable (pending
 * proposals, open clarifications), each linking straight to where that work
 * happens. "Concepts" and "Domains" are the two exceptions — plain
 * inventory counts, not something to be proud of a large number of.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  CandidateAssertionView,
  KnowledgeDomainView,
  KnowledgeEntityView,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { KnowledgeNav } from '@/components/knowledge-nav';
import { Card, ErrorNotice } from '@/components/ui';

const IN_REVIEW_STATUSES = new Set([
  'pending',
  'needs_clarification',
  'pending_community_validation',
]);

export default function KnowledgeOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [candidates, setCandidates] = useState<CandidateAssertionView[]>([]);
  const [domains, setDomains] = useState<KnowledgeDomainView[]>([]);
  const [candidatesForbidden, setCandidatesForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const workspaceResult = await api.getWorkspace(id, user);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);

        const [entitiesResult, domainsResult] = await Promise.all([
          api.listKnowledgeEntities(workspaceResult.organisationId, id, user),
          api.listKnowledgeDomains(workspaceResult.organisationId, id, user),
        ]);
        if (cancelledRef.current) return;
        setEntities(entitiesResult.entities);
        setDomains(domainsResult.domains);

        // Reading the review queue is reviewer/steward/admin-only
        // (`knowledge_candidate:review`) — a contributor or reader
        // legitimately gets a 403 here, which must degrade this section,
        // not the whole page.
        try {
          const candidatesResult = await api.listKnowledgeCandidates(
            workspaceResult.organisationId,
            id,
            user,
          );
          if (cancelledRef.current) return;
          setCandidates(candidatesResult.candidates);
          setCandidatesForbidden(false);
        } catch (candidatesCaught) {
          if (cancelledRef.current) return;
          setCandidates([]);
          setCandidatesForbidden(
            candidatesCaught instanceof ApiError && candidatesCaught.status === 403,
          );
        }

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

  const role = currentUser?.workspaces.find((w) => w.id === id)?.role ?? null;

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

  const inReview = candidates.filter((c) => IN_REVIEW_STATUSES.has(c.status));
  const needsClarification = candidates.filter((c) => c.status === 'needs_clarification');

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to program
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--color-accent)]">{workspace.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Knowledge</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          What this program has learned so far — proposed and confirmed by people, from evidence,
          not generated automatically. Every concept and relationship here traces back to something
          someone said or did.
        </p>
      </div>

      <ProgramNav workspaceId={id} role={role} />
      <KnowledgeNav workspaceId={id} role={role} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href={`/workspaces/${id}/knowledge/concepts`}
          className="block rounded-lg focus-visible:outline-none"
        >
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Concepts
            </p>
            <p className="mt-1 text-3xl font-semibold">{entities.length}</p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              People, organisations, topics and more, currently active.
            </p>
          </Card>
        </Link>

        {!candidatesForbidden && (
          <Link
            href={`/workspaces/${id}/knowledge/review`}
            className="block rounded-lg focus-visible:outline-none"
          >
            <Card className={inReview.length > 0 ? 'border-[var(--color-accent)]' : ''}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Awaiting review
              </p>
              <p className="mt-1 text-3xl font-semibold">{inReview.length}</p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {needsClarification.length > 0
                  ? `${needsClarification.length} waiting on a clarification.`
                  : 'Proposed concepts and relationships needing a decision.'}
              </p>
            </Card>
          </Link>
        )}

        <Link
          href={`/workspaces/${id}/knowledge/domains`}
          className="block rounded-lg focus-visible:outline-none"
        >
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Domains
            </p>
            <p className="mt-1 text-3xl font-semibold">{domains.length}</p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              {domains.length === 0
                ? 'No governance areas configured yet.'
                : domains.map((d) => d.name).join(', ')}
            </p>
          </Card>
        </Link>
      </div>

      <section aria-labelledby="getting-started-heading" className="space-y-3">
        <h2 id="getting-started-heading" className="text-lg font-semibold">
          Getting started
        </h2>
        <Card className="space-y-2 text-sm">
          <p>
            <Link
              href={`/workspaces/${id}/knowledge/concepts`}
              className="underline hover:no-underline"
            >
              Browse concepts
            </Link>{' '}
            to see what has already been captured, or propose a new one from a piece of evidence.
          </p>
          <p>
            <Link
              href={`/workspaces/${id}/knowledge/graph`}
              className="underline hover:no-underline"
            >
              Explore the graph
            </Link>{' '}
            to see how concepts connect — every connection can be traced back to the evidence that
            supports it.
          </p>
        </Card>
      </section>
    </div>
  );
}
