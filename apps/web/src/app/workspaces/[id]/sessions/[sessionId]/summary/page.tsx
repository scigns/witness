'use client';

/**
 * Session summary — one AI-drafted summary per session, generated locally
 * from confirmed, consented evidence and transcripts. Same
 * generate/edit/confirm shape as the evidence transcript UI
 * (`.../evidence/[evidenceId]/page.tsx`) — see that page for the reasoning
 * behind polling a background job and gating edits once confirmed.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { SessionSummaryView } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

export default function SessionSummaryPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummaryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const session = await api.getSession(workspaceId, sessionId, user);
        if (cancelledRef.current) return;
        setSessionTitle(session.title);

        try {
          const found = await api.getSummary(workspaceId, sessionId, user);
          if (cancelledRef.current) return;
          setSummary(found);
        } catch (caught) {
          if (cancelledRef.current) return;
          if (!(caught instanceof ApiError && caught.status === 404)) {
            throw caught;
          }
          setSummary(null);
        }

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

  // Generation runs as a background job on the server — poll while it is in
  // flight, and stop as soon as it lands on a terminal status.
  useEffect(() => {
    if (summary === null) return;
    if (summary.status !== 'pending' && summary.status !== 'processing') return;

    const interval = setInterval(() => {
      api
        .getSummary(workspaceId, sessionId, user)
        .then(setSummary)
        .catch(() => {
          // A transient poll failure is not worth surfacing — the next tick retries.
        });
    }, 3000);

    return () => clearInterval(interval);
  }, [summary, workspaceId, sessionId, user]);

  const requestSummary = async () => {
    setBusy(true);
    setError(null);
    try {
      setSummary(await api.requestSummary(workspaceId, sessionId, user));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      setSummary(await api.retrySummary(workspaceId, sessionId, user));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (summary === null || editText.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.editSummary(
        workspaceId,
        sessionId,
        { editedText: editText, expectedVersion: summary.version },
        user,
      );
      setSummary(updated);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (summary === null) return;
    setBusy(true);
    setError(null);
    try {
      setSummary(
        await api.confirmSummary(
          workspaceId,
          sessionId,
          { expectedVersion: summary.version },
          user,
        ),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
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

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
        className="inline-block text-sm underline"
      >
        ← Back to session
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">
        Summary{sessionTitle !== null ? ` — ${sessionTitle}` : ''}
      </h1>

      {error !== null && <ErrorNotice message={error} />}

      <Card className="space-y-3">
        {summary === null ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-ink-muted)]">
              No summary yet. Generated locally on this deployment from this session's submitted
              evidence and confirmed transcripts — nothing leaves it. Any participant who withheld
              AI-processing consent is left out.
            </p>
            <Button variant="primary" disabled={busy} onClick={() => void requestSummary()}>
              {busy ? 'Requesting…' : 'Generate summary'}
            </Button>
          </div>
        ) : summary.status === 'pending' || summary.status === 'processing' ? (
          <p className="text-sm text-[var(--color-ink-muted)]" role="status">
            {summary.status === 'pending' ? 'Queued…' : 'Generating…'} This can take a minute or two
            on a laptop CPU.
          </p>
        ) : summary.status === 'failed' ? (
          <div className="space-y-2 text-sm">
            <p className="text-red-700 dark:text-red-400">
              Summary generation failed: {summary.failureReason}
            </p>
            <Button variant="secondary" disabled={busy} onClick={() => void retry()}>
              {busy ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-ink-muted)]">
                AI-generated by {summary.model} from {summary.sourceEvidenceIds.length} piece
                {summary.sourceEvidenceIds.length === 1 ? '' : 's'} of evidence
              </span>
              {summary.confirmed && (
                <span className="inline-flex items-center rounded-full border border-current px-2 py-0.5 text-xs font-medium">
                  Confirmed
                </span>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                <label htmlFor="summaryEditText" className="sr-only">
                  Summary text
                </label>
                <textarea
                  id="summaryEditText"
                  rows={6}
                  maxLength={50000}
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    disabled={busy || editText.trim() === ''}
                    onClick={() => void saveEdit()}
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{summary.effectiveText}</p>
                {summary.editedText !== null && (
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Human-edited. The original AI draft is preserved in this session's history.
                  </p>
                )}
                {!summary.confirmed && (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditText(summary.effectiveText ?? '');
                        setEditing(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="primary" disabled={busy} onClick={() => void confirm()}>
                      Confirm
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2 text-xs text-[var(--color-ink-muted)]">
                  Sources:{' '}
                  {summary.sourceEvidenceIds.map((evidenceId, index) => (
                    <span key={evidenceId}>
                      {index > 0 && ', '}
                      <Link
                        href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence/${evidenceId}`}
                        className="underline"
                      >
                        {evidenceId.slice(0, 8)}
                      </Link>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
