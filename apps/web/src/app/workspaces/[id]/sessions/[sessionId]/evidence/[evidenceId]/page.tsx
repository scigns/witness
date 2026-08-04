'use client';

/**
 * Evidence detail — full edit while a draft, submit, withdraw, related-
 * evidence links, and history (BUILD_ROADMAP.md Milestone 5).
 *
 * Every mutation sends the evidence's current `version` back as
 * `expectedVersion`, mirroring the session detail page — a `409
 * STALE_VERSION` response is handled as its own state (`staleUpdate`)
 * rather than folded into the generic error banner, because the fix is
 * different: reload, not retry.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import {
  EVIDENCE_LINK_TYPES,
  type EvidenceDetail,
  type EvidenceLinkView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, EvidenceReviewStatusBadge } from '@/components/ui';

const LINK_TYPE_LABELS: Record<(typeof EVIDENCE_LINK_TYPES)[number], string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  clarifies: 'Clarifies',
  duplicates: 'Duplicates',
  follows_from: 'Follows from',
  related_to: 'Related to',
};

export default function EvidenceDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string; evidenceId: string }>;
}) {
  const { id: workspaceId, sessionId, evidenceId } = use(params);
  const { user, ready } = useSession();

  const [evidence, setEvidence] = useState<EvidenceDetail | null>(null);
  const [links, setLinks] = useState<EvidenceLinkView[]>([]);
  const [history, setHistory] = useState<
    { id: string; action: string; occurredAt: string; metadata: Record<string, string> }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [staleUpdate, setStaleUpdate] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');

  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');

  const [linkType, setLinkType] = useState<(typeof EVIDENCE_LINK_TYPES)[number]>('related_to');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [evidenceResult, linksResult, historyResult] = await Promise.all([
          api.getEvidence(workspaceId, sessionId, evidenceId, user),
          api.listEvidenceLinks(workspaceId, sessionId, evidenceId, user),
          api.getEvidenceHistory(workspaceId, sessionId, evidenceId, user),
        ]);
        if (cancelledRef.current) return;
        setEvidence(evidenceResult);
        setEditTitle(evidenceResult.title);
        setEditContent(evidenceResult.content);
        setEditTags(evidenceResult.tags.join(', '));
        setLinks(linksResult.links);
        setHistory(historyResult.events);
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
    [workspaceId, sessionId, evidenceId, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const reload = () => {
    setStaleUpdate(false);
    setLoading(true);
    void load({ current: false });
  };

  const runMutation = async (operation: () => Promise<EvidenceDetail>) => {
    setBusy(true);
    setStaleUpdate(false);
    setError(null);
    try {
      const updated = await operation();
      setEvidence(updated);
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
    if (evidence === null) return;
    const ok = await runMutation(() =>
      api.updateEvidenceDraft(
        workspaceId,
        sessionId,
        evidenceId,
        {
          title: editTitle,
          content: editContent,
          tags: editTags
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag !== ''),
          expectedVersion: evidence.version,
        },
        user,
      ),
    );
    if (ok) setEditing(false);
  };

  const submit = async () => {
    if (evidence === null) return;
    await runMutation(() =>
      api.transitionEvidence(
        workspaceId,
        sessionId,
        evidenceId,
        { action: 'submit', expectedVersion: evidence.version },
        user,
      ),
    );
  };

  const confirmWithdraw = async () => {
    if (evidence === null) return;
    const ok = await runMutation(() =>
      api.transitionEvidence(
        workspaceId,
        sessionId,
        evidenceId,
        {
          action: 'withdraw',
          reason: withdrawReason.trim() === '' ? undefined : withdrawReason,
          expectedVersion: evidence.version,
        },
        user,
      ),
    );
    if (ok) {
      setWithdrawing(false);
      setWithdrawReason('');
    }
  };

  const createLink = async () => {
    if (linkTargetId.trim() === '') return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      const created = await api.createEvidenceLink(
        workspaceId,
        sessionId,
        evidenceId,
        {
          linkType,
          toEvidenceId: linkTargetId.trim(),
          note: linkNote.trim() === '' ? undefined : linkNote,
        },
        user,
      );
      setLinks((current) => [...current, created]);
      setLinkTargetId('');
      setLinkNote('');
    } catch (caught) {
      setLinkError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setLinkBusy(false);
    }
  };

  const removeLink = async (linkId: string) => {
    setLinkBusy(true);
    setLinkError(null);
    try {
      await api.removeEvidenceLink(workspaceId, sessionId, evidenceId, linkId, user);
      setLinks((current) => current.filter((link) => link.id !== linkId));
    } catch (caught) {
      setLinkError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setLinkBusy(false);
    }
  };

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this evidence." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence`}
          className="text-sm underline"
        >
          ← Back to evidence
        </Link>
      </div>
    );
  }

  if (evidence === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No evidence with id '${evidenceId}'.`} />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence`}
          className="text-sm underline"
        >
          ← Back to evidence
        </Link>
      </div>
    );
  }

  const canSubmit = evidence.permittedActions.includes('submit');
  const canWithdraw = evidence.permittedActions.includes('withdraw');

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence`}
        className="inline-block text-sm underline"
      >
        ← Back to evidence
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      {staleUpdate && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-600 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>This evidence was changed by someone else since you loaded it.</span>
          <Button variant="secondary" onClick={reload}>
            Reload
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{evidence.title}</h1>
            <EvidenceReviewStatusBadge status={evidence.reviewStatus} />
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {evidence.evidenceType.replace(/_/g, ' ')} ·{' '}
            {evidence.attributionMode.replace(/_/g, ' ')}
            {' · '}
            {new Date(evidence.capturedAt).toLocaleString()}
          </p>
        </div>
        {evidence.canEdit && (
          <Button variant="secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel edit' : 'Edit'}
          </Button>
        )}
      </div>

      {editing ? (
        <Card className="space-y-4">
          <div>
            <label htmlFor="editTitle" className="mb-1 block text-sm font-medium">
              Title
            </label>
            <input
              id="editTitle"
              maxLength={300}
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="editContent" className="mb-1 block text-sm font-medium">
              Content
            </label>
            <textarea
              id="editContent"
              rows={4}
              maxLength={20000}
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="editTags" className="mb-1 block text-sm font-medium">
              Tags (comma-separated)
            </label>
            <input
              id="editTags"
              value={editTags}
              onChange={(event) => setEditTags(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>
          <Button
            variant="primary"
            disabled={busy || editTitle.trim() === '' || editContent.trim() === ''}
            onClick={() => void saveEdit()}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap">{evidence.content}</p>
          {evidence.tags.length > 0 && (
            <p className="text-[var(--color-ink-muted)]">Tags: {evidence.tags.join(', ')}</p>
          )}
          {evidence.withdrawn && evidence.withdrawalReason !== undefined && (
            <p className="text-[var(--color-ink-muted)]">
              Withdrawn{evidence.withdrawalReason !== null ? `: ${evidence.withdrawalReason}` : ''}
            </p>
          )}
        </Card>
      )}

      {(canSubmit || canWithdraw) && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Lifecycle</h2>
          <div className="flex flex-wrap gap-2">
            {canSubmit && (
              <Button variant="primary" disabled={busy} onClick={() => void submit()}>
                Submit for review
              </Button>
            )}
            {canWithdraw && !withdrawing && (
              <Button variant="danger" disabled={busy} onClick={() => setWithdrawing(true)}>
                Withdraw
              </Button>
            )}
          </div>
          {withdrawing && (
            <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
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
                <Button variant="danger" disabled={busy} onClick={() => void confirmWithdraw()}>
                  Confirm withdrawal
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setWithdrawing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <section aria-labelledby="links-heading">
        <h2 id="links-heading" className="mb-3 text-lg font-semibold">
          Related evidence
        </h2>
        {linkError !== null && <ErrorNotice message={linkError} />}
        <Card className="space-y-4">
          {links.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">No related evidence linked yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {links.map((link) => {
                const otherId =
                  link.fromEvidenceId === evidenceId ? link.toEvidenceId : link.fromEvidenceId;
                const direction = link.fromEvidenceId === evidenceId ? '→' : '←';
                return (
                  <li key={link.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {LINK_TYPE_LABELS[link.linkType]} {direction}{' '}
                      <Link
                        href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence/${otherId}`}
                        className="underline"
                      >
                        {otherId}
                      </Link>
                      {link.note !== null && (
                        <span className="text-[var(--color-ink-muted)]"> — {link.note}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={linkBusy}
                      onClick={() => void removeLink(link.id)}
                      className="text-xs text-red-700 underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="linkType" className="mb-1 block text-sm font-medium">
                  Relationship
                </label>
                <select
                  id="linkType"
                  value={linkType}
                  onChange={(event) =>
                    setLinkType(event.target.value as (typeof EVIDENCE_LINK_TYPES)[number])
                  }
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  {EVIDENCE_LINK_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {LINK_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="linkTargetId" className="mb-1 block text-sm font-medium">
                  Related evidence id
                </label>
                <input
                  id="linkTargetId"
                  value={linkTargetId}
                  onChange={(event) => setLinkTargetId(event.target.value)}
                  placeholder="Paste the other evidence's id"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label htmlFor="linkNote" className="mb-1 block text-sm font-medium">
                Note (optional)
              </label>
              <input
                id="linkNote"
                value={linkNote}
                onChange={(event) => setLinkNote(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
            <Button
              variant="secondary"
              disabled={linkBusy || linkTargetId.trim() === ''}
              onClick={() => void createLink()}
            >
              {linkBusy ? 'Linking…' : 'Add link'}
            </Button>
          </div>
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
            <ol className="space-y-2 text-sm">
              {history.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{event.action}</span>
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
