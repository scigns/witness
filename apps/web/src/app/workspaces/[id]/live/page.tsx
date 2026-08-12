'use client';

/**
 * Live session experience (Client-Ready Experience overhaul, Phase 13/14).
 * One page, two experiences: every participant sees NOW — the current
 * agenda item, its prompt, and a primary "Share a contribution" call to
 * action. A facilitator or admin additionally sees PEOPLE, CONSENT,
 * CONTRIBUTIONS, OUTCOMES and NEXT, plus the controls to move the agenda
 * forward — because running a session and participating in one are the same
 * moment, not two different screens.
 *
 * "Current" is workspace-wide, not session-wide (see `agenda-item.ts`'s doc
 * comment: at most one agenda item across the whole program is `current` at
 * a time) — this page always reflects that one item, wherever it points.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  ActionItemSummary,
  AgendaItemView,
  CoDesignSessionSummary,
  ConsentFacilitatorDashboardView,
  DecisionSummary,
  EvidenceSummary,
  SessionParticipantSummary,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAuth } from '@/lib/auth';
import {
  Button,
  Card,
  DecisionStatusBadge,
  EmptyState,
  ErrorNotice,
  EvidenceReviewStatusBadge,
  ParticipantAttendanceBadge,
} from '@/components/ui';

const CAN_MANAGE_ROLES = new Set(['admin', 'facilitator']);

export default function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [items, setItems] = useState<AgendaItemView[]>([]);
  const [linkedSession, setLinkedSession] = useState<CoDesignSessionSummary | null>(null);
  const [participants, setParticipants] = useState<SessionParticipantSummary[]>([]);
  const [contributions, setContributions] = useState<EvidenceSummary[]>([]);
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [actions, setActions] = useState<ActionItemSummary[]>([]);
  const [consent, setConsent] = useState<ConsentFacilitatorDashboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const role = currentUser?.workspaces.find((w) => w.id === id)?.role ?? null;
  const canManage = role !== null && CAN_MANAGE_ROLES.has(role);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [workspaceResult, itemsResult] = await Promise.all([
          api.getWorkspace(id, user),
          api.listAgendaItems(id, user),
        ]);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);

        const sorted = [...itemsResult.agendaItems].sort((a, b) => a.sortOrder - b.sortOrder);
        setItems(sorted);

        const current = sorted.find((item) => item.status === 'current') ?? null;

        if (current?.sessionId != null) {
          const sessionId = current.sessionId;
          const [
            sessionResult,
            participantsResult,
            evidenceResult,
            decisionsResult,
            actionsResult,
          ] = await Promise.all([
            api.listSessions(id, user),
            api.listParticipants(id, sessionId, user).catch(() => ({ participants: [] })),
            api.listEvidence(id, sessionId, user).catch(() => ({ evidence: [] })),
            api.listDecisions(id, sessionId, user).catch(() => ({ decisions: [] })),
            api.listActionItems(id, sessionId, user).catch(() => ({ actions: [] })),
          ]);
          if (cancelledRef.current) return;

          setLinkedSession(sessionResult.sessions.find((s) => s.id === sessionId) ?? null);
          setParticipants(participantsResult.participants);
          setContributions(
            evidenceResult.evidence
              .filter((e) => !e.withdrawn)
              .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
              .slice(0, 6),
          );
          setDecisions(decisionsResult.decisions.slice(0, 4));
          setActions(actionsResult.actions.filter((a) => a.status !== 'cancelled').slice(0, 4));

          if (canManage) {
            const dashboard = await api.getConsentDashboard(id, sessionId, user).catch(() => null);
            if (!cancelledRef.current) setConsent(dashboard);
          }
        } else {
          setLinkedSession(null);
          setParticipants([]);
          setContributions([]);
          setDecisions([]);
          setActions([]);
          setConsent(null);
        }

        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user, canManage],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const currentItem = items.find((item) => item.status === 'current') ?? null;
  const nextItems = items.filter((item) => item.status === 'upcoming').slice(0, 4);

  const startItem = async (itemId: string) => {
    setBusy(true);
    try {
      await api.transitionAgendaItem(id, itemId, { status: 'current' }, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const completeItem = async (itemId: string) => {
    setBusy(true);
    try {
      await api.transitionAgendaItem(id, itemId, { status: 'completed' }, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

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
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          Now
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{workspace.name}</h1>
      </div>

      {/* NOW */}
      {currentItem === null ? (
        <EmptyState
          title="Nothing is running right now"
          body={
            canManage
              ? 'Start the next agenda item to bring participants into the session.'
              : 'Check back once a facilitator starts the next part of this program.'
          }
          action={
            canManage && nextItems[0] !== undefined ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void startItem(nextItems[0]!.id)}
              >
                Start &ldquo;{nextItems[0]!.title}&rdquo;
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="space-y-3 border-[var(--color-accent)] bg-[var(--color-accent-soft)]">
          <p className="text-lg font-semibold">{currentItem.title}</p>
          {currentItem.description !== null && <p className="text-sm">{currentItem.description}</p>}
          {currentItem.promptText !== null && (
            <div className="rounded border border-[var(--color-accent)] bg-[var(--color-paper)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Prompt
              </p>
              <p className="mt-1 font-medium">{currentItem.promptText}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {linkedSession !== null && (
              <Link href={`/workspaces/${id}/sessions/${linkedSession.id}/evidence`}>
                <Button variant="primary">Share a contribution →</Button>
              </Link>
            )}
            {canManage && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void completeItem(currentItem.id)}
              >
                Mark complete
              </Button>
            )}
            <Link
              href={`/workspaces/${id}/agenda`}
              className="text-sm underline hover:no-underline"
            >
              Full agenda →
            </Link>
          </div>
        </Card>
      )}

      {!canManage && linkedSession === null && currentItem !== null && (
        <p className="text-sm text-[var(--color-ink-muted)]">
          This agenda item isn&rsquo;t linked to a session yet, so there&rsquo;s nowhere to record a
          contribution against it.
        </p>
      )}

      {/* Facilitator-only panels */}
      {canManage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="people-heading" className="space-y-2">
            <h2
              id="people-heading"
              className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
            >
              People
            </h2>
            <Card>
              {participants.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {linkedSession === null ? 'No linked session.' : 'No participants recorded yet.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {participants.slice(0, 8).map((participant) => (
                    <li
                      key={participant.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{participant.displayName}</span>
                      <ParticipantAttendanceBadge status={participant.attendanceStatus} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section aria-labelledby="consent-heading" className="space-y-2">
            <h2
              id="consent-heading"
              className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
            >
              Consent
            </h2>
            <Card>
              {consent === null ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {linkedSession === null ? 'No linked session.' : 'No consent configuration yet.'}
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    {consent.participants.filter((p) => p.status === 'granted').length} of{' '}
                    {consent.participants.length} participants have completed consent.
                  </p>
                  <Link
                    href={`/workspaces/${id}/sessions/${linkedSession?.id}/consent-dashboard`}
                    className="mt-2 inline-block text-sm underline hover:no-underline"
                  >
                    Open consent dashboard →
                  </Link>
                </>
              )}
            </Card>
          </section>

          <section aria-labelledby="contributions-heading" className="space-y-2">
            <h2
              id="contributions-heading"
              className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
            >
              Contributions
            </h2>
            <Card>
              {contributions.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">Nothing captured yet.</p>
              ) : (
                <ul className="space-y-2">
                  {contributions.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/workspaces/${id}/sessions/${item.sessionId}/evidence/${item.id}`}
                        className="flex items-center justify-between gap-2 text-sm hover:underline"
                      >
                        <span className="truncate">{item.title}</span>
                        <EvidenceReviewStatusBadge status={item.reviewStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section aria-labelledby="outcomes-heading" className="space-y-2">
            <h2
              id="outcomes-heading"
              className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
            >
              Outcomes
            </h2>
            <Card className="space-y-3">
              {decisions.length === 0 && actions.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  No decisions or actions recorded yet.
                </p>
              ) : (
                <>
                  {decisions.map((decision) => (
                    <div
                      key={decision.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{decision.title}</span>
                      <DecisionStatusBadge status={decision.status} />
                    </div>
                  ))}
                  {actions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{action.title}</span>
                      <span className="text-xs text-[var(--color-ink-muted)]">
                        {action.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {linkedSession !== null && (
                <Link
                  href={`/workspaces/${id}/sessions/${linkedSession.id}/outcomes`}
                  className="inline-block text-sm underline hover:no-underline"
                >
                  See all outcomes →
                </Link>
              )}
            </Card>
          </section>
        </div>
      )}

      {/* NEXT */}
      <section aria-labelledby="next-heading" className="space-y-2">
        <h2
          id="next-heading"
          className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
        >
          Next
        </h2>
        {nextItems.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Nothing scheduled after this.</p>
        ) : (
          <ul className="space-y-2">
            {nextItems.map((item) => (
              <li key={item.id}>
                <Card className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{item.title}</span>
                  {canManage && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void startItem(item.id)}
                    >
                      Start
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
