'use client';

/**
 * Co-design session detail — edit, lifecycle controls, and history
 * (BUILD_ROADMAP.md Milestone 2).
 *
 * Every mutation sends the session's current `version` back as
 * `expectedVersion` (`CoDesignSessionDetail.version`). A `409 STALE_VERSION`
 * response means someone else changed the session since this page loaded
 * it — handled as its own state (`staleUpdate`) rather than folded into the
 * generic error banner, because the fix is different: reload, not retry.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { SessionLifecycleEventView, SessionStatus } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, SessionStatusBadge } from '@/components/ui';

type SessionDetailState = Awaited<ReturnType<typeof api.getSession>>;

const LIFECYCLE_ACTION_LABELS: Record<string, string> = {
  'co_design_session.created': 'Created',
  'co_design_session.scheduled': 'Scheduled',
  'co_design_session.opened': 'Opened',
  'co_design_session.closed': 'Closed',
  'co_design_session.reopened': 'Reopened',
  'co_design_session.archived': 'Archived',
};

const TRANSITION_LABELS: Partial<Record<SessionStatus, string>> = {
  scheduled: 'Schedule',
  open: 'Open',
  closed: 'Close',
  archived: 'Archive',
  draft: 'Move back to draft',
};

/**
 * The session workspace's own navigation — one entry per stage of
 * `docs`'s prepare → consent → capture → process → review → decide → act →
 * report hierarchy that this session actually has a page for. `href` is
 * appended to `/workspaces/:id/sessions/:sessionId`.
 */
const SESSION_WORKSPACE_LINKS: { href: string; label: string; description: string }[] = [
  {
    href: '/participants',
    label: 'People',
    description: 'Who is expected, who attended, and their roles in this session.',
  },
  {
    href: '/consent-configuration',
    label: 'Consent',
    description: 'Which categories of consent this session asks for, and from whom.',
  },
  {
    href: '/consent-dashboard',
    label: 'Consent dashboard',
    description: "Every participant's consent decisions at a glance.",
  },
  {
    href: '/evidence',
    label: 'Capture & evidence',
    description: 'Record, upload, and review what was said, shown, or handed over.',
  },
  {
    href: '/summary',
    label: 'Summary',
    description: 'A local AI-drafted summary of the session, for a human to confirm.',
  },
  {
    href: '/outcomes',
    label: 'Outcomes',
    description: 'Decisions, commitments, and actions this session produced.',
  },
  {
    href: '/reports',
    label: 'Reports',
    description: 'Compose, review, and export a written account of this session.',
  },
  {
    href: '/recap',
    label: 'Recap',
    description: 'What happened, for anyone who took part to read back.',
  },
];

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [session, setSession] = useState<SessionDetailState | null>(null);
  const [history, setHistory] = useState<SessionLifecycleEventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleUpdate, setStaleUpdate] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editLocation, setEditLocation] = useState('');

  const [scheduling, setScheduling] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  /**
   * A concise operating picture, not a second source of truth — every count
   * here is a plain read of a list this build already exposes elsewhere
   * (Participants, Contributions, Outcomes). Loaded separately from the
   * session/history load above and allowed to fail independently: a
   * facilitator who can see the session but, say, not evidence yet should
   * still see the page, just with that one figure omitted rather than the
   * whole page failing.
   */
  const [sessionMap, setSessionMap] = useState<{
    participants: number;
    evidence: number;
    decisionsConfirmed: number;
    actionsOpen: number;
  } | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [sessionResult, historyResult] = await Promise.all([
          api.getSession(workspaceId, sessionId, user),
          api.getSessionHistory(workspaceId, sessionId, user),
        ]);
        if (cancelledRef.current) return;
        setSession(sessionResult);
        setHistory(historyResult.events);
        setEditTitle(sessionResult.title);
        setEditPurpose(sessionResult.purpose);
        setEditLocation(sessionResult.location ?? '');
        setError(null);
        setForbidden(false);
      } catch (caught) {
        if (cancelledRef.current) return;
        if (caught instanceof ApiError && caught.status === 403) {
          setForbidden(true);
        } else {
          setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }

      const [participantsResult, evidenceResult, decisionsResult, actionsResult] =
        await Promise.allSettled([
          api.listParticipants(workspaceId, sessionId, user),
          api.listEvidence(workspaceId, sessionId, user),
          api.listDecisions(workspaceId, sessionId, user),
          api.listActionItems(workspaceId, sessionId, user),
        ]);
      if (cancelledRef.current) return;
      setSessionMap({
        participants:
          participantsResult.status === 'fulfilled'
            ? participantsResult.value.participants.filter((p) => !p.withdrawn).length
            : 0,
        evidence: evidenceResult.status === 'fulfilled' ? evidenceResult.value.evidence.length : 0,
        decisionsConfirmed:
          decisionsResult.status === 'fulfilled'
            ? decisionsResult.value.decisions.filter((d) => d.status === 'confirmed').length
            : 0,
        actionsOpen:
          actionsResult.status === 'fulfilled'
            ? actionsResult.value.actions.filter(
                (a) => a.status === 'open' || a.status === 'in_progress',
              ).length
            : 0,
      });
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

  const runMutation = async (operation: () => Promise<SessionDetailState>) => {
    setBusy(true);
    setStaleUpdate(false);
    setError(null);
    try {
      const updated = await operation();
      setSession(updated);
      const historyResult = await api.getSessionHistory(workspaceId, sessionId, user);
      setHistory(historyResult.events);
      return true;
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'STALE_VERSION') {
        setStaleUpdate(true);
      } else if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (session === null) return;
    const ok = await runMutation(() =>
      api.updateSession(
        workspaceId,
        sessionId,
        {
          title: editTitle,
          purpose: editPurpose,
          location: editLocation.trim() === '' ? null : editLocation,
          expectedVersion: session.version,
        },
        user,
      ),
    );
    if (ok) setEditing(false);
  };

  const applyTransition = async (action: 'open' | 'close' | 'archive' | 'unschedule') => {
    if (session === null) return;
    await runMutation(() =>
      api.transitionSession(
        workspaceId,
        sessionId,
        { action, expectedVersion: session.version },
        user,
      ),
    );
  };

  const submitSchedule = async () => {
    if (session === null || startAt === '') return;
    if (endAt !== '' && endAt <= startAt) return;
    const ok = await runMutation(() =>
      api.transitionSession(
        workspaceId,
        sessionId,
        {
          action: 'schedule',
          startAt: new Date(startAt).toISOString(),
          endAt: endAt === '' ? undefined : new Date(endAt).toISOString(),
          // The IANA zone the facilitator is scheduling in — recorded
          // explicitly rather than left implicit, so a session run in a
          // community with a different zone displays the intended time for
          // everyone, not just whoever's browser happened to submit this form.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          expectedVersion: session.version,
        },
        user,
      ),
    );
    if (ok) setScheduling(false);
  };

  const submitReopen = async () => {
    if (session === null || reopenReason.trim() === '') return;
    const ok = await runMutation(() =>
      api.transitionSession(
        workspaceId,
        sessionId,
        { action: 'reopen', reason: reopenReason, expectedVersion: session.version },
        user,
      ),
    );
    if (ok) {
      setReopening(false);
      setReopenReason('');
    }
  };

  const reload = () => {
    setStaleUpdate(false);
    setLoading(true);
    void load({ current: false });
  };

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this session. Ask a workspace administrator to check your role assignment." />
        <Link href={`/workspaces/${workspaceId}/sessions`} className="text-sm underline">
          ← Back to sessions
        </Link>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No session with id '${sessionId}'.`} />
        <Link href={`/workspaces/${workspaceId}/sessions`} className="text-sm underline">
          ← Back to sessions
        </Link>
      </div>
    );
  }

  const canSchedule = session.permittedTransitions.includes('scheduled');
  // A closed session also lists 'open' among its permitted transitions (the
  // reopen edge), but that path requires a stated reason — only the Reopen
  // control below may use it. The plain Open button must not appear for a
  // closed session, or it would let a facilitator bypass that requirement.
  const canOpen = session.status !== 'closed' && session.permittedTransitions.includes('open');
  const canClose = session.permittedTransitions.includes('closed');
  const canArchive = session.permittedTransitions.includes('archived');
  const canReopen = session.status === 'closed' && session.permittedTransitions.includes('open');
  const canUnschedule =
    session.status === 'scheduled' && session.permittedTransitions.includes('draft');
  const isArchived = session.status === 'archived';

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${workspaceId}/sessions`} className="inline-block text-sm underline">
        ← Back to sessions
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      {staleUpdate && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-600 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>This session was changed by someone else since you loaded it.</span>
          <Button variant="secondary" onClick={reload}>
            Reload
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--color-ink-muted)]">Session</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
            <SessionStatusBadge status={session.status} />
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {session.sessionType} · {session.deliveryMode.replace('_', ' ')}
          </p>
        </div>
        {!isArchived && (
          <Button variant="secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel edit' : 'Edit details'}
          </Button>
        )}
      </div>

      {isArchived && (
        <p className="text-sm text-[var(--color-ink-muted)]" role="status">
          This session is archived and read-only.
        </p>
      )}

      {/*
        The operating picture — what's true right now, in numbers a
        facilitator would otherwise have to open five separate pages to add
        up. `NEXT_STEP_LABELS` below turns the same status into "what should
        I do next", so a facilitator lands here and immediately knows both
        where things stand and what to do about it.
      */}
      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-[var(--color-ink-muted)]">Consent</dt>
            <dd className="mt-0.5 font-medium">
              {session.consentConfigurationState === 'configured' ? 'Configured' : 'Not configured'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-muted)]">Participants</dt>
            <dd className="mt-0.5 font-medium">{sessionMap?.participants ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-muted)]">Contributions</dt>
            <dd className="mt-0.5 font-medium">{sessionMap?.evidence ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-muted)]">Decisions confirmed</dt>
            <dd className="mt-0.5 font-medium">{sessionMap?.decisionsConfirmed ?? '—'}</dd>
          </div>
        </dl>
        {sessionMap !== null && sessionMap.actionsOpen > 0 && (
          <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-sm">
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {sessionMap.actionsOpen} open action{sessionMap.actionsOpen === 1 ? '' : 's'}
            </span>{' '}
            still need follow-up.{' '}
            <Link
              href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes`}
              className="underline"
            >
              Review outcomes →
            </Link>
          </p>
        )}
      </Card>

      <section aria-labelledby="workspace-nav-heading">
        <h2 id="workspace-nav-heading" className="mb-3 text-lg font-semibold">
          Session workspace
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SESSION_WORKSPACE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={`/workspaces/${workspaceId}/sessions/${sessionId}${link.href}`}
              className="block rounded-lg focus-visible:outline-none"
            >
              <Card className="h-full transition-colors hover:bg-[var(--color-accent-soft)]">
                <p className="font-medium">{link.label}</p>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{link.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {editing ? (
        <Card className="space-y-4">
          <div>
            <label htmlFor="editTitle" className="mb-1 block text-sm font-medium">
              Title
            </label>
            <input
              id="editTitle"
              maxLength={200}
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="editPurpose" className="mb-1 block text-sm font-medium">
              Purpose
            </label>
            <textarea
              id="editPurpose"
              maxLength={2000}
              rows={3}
              value={editPurpose}
              onChange={(event) => setEditPurpose(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="editLocation" className="mb-1 block text-sm font-medium">
              Location
            </label>
            <input
              id="editLocation"
              maxLength={300}
              value={editLocation}
              onChange={(event) => setEditLocation(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>
          <Button
            variant="primary"
            disabled={busy || editTitle.trim() === '' || editPurpose.trim() === ''}
            onClick={() => void saveEdit()}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-2 text-sm">
          <p>{session.purpose}</p>
          {session.location !== null && (
            <p className="text-[var(--color-ink-muted)]">Location: {session.location}</p>
          )}
          {session.startAt !== null && (
            <p className="text-[var(--color-ink-muted)]">
              Scheduled: {new Date(session.startAt).toLocaleString()}
              {session.endAt !== null ? ` – ${new Date(session.endAt).toLocaleString()}` : ''}
            </p>
          )}
          {session.culturalProtocolNotes !== null && (
            <p className="text-[var(--color-ink-muted)]">
              Cultural protocol: {session.culturalProtocolNotes}
            </p>
          )}
        </Card>
      )}

      {!isArchived && (
        <section aria-labelledby="lifecycle-heading">
          <h2 id="lifecycle-heading" className="mb-3 text-lg font-semibold">
            Lifecycle
          </h2>
          <Card className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {canSchedule && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setScheduling((v) => !v)}
                >
                  {TRANSITION_LABELS.scheduled}
                </Button>
              )}
              {canUnschedule && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void applyTransition('unschedule')}
                >
                  {TRANSITION_LABELS.draft}
                </Button>
              )}
              {canOpen && (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void applyTransition('open')}
                >
                  {TRANSITION_LABELS.open}
                </Button>
              )}
              {canClose && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void applyTransition('close')}
                >
                  {TRANSITION_LABELS.closed}
                </Button>
              )}
              {canReopen && (
                <Button variant="secondary" disabled={busy} onClick={() => setReopening((v) => !v)}>
                  Reopen
                </Button>
              )}
              {canArchive && (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => void applyTransition('archive')}
                >
                  {TRANSITION_LABELS.archived}
                </Button>
              )}
              {session.permittedTransitions.length === 0 && (
                <p className="text-sm text-[var(--color-ink-muted)]">No transitions available.</p>
              )}
            </div>

            {scheduling && (
              <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="startAt" className="mb-1 block text-sm font-medium">
                      Start <span aria-hidden="true">*</span>
                      <span className="sr-only">(required)</span>
                    </label>
                    <input
                      id="startAt"
                      type="datetime-local"
                      required
                      value={startAt}
                      onChange={(event) => setStartAt(event.target.value)}
                      className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="endAt" className="mb-1 block text-sm font-medium">
                      End
                    </label>
                    <input
                      id="endAt"
                      type="datetime-local"
                      value={endAt}
                      onChange={(event) => setEndAt(event.target.value)}
                      className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                    />
                  </div>
                </div>
                <Button
                  variant="primary"
                  disabled={busy || startAt === '' || (endAt !== '' && endAt <= startAt)}
                  onClick={() => void submitSchedule()}
                >
                  Confirm schedule
                </Button>
                {endAt !== '' && endAt <= startAt && (
                  <p className="text-sm text-amber-700 dark:text-amber-400" role="alert">
                    The end time must be after the start time.
                  </p>
                )}
              </div>
            )}

            {reopening && (
              <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
                <label htmlFor="reopenReason" className="mb-1 block text-sm font-medium">
                  Reason for reopening <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="reopenReason"
                  required
                  value={reopenReason}
                  onChange={(event) => setReopenReason(event.target.value)}
                  placeholder="Facilitator identified an unresolved agenda item."
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
                <Button
                  variant="primary"
                  disabled={busy || reopenReason.trim() === ''}
                  onClick={() => void submitReopen()}
                >
                  Confirm reopen
                </Button>
              </div>
            )}
          </Card>
        </section>
      )}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          Lifecycle history
        </h2>
        {history.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">No lifecycle events yet.</p>
          </Card>
        ) : (
          <Card>
            <ol className="space-y-3 text-sm">
              {history.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <strong>{LIFECYCLE_ACTION_LABELS[event.action] ?? event.action}</strong> by{' '}
                    {event.actor.displayName}
                    {event.metadata['reason'] !== undefined && (
                      <span className="text-[var(--color-ink-muted)]">
                        {' '}
                        — {event.metadata['reason']}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    {new Date(event.occurredAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </section>
    </div>
  );
}
