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

import type {
  ActionItemSummary,
  ConsentFacilitatorDashboardView,
  DecisionSummary,
  EvidenceSummary,
  ReportSummary,
  SessionLifecycleEventView,
  SessionParticipantSummary,
  SessionStatus,
} from '@witness/contracts';

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
   * The raw material for both the operating-picture card and the Journey
   * Map/Timeline below — plain reads of lists this build already exposes
   * elsewhere (Participants, Contributions, Consent dashboard, Outcomes,
   * Reports), not a second source of truth. Loaded separately from the
   * session/history load above and allowed to fail independently per list:
   * a facilitator who can see the session but, say, not evidence yet should
   * still see the page, just with that one figure omitted rather than the
   * whole page failing. `null` for a list means "failed to load", never
   * silently "empty" — see the operating-picture card below for why that
   * distinction matters.
   */
  const [journey, setJourney] = useState<{
    participants: SessionParticipantSummary[] | null;
    consentDashboard: ConsentFacilitatorDashboardView | null;
    evidence: EvidenceSummary[] | null;
    decisions: DecisionSummary[] | null;
    actions: ActionItemSummary[] | null;
    reports: ReportSummary[] | null;
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

      const [
        participantsResult,
        consentDashboardResult,
        evidenceResult,
        decisionsResult,
        actionsResult,
        reportsResult,
      ] = await Promise.allSettled([
        api.listParticipants(workspaceId, sessionId, user),
        api.getConsentDashboard(workspaceId, sessionId, user),
        api.listEvidence(workspaceId, sessionId, user),
        api.listDecisions(workspaceId, sessionId, user),
        api.listActionItems(workspaceId, sessionId, user),
        api.listReports(workspaceId, sessionId, user),
      ]);
      if (cancelledRef.current) return;
      setJourney({
        participants:
          participantsResult.status === 'fulfilled'
            ? participantsResult.value.participants.filter((p) => !p.withdrawn)
            : null,
        consentDashboard:
          consentDashboardResult.status === 'fulfilled' ? consentDashboardResult.value : null,
        evidence: evidenceResult.status === 'fulfilled' ? evidenceResult.value.evidence : null,
        decisions: decisionsResult.status === 'fulfilled' ? decisionsResult.value.decisions : null,
        actions: actionsResult.status === 'fulfilled' ? actionsResult.value.actions : null,
        reports: reportsResult.status === 'fulfilled' ? reportsResult.value.reports : null,
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

      <SessionJourneyMap
        workspaceId={workspaceId}
        sessionId={sessionId}
        session={session}
        journey={journey}
      />

      {/* One number that doesn't fit the journey stages themselves. */}
      {journey !== null &&
        journey.actions !== null &&
        (() => {
          const openCount = journey.actions!.filter(
            (a) => a.status === 'open' || a.status === 'in_progress',
          ).length;
          if (openCount === 0) return null;
          return (
            <Card>
              <p className="text-sm">
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {openCount} open action{openCount === 1 ? '' : 's'}
                </span>{' '}
                still need follow-up.{' '}
                <Link
                  href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes`}
                  className="underline"
                >
                  Review outcomes →
                </Link>
              </p>
            </Card>
          );
        })()}

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

      <SessionTimeline history={history} journey={journey} />
    </div>
  );
}

// ─── Session Journey Map ─────────────────────────────────────────────────────

type JourneyStatus = 'not_started' | 'in_progress' | 'ready' | 'needs_attention' | 'complete';

interface JourneyStage {
  key: string;
  label: string;
  status: JourneyStatus;
  detail: string;
  href: string;
}

const JOURNEY_STATUS_LABELS: Record<JourneyStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  ready: 'Ready',
  needs_attention: 'Needs attention',
  complete: 'Complete',
};

/**
 * Deliberately restrained — one colour family per status, never more than
 * that, and the label above always carries the meaning on its own (WCAG
 * 2.2 AA 1.4.1: colour is never the only signal).
 */
const JOURNEY_STATUS_CLASSES: Record<JourneyStatus, string> = {
  not_started: 'border-current text-[var(--color-ink-muted)]',
  in_progress: 'border-sky-700 text-sky-700 dark:text-sky-400',
  ready: 'border-sky-700 text-sky-700 dark:text-sky-400',
  needs_attention: 'border-amber-600 text-amber-700 dark:text-amber-400',
  complete: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
};

/**
 * Every stage's status is computed from data this page already loads
 * (`journey`) — never fabricated. A `null` list (that source failed to
 * load) always resolves to `not_started` with a "—" detail rather than
 * guessing; the operating-picture card's `?? '—'` convention extends here.
 */
function computeJourneyStages(
  session: SessionDetailState,
  journey: {
    participants: SessionParticipantSummary[] | null;
    consentDashboard: ConsentFacilitatorDashboardView | null;
    evidence: EvidenceSummary[] | null;
    decisions: DecisionSummary[] | null;
    actions: ActionItemSummary[] | null;
    reports: ReportSummary[] | null;
  },
  workspaceId: string,
  sessionId: string,
): JourneyStage[] {
  const base = `/workspaces/${workspaceId}/sessions/${sessionId}`;

  // PREPARE
  let prepare: JourneyStage;
  if (journey.participants === null) {
    prepare = {
      key: 'prepare',
      label: 'Prepare',
      status: 'not_started',
      detail: '—',
      href: `${base}/participants`,
    };
  } else if (journey.participants.length === 0) {
    prepare = {
      key: 'prepare',
      label: 'Prepare',
      status: session.status === 'draft' ? 'in_progress' : 'needs_attention',
      detail: 'No participants added yet.',
      href: `${base}/participants`,
    };
  } else {
    prepare = {
      key: 'prepare',
      label: 'Prepare',
      status: session.status === 'draft' ? 'ready' : 'complete',
      detail: `${journey.participants.length} participant${journey.participants.length === 1 ? '' : 's'} added.`,
      href: `${base}/participants`,
    };
  }

  // CONSENT
  let consent: JourneyStage;
  if (session.consentConfigurationState !== 'configured') {
    consent = {
      key: 'consent',
      label: 'Consent',
      status: 'not_started',
      detail: 'Not configured yet.',
      href: `${base}/consent-configuration`,
    };
  } else if (journey.consentDashboard === null) {
    consent = {
      key: 'consent',
      label: 'Consent',
      status: 'in_progress',
      detail: 'Configured.',
      href: `${base}/consent-dashboard`,
    };
  } else {
    const total = journey.consentDashboard.participants.length;
    const settled = journey.consentDashboard.participants.filter(
      (p) => p.status === 'granted' || p.status === 'partially_granted' || p.status === 'refused',
    ).length;
    if (total === 0) {
      consent = {
        key: 'consent',
        label: 'Consent',
        status: 'ready',
        detail: 'Configured; no participants yet.',
        href: `${base}/consent-dashboard`,
      };
    } else if (settled === total) {
      consent = {
        key: 'consent',
        label: 'Consent',
        status: 'complete',
        detail: `All ${total} participant${total === 1 ? '' : 's'} have a decision on record.`,
        href: `${base}/consent-dashboard`,
      };
    } else {
      consent = {
        key: 'consent',
        label: 'Consent',
        status: 'needs_attention',
        detail: `${total - settled} of ${total} participants still need consent captured.`,
        href: `${base}/consent-dashboard`,
      };
    }
  }

  // CAPTURE
  let capture: JourneyStage;
  if (journey.evidence === null) {
    capture = {
      key: 'capture',
      label: 'Capture',
      status: 'not_started',
      detail: '—',
      href: `${base}/evidence`,
    };
  } else if (journey.evidence.length === 0) {
    capture = {
      key: 'capture',
      label: 'Capture',
      status: 'not_started',
      detail: 'No evidence captured yet.',
      href: `${base}/evidence`,
    };
  } else {
    capture = {
      key: 'capture',
      label: 'Capture',
      status: session.status === 'open' ? 'in_progress' : 'complete',
      detail: `${journey.evidence.length} item${journey.evidence.length === 1 ? '' : 's'} captured.`,
      href: `${base}/evidence`,
    };
  }

  // PROCESS — transcription progress on any audio attachment.
  let process: JourneyStage;
  const withAudio = journey.evidence?.filter((e) => e.attachmentKind === 'audio') ?? null;
  if (journey.evidence === null) {
    process = {
      key: 'process',
      label: 'Process',
      status: 'not_started',
      detail: '—',
      href: `${base}/evidence`,
    };
  } else if (withAudio === null || withAudio.length === 0) {
    process = {
      key: 'process',
      label: 'Process',
      status: journey.evidence.length === 0 ? 'not_started' : 'complete',
      detail: journey.evidence.length === 0 ? 'Nothing to process yet.' : 'No audio to transcribe.',
      href: `${base}/evidence`,
    };
  } else {
    const failed = withAudio.filter((e) => e.transcriptStatus === 'failed').length;
    const pending = withAudio.filter(
      (e) => e.transcriptStatus === 'pending' || e.transcriptStatus === 'processing',
    ).length;
    if (failed > 0) {
      process = {
        key: 'process',
        label: 'Process',
        status: 'needs_attention',
        detail: `${failed} transcription${failed === 1 ? '' : 's'} failed.`,
        href: `${base}/evidence`,
      };
    } else if (pending > 0) {
      process = {
        key: 'process',
        label: 'Process',
        status: 'in_progress',
        detail: `${pending} transcription${pending === 1 ? '' : 's'} in progress.`,
        href: `${base}/evidence`,
      };
    } else {
      process = {
        key: 'process',
        label: 'Process',
        status: 'complete',
        detail: 'Transcription complete.',
        href: `${base}/evidence`,
      };
    }
  }

  // REVIEW
  const NEEDS_REVIEW = new Set(['submitted', 'under_review', 'needs_clarification']);
  let review: JourneyStage;
  if (journey.evidence === null) {
    review = {
      key: 'review',
      label: 'Review',
      status: 'not_started',
      detail: '—',
      href: `/workspaces/${workspaceId}/review`,
    };
  } else if (journey.evidence.length === 0) {
    review = {
      key: 'review',
      label: 'Review',
      status: 'not_started',
      detail: 'Nothing to review yet.',
      href: `/workspaces/${workspaceId}/review`,
    };
  } else {
    const pending = journey.evidence.filter((e) => NEEDS_REVIEW.has(e.reviewStatus)).length;
    review =
      pending > 0
        ? {
            key: 'review',
            label: 'Review',
            status: 'needs_attention',
            detail: `${pending} item${pending === 1 ? '' : 's'} awaiting review.`,
            href: `/workspaces/${workspaceId}/review`,
          }
        : {
            key: 'review',
            label: 'Review',
            status: 'complete',
            detail: 'All evidence has been reviewed.',
            href: `/workspaces/${workspaceId}/review`,
          };
  }

  // DECIDE
  let decide: JourneyStage;
  if (journey.decisions === null) {
    decide = {
      key: 'decide',
      label: 'Decide',
      status: 'not_started',
      detail: '—',
      href: `${base}/outcomes`,
    };
  } else if (journey.decisions.length === 0) {
    decide = {
      key: 'decide',
      label: 'Decide',
      status: 'not_started',
      detail: 'No decisions recorded yet.',
      href: `${base}/outcomes`,
    };
  } else {
    const proposed = journey.decisions.filter((d) => d.status === 'proposed').length;
    decide =
      proposed > 0
        ? {
            key: 'decide',
            label: 'Decide',
            status: 'in_progress',
            detail: `${proposed} decision${proposed === 1 ? '' : 's'} proposed, awaiting confirmation.`,
            href: `${base}/outcomes`,
          }
        : {
            key: 'decide',
            label: 'Decide',
            status: 'complete',
            detail: `${journey.decisions.filter((d) => d.status === 'confirmed').length} decision(s) confirmed.`,
            href: `${base}/outcomes`,
          };
  }

  // ACT
  let act: JourneyStage;
  if (journey.actions === null) {
    act = {
      key: 'act',
      label: 'Act',
      status: 'not_started',
      detail: '—',
      href: `${base}/outcomes`,
    };
  } else if (journey.actions.length === 0) {
    act = {
      key: 'act',
      label: 'Act',
      status: 'not_started',
      detail: 'No follow-up actions recorded yet.',
      href: `${base}/outcomes`,
    };
  } else {
    const blocked = journey.actions.filter((a) => a.status === 'blocked').length;
    const open = journey.actions.filter(
      (a) => a.status === 'open' || a.status === 'in_progress',
    ).length;
    if (blocked > 0) {
      act = {
        key: 'act',
        label: 'Act',
        status: 'needs_attention',
        detail: `${blocked} action${blocked === 1 ? '' : 's'} blocked.`,
        href: `${base}/outcomes`,
      };
    } else if (open > 0) {
      act = {
        key: 'act',
        label: 'Act',
        status: 'in_progress',
        detail: `${open} action${open === 1 ? '' : 's'} open.`,
        href: `${base}/outcomes`,
      };
    } else {
      act = {
        key: 'act',
        label: 'Act',
        status: 'complete',
        detail: 'All actions closed.',
        href: `${base}/outcomes`,
      };
    }
  }

  // REPORT
  let report: JourneyStage;
  if (journey.reports === null) {
    report = {
      key: 'report',
      label: 'Report',
      status: 'not_started',
      detail: '—',
      href: `${base}/reports`,
    };
  } else if (journey.reports.length === 0) {
    report = {
      key: 'report',
      label: 'Report',
      status: 'not_started',
      detail: 'No report started yet.',
      href: `${base}/reports`,
    };
  } else {
    const published = journey.reports.some(
      (r) => r.status === 'published_internally' || r.status === 'exported',
    );
    report = published
      ? {
          key: 'report',
          label: 'Report',
          status: 'complete',
          detail: 'Published.',
          href: `${base}/reports`,
        }
      : {
          key: 'report',
          label: 'Report',
          status: 'in_progress',
          detail: 'In progress.',
          href: `${base}/reports`,
        };
  }

  return [prepare, consent, capture, process, review, decide, act, report];
}

/**
 * A process map, not a wizard — every stage is always visible and always a
 * link, regardless of where the session currently sits. It answers "where
 * are we" and "what's next", not "click through these steps in order".
 */
function SessionJourneyMap({
  workspaceId,
  sessionId,
  session,
  journey,
}: {
  workspaceId: string;
  sessionId: string;
  session: SessionDetailState;
  journey: {
    participants: SessionParticipantSummary[] | null;
    consentDashboard: ConsentFacilitatorDashboardView | null;
    evidence: EvidenceSummary[] | null;
    decisions: DecisionSummary[] | null;
    actions: ActionItemSummary[] | null;
    reports: ReportSummary[] | null;
  } | null;
}) {
  if (journey === null) return null;
  const stages = computeJourneyStages(session, journey, workspaceId, sessionId);

  return (
    <section aria-labelledby="journey-heading">
      <h2 id="journey-heading" className="mb-3 text-lg font-semibold">
        Session journey
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {stages.map((stage) => (
          <Link
            key={stage.key}
            href={stage.href}
            className="block rounded-lg focus-visible:outline-none"
          >
            <Card className="flex h-full flex-col gap-1.5 p-3 transition-colors hover:bg-[var(--color-accent-soft)]">
              <p className="text-sm font-medium">{stage.label}</p>
              <span
                className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${JOURNEY_STATUS_CLASSES[stage.status]}`}
              >
                {JOURNEY_STATUS_LABELS[stage.status]}
              </span>
              <p className="text-xs text-[var(--color-ink-muted)]">{stage.detail}</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Session Timeline ────────────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  label: string;
  actor?: string;
  at: string;
}

/**
 * Merges session lifecycle events with evidence/decision/report timestamps
 * this page already has in memory — no second audit store, no per-item
 * detail fetch. Action items are deliberately left out: `ActionItemSummary`
 * only carries `updatedAt`, not a distinguishable created/completed moment
 * (those exist on `ActionItemDetail`, one fetch per action — real N+1, not
 * built here), and a vague "action updated" entry would be exactly the kind
 * of noise this timeline exists to avoid.
 */
function buildTimeline(
  history: SessionLifecycleEventView[],
  journey: {
    evidence: EvidenceSummary[] | null;
    decisions: DecisionSummary[] | null;
    reports: ReportSummary[] | null;
  } | null,
): TimelineEvent[] {
  const events: TimelineEvent[] = history.map((event) => ({
    id: `lifecycle-${event.id}`,
    label: LIFECYCLE_ACTION_LABELS[event.action] ?? event.action,
    actor: event.actor.displayName,
    at: event.occurredAt,
  }));

  for (const item of journey?.evidence ?? []) {
    events.push({
      id: `evidence-${item.id}`,
      label: `Evidence added — ${item.title}`,
      at: item.capturedAt,
    });
  }
  for (const decision of journey?.decisions ?? []) {
    events.push({
      id: `decision-proposed-${decision.id}`,
      label: `Decision proposed — ${decision.title}`,
      at: decision.proposedAt,
    });
    if (decision.confirmedAt !== null) {
      events.push({
        id: `decision-confirmed-${decision.id}`,
        label: `Decision confirmed — ${decision.title}`,
        at: decision.confirmedAt,
      });
    }
  }
  for (const report of journey?.reports ?? []) {
    if (report.publishedAt !== null) {
      events.push({
        id: `report-published-${report.id}`,
        label: `Report published — ${report.title}`,
        at: report.publishedAt,
      });
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}

function SessionTimeline({
  history,
  journey,
}: {
  history: SessionLifecycleEventView[];
  journey: {
    evidence: EvidenceSummary[] | null;
    decisions: DecisionSummary[] | null;
    reports: ReportSummary[] | null;
  } | null;
}) {
  const events = buildTimeline(history, journey);

  return (
    <section aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className="mb-3 text-lg font-semibold">
        Session timeline
      </h2>
      {events.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">No timeline events yet.</p>
        </Card>
      ) : (
        <Card>
          <ol className="space-y-3 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {event.label}
                  {event.actor !== undefined && (
                    <span className="text-[var(--color-ink-muted)]"> by {event.actor}</span>
                  )}
                </span>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {new Date(event.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  );
}
