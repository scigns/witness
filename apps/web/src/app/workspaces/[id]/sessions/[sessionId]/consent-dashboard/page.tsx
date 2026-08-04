'use client';

/**
 * Facilitator consent dashboard — every participant's consent status at a
 * glance for one session (BUILD_ROADMAP.md Milestone 4, Consent
 * Management).
 *
 * Status values match `ParticipantConsentStatusSummary`
 * (`packages/contracts`): `not_configured`/`not_requested` describe the
 * *absence* of a consent record, not a record's own state — see that
 * type's doc comment for why `superseded` never appears here.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  ConsentFacilitatorDashboardView,
  ParticipantConsentStatusSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, ErrorNotice } from '@/components/ui';

const STATUS_LABELS: Record<ParticipantConsentStatusSummary, string> = {
  not_configured: 'Session not configured',
  not_requested: 'Not yet requested',
  granted: 'Granted',
  partially_granted: 'Partially granted',
  refused: 'Refused',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

const STATUS_CLASSES: Record<ParticipantConsentStatusSummary, string> = {
  not_configured: 'border-current text-[var(--color-ink-muted)]',
  not_requested: 'border-amber-600 text-amber-700 dark:text-amber-400',
  granted: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  partially_granted: 'border-amber-600 text-amber-700 dark:text-amber-400',
  refused: 'border-red-700 text-red-700 dark:text-red-400',
  withdrawn: 'border-red-700 text-red-700 dark:text-red-400',
  expired: 'border-amber-600 text-amber-700 dark:text-amber-400',
};

function StatusBadge({ status }: { status: ParticipantConsentStatusSummary }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function ConsentDashboardPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [dashboard, setDashboard] = useState<ConsentFacilitatorDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const result = await api.getConsentDashboard(workspaceId, sessionId, user);
        if (cancelledRef.current) return;
        setDashboard(result);
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

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this session's consent dashboard." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
          className="text-sm underline"
        >
          ← Back to session
        </Link>
      </div>
    );
  }

  if (dashboard === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? 'Could not load the consent dashboard.'} />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
          className="text-sm underline"
        >
          ← Back to session
        </Link>
      </div>
    );
  }

  const granted = dashboard.participants.filter(
    (p) => p.status === 'granted' || p.status === 'partially_granted',
  ).length;

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
        className="inline-block text-sm underline"
      >
        ← Back to session
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <h1 className="text-2xl font-semibold tracking-tight">Consent dashboard</h1>

      {dashboard.configuration === null ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            This session has no consent configuration yet.{' '}
            <Link
              href={`/workspaces/${workspaceId}/sessions/${sessionId}/consent-configuration`}
              className="underline"
            >
              Configure consent
            </Link>{' '}
            before capturing any participant's decisions.
          </p>
        </Card>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">
          {granted} of {dashboard.participants.length} participants have granted at least their
          required consent.
        </p>
      )}

      {dashboard.participants.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No participants in this session yet.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {dashboard.participants.map((participant) => (
            <li key={participant.participantId}>
              <Link
                href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants/${participant.participantId}/consent`}
                className="block"
              >
                <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:bg-[var(--color-accent-soft)]">
                  <div>
                    <p className="font-medium">{participant.displayName}</p>
                    {participant.updatedAt !== null && (
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        Last updated {new Date(participant.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={participant.status} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
