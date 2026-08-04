'use client';

/**
 * Participant detail — edit, invitation and attendance controls, identity
 * visibility, restricted facilitator notes, and history (BUILD_ROADMAP.md
 * Milestone 3).
 *
 * Every mutation sends the participant's current `version` back as
 * `expectedVersion`, same optimistic-concurrency pattern as the session
 * detail page — see that page's header comment for why a `409
 * STALE_VERSION` gets its own state instead of the generic error banner.
 *
 * `facilitatorNotes`/`linkedUserId` are rendered only when the loaded
 * `SessionParticipantDetail` actually carries them — the server omits both
 * keys entirely for a caller without `participant:manage_restricted` (an
 * anonymous/pseudonymous participant's `linkedUserId` is restricted; a
 * named participant's is not). Their absence on the wire is what drives
 * whether this page shows the controls at all, not a client-side guess.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  ParticipantAttendanceStatus,
  ParticipantIdentityVisibility,
  ParticipantInvitationStatus,
  SessionLifecycleEventView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import {
  Button,
  Card,
  ErrorNotice,
  LinkButton,
  ParticipantAttendanceBadge,
  ParticipantInvitationBadge,
} from '@/components/ui';

type ParticipantDetailState = Awaited<ReturnType<typeof api.getParticipant>>;

const INVITATION_ACTION_FOR_STATUS: Partial<
  Record<
    ParticipantInvitationStatus,
    'invite' | 'accept_invitation' | 'decline_invitation' | 'cancel_invitation'
  >
> = {
  invited: 'invite',
  accepted: 'accept_invitation',
  declined: 'decline_invitation',
  cancelled: 'cancel_invitation',
};

const INVITATION_ACTION_LABELS: Record<string, string> = {
  invite: 'Invite',
  accept_invitation: 'Mark accepted',
  decline_invitation: 'Mark declined',
  cancel_invitation: 'Cancel invitation',
};

const ATTENDANCE_LABELS: Record<ParticipantAttendanceStatus, string> = {
  expected: 'Expected',
  present: 'Present',
  absent: 'Absent',
  partially_attended: 'Partially attended',
  left_early: 'Left early',
};

const IDENTITY_VISIBILITY_LABELS: Record<ParticipantIdentityVisibility, string> = {
  visible_to_all_participants: 'Visible to all participants',
  facilitators_only: 'Facilitators only',
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  'session_participant.added': 'Added',
  'session_participant.linked_user_changed': 'Linked user changed',
  'session_participant.identity_visibility_changed': 'Identity visibility changed',
  'session_participant.invitation_status_changed': 'Invitation status changed',
  'session_participant.attendance_status_changed': 'Attendance recorded',
  'session_participant.withdrawn': 'Withdrawn',
  'session_participant.restored': 'Restored',
};

export default function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string; participantId: string }>;
}) {
  const { id: workspaceId, sessionId, participantId } = use(params);
  const { user, ready } = useSession();

  const [participant, setParticipant] = useState<ParticipantDetailState | null>(null);
  const [history, setHistory] = useState<SessionLifecycleEventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleUpdate, setStaleUpdate] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPreferredName, setEditPreferredName] = useState('');
  const [editPronouns, setEditPronouns] = useState('');
  const [editAffiliation, setEditAffiliation] = useState('');

  const [notesDraft, setNotesDraft] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [participantResult, historyResult] = await Promise.all([
          api.getParticipant(workspaceId, sessionId, participantId, user),
          api.getParticipantHistory(workspaceId, sessionId, participantId, user),
        ]);
        if (cancelledRef.current) return;
        setParticipant(participantResult);
        setHistory(historyResult.events);
        setEditDisplayName(participantResult.displayName);
        setEditPreferredName(participantResult.preferredName ?? '');
        setEditPronouns(participantResult.pronouns ?? '');
        setEditAffiliation(participantResult.affiliation ?? '');
        setNotesDraft(participantResult.facilitatorNotes ?? '');
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
    },
    [workspaceId, sessionId, participantId, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const runMutation = async (
    operation: () => Promise<ParticipantDetailState>,
  ): Promise<boolean> => {
    setBusy(true);
    setStaleUpdate(false);
    setError(null);
    try {
      const updated = await operation();
      setParticipant(updated);
      const historyResult = await api.getParticipantHistory(
        workspaceId,
        sessionId,
        participantId,
        user,
      );
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
    if (participant === null) return;
    const ok = await runMutation(() =>
      api.updateParticipant(
        workspaceId,
        sessionId,
        participantId,
        {
          displayName: participant.identityMode === 'anonymous' ? undefined : editDisplayName,
          preferredName: editPreferredName.trim() === '' ? null : editPreferredName,
          pronouns: editPronouns.trim() === '' ? null : editPronouns,
          affiliation: editAffiliation.trim() === '' ? null : editAffiliation,
          expectedVersion: participant.version,
        },
        user,
      ),
    );
    if (ok) setEditing(false);
  };

  const applyInvitation = async (status: ParticipantInvitationStatus) => {
    if (participant === null) return;
    const action = INVITATION_ACTION_FOR_STATUS[status];
    if (action === undefined) return;
    await runMutation(() =>
      api.transitionParticipant(
        workspaceId,
        sessionId,
        participantId,
        { action, expectedVersion: participant.version },
        user,
      ),
    );
  };

  const applyAttendance = async (status: ParticipantAttendanceStatus) => {
    if (participant === null) return;
    await runMutation(() =>
      api.transitionParticipant(
        workspaceId,
        sessionId,
        participantId,
        { action: 'record_attendance', status, expectedVersion: participant.version },
        user,
      ),
    );
  };

  const applyIdentityVisibility = async (identityVisibility: ParticipantIdentityVisibility) => {
    if (participant === null) return;
    await runMutation(() =>
      api.transitionParticipant(
        workspaceId,
        sessionId,
        participantId,
        {
          action: 'change_identity_visibility',
          identityVisibility,
          expectedVersion: participant.version,
        },
        user,
      ),
    );
  };

  const saveNotes = async () => {
    if (participant === null) return;
    await runMutation(() =>
      api.updateParticipantNotes(
        workspaceId,
        sessionId,
        participantId,
        {
          facilitatorNotes: notesDraft.trim() === '' ? null : notesDraft,
          expectedVersion: participant.version,
        },
        user,
      ),
    );
  };

  const submitWithdraw = async () => {
    if (participant === null) return;
    const ok = await runMutation(() =>
      api.transitionParticipant(
        workspaceId,
        sessionId,
        participantId,
        {
          action: 'withdraw',
          reason: withdrawReason.trim() === '' ? undefined : withdrawReason,
          expectedVersion: participant.version,
        },
        user,
      ),
    );
    if (ok) {
      setWithdrawing(false);
      setWithdrawReason('');
    }
  };

  const restore = async () => {
    if (participant === null) return;
    await runMutation(() =>
      api.transitionParticipant(
        workspaceId,
        sessionId,
        participantId,
        { action: 'restore', expectedVersion: participant.version },
        user,
      ),
    );
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
        <ErrorNotice message="You do not have permission to view this participant." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants`}
          className="text-sm underline"
        >
          ← Back to participants
        </Link>
      </div>
    );
  }

  if (participant === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No participant with id '${participantId}'.`} />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants`}
          className="text-sm underline"
        >
          ← Back to participants
        </Link>
      </div>
    );
  }

  const canSeeNotes = 'facilitatorNotes' in participant;
  const isAnonymous = participant.identityMode === 'anonymous';

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants`}
        className="inline-block text-sm underline"
      >
        ← Back to participants
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      {staleUpdate && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-600 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>This participant was changed by someone else since you loaded them.</span>
          <Button variant="secondary" onClick={reload}>
            Reload
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{participant.displayName}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {participant.participantType} · {participant.participationMode.replace('_', ' ')} ·{' '}
            {participant.identityMode}
          </p>
          {participant.withdrawn && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400" role="status">
              This participant has been withdrawn.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <LinkButton
            href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants/${participantId}/consent`}
          >
            Consent →
          </LinkButton>
          {!participant.withdrawn && (
            <Button variant="secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancel edit' : 'Edit details'}
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <Card className="space-y-4">
          {!isAnonymous && (
            <>
              <div>
                <label htmlFor="editDisplayName" className="mb-1 block text-sm font-medium">
                  {participant.identityMode === 'pseudonymous' ? 'Pseudonym' : 'Display name'}
                </label>
                <input
                  id="editDisplayName"
                  maxLength={200}
                  value={editDisplayName}
                  onChange={(event) => setEditDisplayName(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="editPreferredName" className="mb-1 block text-sm font-medium">
                    Preferred name
                  </label>
                  <input
                    id="editPreferredName"
                    maxLength={200}
                    value={editPreferredName}
                    onChange={(event) => setEditPreferredName(event.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="editPronouns" className="mb-1 block text-sm font-medium">
                    Pronouns
                  </label>
                  <input
                    id="editPronouns"
                    maxLength={50}
                    value={editPronouns}
                    onChange={(event) => setEditPronouns(event.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="editAffiliation" className="mb-1 block text-sm font-medium">
                  Affiliation
                </label>
                <input
                  id="editAffiliation"
                  maxLength={300}
                  value={editAffiliation}
                  onChange={(event) => setEditAffiliation(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
            </>
          )}
          <Button
            variant="primary"
            disabled={busy || (!isAnonymous && editDisplayName.trim() === '')}
            onClick={() => void saveEdit()}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-2 text-sm">
          {participant.preferredName !== null && <p>Preferred name: {participant.preferredName}</p>}
          {participant.pronouns !== null && <p>Pronouns: {participant.pronouns}</p>}
          {participant.affiliation !== null && <p>Affiliation: {participant.affiliation}</p>}
          {participant.languagePreference !== null && (
            <p className="text-[var(--color-ink-muted)]">
              Language preference: {participant.languagePreference}
            </p>
          )}
          {participant.accessibilityRequirements !== null && (
            <p className="text-[var(--color-ink-muted)]">
              Accessibility requirements: {participant.accessibilityRequirements}
            </p>
          )}
          {participant.linkedUserId !== undefined && participant.linkedUserId !== null && (
            <p className="text-[var(--color-ink-muted)]">
              Linked registered user: {participant.linkedUserId}
            </p>
          )}
        </Card>
      )}

      <section aria-labelledby="invitation-heading">
        <h2 id="invitation-heading" className="mb-3 text-lg font-semibold">
          Invitation
        </h2>
        <Card className="flex flex-wrap items-center gap-3">
          <ParticipantInvitationBadge status={participant.invitationStatus} />
          <div className="flex flex-wrap gap-2">
            {participant.permittedInvitationTransitions.map((status) => {
              const action = INVITATION_ACTION_FOR_STATUS[status];
              if (action === undefined) return null;
              return (
                <Button
                  key={status}
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void applyInvitation(status)}
                >
                  {INVITATION_ACTION_LABELS[action]}
                </Button>
              );
            })}
          </div>
        </Card>
      </section>

      <section aria-labelledby="attendance-heading">
        <h2 id="attendance-heading" className="mb-3 text-lg font-semibold">
          Attendance
        </h2>
        <Card className="flex flex-wrap items-center gap-3">
          <ParticipantAttendanceBadge status={participant.attendanceStatus} />
          <div className="flex flex-wrap gap-2">
            {participant.permittedAttendanceTransitions.map((status) => (
              <Button
                key={status}
                variant="secondary"
                disabled={busy}
                onClick={() => void applyAttendance(status)}
              >
                Mark {ATTENDANCE_LABELS[status].toLowerCase()}
              </Button>
            ))}
          </div>
        </Card>
      </section>

      <section aria-labelledby="visibility-heading">
        <h2 id="visibility-heading" className="mb-3 text-lg font-semibold">
          Identity visibility
        </h2>
        <Card className="flex flex-wrap items-center gap-3">
          <label htmlFor="identityVisibility" className="sr-only">
            Identity visibility
          </label>
          <select
            id="identityVisibility"
            value={participant.identityVisibility}
            disabled={busy}
            onChange={(event) =>
              void applyIdentityVisibility(event.target.value as ParticipantIdentityVisibility)
            }
            className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm"
          >
            {Object.entries(IDENTITY_VISIBILITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Controls whether identity fields are shown to readers without restricted access.
          </p>
        </Card>
      </section>

      {canSeeNotes && (
        <section aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="mb-3 text-lg font-semibold">
            Restricted facilitator notes
          </h2>
          <Card className="space-y-3">
            <p className="text-xs text-[var(--color-ink-muted)]">
              Visible only to callers holding restricted participant access. Never included in the
              redacted export.
            </p>
            <label htmlFor="facilitatorNotes" className="sr-only">
              Facilitator notes
            </label>
            <textarea
              id="facilitatorNotes"
              maxLength={5000}
              rows={4}
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <Button variant="secondary" disabled={busy} onClick={() => void saveNotes()}>
              {busy ? 'Saving…' : 'Save notes'}
            </Button>
          </Card>
        </section>
      )}

      <section aria-labelledby="withdrawal-heading">
        <h2 id="withdrawal-heading" className="mb-3 text-lg font-semibold">
          Withdrawal
        </h2>
        <Card className="space-y-3">
          {participant.withdrawn ? (
            <Button variant="secondary" disabled={busy} onClick={() => void restore()}>
              Restore participant
            </Button>
          ) : withdrawing ? (
            <div className="space-y-3">
              <label htmlFor="withdrawReason" className="mb-1 block text-sm font-medium">
                Reason (optional)
              </label>
              <input
                id="withdrawReason"
                value={withdrawReason}
                onChange={(event) => setWithdrawReason(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
              <div className="flex gap-2">
                <Button variant="danger" disabled={busy} onClick={() => void submitWithdraw()}>
                  Confirm withdrawal
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setWithdrawing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => setWithdrawing(true)}>
              Withdraw participant
            </Button>
          )}
        </Card>
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          History
        </h2>
        {history.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">No history yet.</p>
          </Card>
        ) : (
          <Card>
            <ol className="space-y-3 text-sm">
              {history.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <strong>{HISTORY_ACTION_LABELS[event.action] ?? event.action}</strong> by{' '}
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
