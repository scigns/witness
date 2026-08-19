'use client';

/**
 * Session participants (BUILD_ROADMAP.md Milestone 3, Participant Management).
 *
 * The list is already privacy-safe by the time it reaches this component —
 * `ParticipantsService.list` redacts `facilitators_only` participants
 * server-side for a caller who lacks `participant:manage_restricted`, and
 * `SessionParticipantSummary` has no `linkedUserId`/`facilitatorNotes` field
 * at all, so there is nothing for the frontend to accidentally render.
 */

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import type { CoDesignSessionDetail, SessionParticipantSummary } from '@witness/contracts';

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

const IDENTITY_MODE_LABELS: Record<string, string> = {
  named: 'Named',
  pseudonymous: 'Pseudonymous',
  anonymous: 'Anonymous',
};

export default function SessionParticipantsPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [session, setSession] = useState<CoDesignSessionDetail | null>(null);
  const [participants, setParticipants] = useState<SessionParticipantSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  // Separate from `error`: an export failure must not hide a roster that
  // already loaded correctly — the table below reacts only to the load
  // outcome, this banner reacts only to the export outcome.
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const [sessionResult, participantsResult] = await Promise.all([
          api.getSession(workspaceId, sessionId, user),
          api.listParticipants(workspaceId, sessionId, user),
        ]);
        if (cancelled) return;
        setSession(sessionResult);
        setParticipants(participantsResult.participants);
        setError(null);
        setForbidden(false);
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 403) {
          setForbidden(true);
        } else {
          setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, workspaceId, sessionId, user]);

  const exportRedacted = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const result = await api.exportParticipants(workspaceId, sessionId, user);
      const blob = new Blob([JSON.stringify(result.participants, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `session-${sessionId}-participants-redacted.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking synchronously can cancel the download in some browsers —
      // defer to the next task so the browser has started reading the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (caught) {
      setExportError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this session's participants." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
          className="text-sm underline"
        >
          ← Back to session
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
        className="inline-block text-sm underline"
      >
        ← Back to session
      </Link>

      {error !== null && <ErrorNotice message={error} />}
      {exportError !== null && <ErrorNotice message={exportError} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Participants{session !== null ? ` — ${session.title}` : ''}
          </h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Who is part of this co-design session, and how they are participating.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={exporting} onClick={() => void exportRedacted()}>
            {exporting ? 'Exporting…' : 'Export redacted list'}
          </Button>
          <LinkButton
            href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants/new`}
            variant="primary"
          >
            Add participant
          </LinkButton>
        </div>
      </div>

      {error !== null ? null : participants.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No participants yet. Add one to start building this session's roster.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Participants in this co-design session</caption>
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Type
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Identity
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Invitation
                </th>
                <th scope="col" className="py-2 font-medium">
                  Attendance
                </th>
              </tr>
            </thead>
            <tbody>
              {participants.map((participant) => (
                <tr key={participant.id} className="border-b border-[var(--color-line)]">
                  <td className="py-3 pr-4">
                    <Link
                      href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants/${participant.id}`}
                      className="font-medium hover:underline"
                    >
                      {participant.displayName}
                    </Link>
                    {participant.withdrawn && (
                      <span className="ml-2 text-xs text-[var(--color-ink-muted)]">
                        (withdrawn)
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-ink-muted)]">
                    {participant.participantType}
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-ink-muted)]">
                    {IDENTITY_MODE_LABELS[participant.identityMode] ?? participant.identityMode}
                  </td>
                  <td className="py-3 pr-4">
                    <ParticipantInvitationBadge status={participant.invitationStatus} />
                  </td>
                  <td className="py-3">
                    <ParticipantAttendanceBadge status={participant.attendanceStatus} />
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
