'use client';

/**
 * Evidence detail — full edit while a draft, submit, withdraw, related-
 * evidence links, review lifecycle, clarifications, corrections, and
 * history (BUILD_ROADMAP.md Milestones 5 and 6).
 *
 * Every mutation sends the evidence's current `version` back as
 * `expectedVersion`, mirroring the session detail page — a `409
 * STALE_VERSION` response is handled as its own state (`staleUpdate`)
 * rather than folded into the generic error banner, because the fix is
 * different: reload, not retry.
 *
 * The review section reuses `evidence.permittedReviewActions` and
 * `evidence.canCorrect` — server-computed, so this page never reimplements
 * the review-lifecycle state machine or the "are you the assigned
 * reviewer" check; it only offers the actions the server already says are
 * possible, and a 403 from actually calling one is shown like any other
 * error. Nothing here ever displays a restricted participant identity: the
 * assignment and clarification views only ever carry a Witness user id (the
 * reviewer) and `ActorView`s (who asked, who answered), never a session
 * participant's identity.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import {
  EVIDENCE_CORRECTION_TYPES,
  EVIDENCE_LINK_TYPES,
  type ClarificationView,
  type EvidenceCorrectionType,
  type EvidenceDetail,
  type EvidenceLinkView,
  type ReviewAssignmentView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, EvidenceReviewStatusBadge } from '@/components/ui';

const CORRECTION_TYPE_LABELS: Record<EvidenceCorrectionType, string> = {
  clerical: 'Clerical (typo or formatting fix)',
  participant_clarification: "Incorporates the source's clarification",
  facilitator_interpretation: "Facilitator's interpretive gloss",
  substantive: 'Substantive change to what the evidence claims',
};

const LINK_TYPE_LABELS: Record<(typeof EVIDENCE_LINK_TYPES)[number], string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  clarifies: 'Clarifies',
  duplicates: 'Duplicates',
  follows_from: 'Follows from',
  related_to: 'Related to',
};

/** Who this page may offer as a reviewer: a member of the evidence's workspace. */
interface ReviewerOption {
  readonly id: string;
  readonly displayName: string;
}

/**
 * Membership states that still mean "part of this workspace". A suspended or
 * removed member must not appear in the picker — assigning to them would
 * create work nobody can do.
 */
const ELIGIBLE_REVIEWER_STATES = new Set(['invited', 'active']);

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

  const [assignment, setAssignment] = useState<ReviewAssignmentView | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationView[]>([]);
  const [users, setUsers] = useState<ReviewerOption[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [assigningReviewerId, setAssigningReviewerId] = useState('');
  const [reassigning, setReassigning] = useState(false);

  const [correcting, setCorrecting] = useState(false);
  const [correctionType, setCorrectionType] = useState<EvidenceCorrectionType>('clerical');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionTitle, setCorrectionTitle] = useState('');
  const [correctionContent, setCorrectionContent] = useState('');

  const [decisionReason, setDecisionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const [clarifying, setClarifying] = useState(false);
  const [clarificationQuestion, setClarificationQuestion] = useState('');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

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
        setCorrectionTitle(evidenceResult.title);
        setCorrectionContent(evidenceResult.content);
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
        return;
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }

      // Review data (assignment, clarifications, the reviewer picker) is
      // loaded separately and failures here never block the page above —
      // a caller without evidence_review:read still sees the evidence
      // itself, just not the review section.
      // Settled, not all: a caller who may read the assignment but not the
      // user list would otherwise lose the assignment too, and the card would
      // read "No reviewer assigned yet" for evidence that has one.
      const [assignmentResult, clarificationsResult, membersResult] = await Promise.allSettled([
        api.getReviewAssignment(workspaceId, sessionId, evidenceId, user),
        api.listClarifications(workspaceId, sessionId, evidenceId, user),
        // The workspace's members, not the whole user directory. A reviewer
        // from outside the workspace could not read the evidence they were
        // assigned, so offering one was never right — and `user:read` is an
        // administrative action a facilitator does not hold, which left the
        // picker empty for every real signed-in reviewer.
        api.listWorkspaceMemberships(workspaceId, user),
      ]);
      if (cancelledRef.current) return;
      if (assignmentResult.status === 'fulfilled') setAssignment(assignmentResult.value.assignment);
      if (clarificationsResult.status === 'fulfilled') {
        setClarifications(clarificationsResult.value.clarifications);
      }
      if (membersResult.status === 'fulfilled') {
        setUsers(
          membersResult.value.memberships
            .filter((membership) => ELIGIBLE_REVIEWER_STATES.has(membership.state))
            .map((membership) => ({
              id: membership.userId,
              displayName: membership.userDisplayName,
            })),
        );
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

  /**
   * Re-read the evidence after a review-adjacent write. Guarded: the mutation
   * has already succeeded server-side, so a failed refresh is a stale view,
   * not a failed action, and must not surface as an error or an unhandled
   * rejection.
   */
  const refreshEvidence = async () => {
    const refreshed = await api
      .getEvidence(workspaceId, sessionId, evidenceId, user)
      .catch(() => null);
    if (refreshed !== null) setEvidence(refreshed);
  };

  const runReviewMutation = async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    setReviewBusy(true);
    setReviewError(null);
    try {
      return await operation();
    } catch (caught) {
      setReviewError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      return null;
    } finally {
      setReviewBusy(false);
    }
  };

  const assignReviewer = async () => {
    if (assigningReviewerId === '') return;
    const created = await runReviewMutation(() =>
      api.assignReviewer(
        workspaceId,
        sessionId,
        evidenceId,
        { reviewerUserId: assigningReviewerId },
        user,
      ),
    );
    if (created !== null) {
      setAssignment(created);
      setAssigningReviewerId('');
      await refreshEvidence();
    }
  };

  const reassignReviewer = async () => {
    if (assignment === null || assigningReviewerId === '') return;
    const created = await runReviewMutation(() =>
      api.reassignReviewer(
        workspaceId,
        sessionId,
        evidenceId,
        assignment.id,
        { reviewerUserId: assigningReviewerId },
        user,
      ),
    );
    if (created !== null) {
      setAssignment(created);
      setAssigningReviewerId('');
      setReassigning(false);
      await refreshEvidence();
    }
  };

  const doReviewAction = async (
    action: 'begin_review' | 'resume_review' | 'validate' | 'reject',
  ) => {
    if (evidence === null) return;
    const updated = await runReviewMutation(() => {
      if (action === 'validate') {
        return api.reviewAction(
          workspaceId,
          sessionId,
          evidenceId,
          {
            action,
            reason: decisionReason.trim() === '' ? undefined : decisionReason,
            expectedVersion: evidence.version,
          },
          user,
        );
      }
      if (action === 'reject') {
        return api.reviewAction(
          workspaceId,
          sessionId,
          evidenceId,
          { action, reason: decisionReason, expectedVersion: evidence.version },
          user,
        );
      }
      return api.reviewAction(
        workspaceId,
        sessionId,
        evidenceId,
        { action, expectedVersion: evidence.version },
        user,
      );
    });
    if (updated !== null) {
      setEvidence(updated);
      setDecisionReason('');
      setRejecting(false);
      const refreshedAssignment = await api
        .getReviewAssignment(workspaceId, sessionId, evidenceId, user)
        .catch(() => null);
      if (refreshedAssignment !== null) setAssignment(refreshedAssignment.assignment);
    }
  };

  const saveCorrection = async () => {
    if (evidence === null || correctionReason.trim() === '') return;
    const updated = await runReviewMutation(() =>
      api.correctEvidence(
        workspaceId,
        sessionId,
        evidenceId,
        {
          correctionType,
          reason: correctionReason,
          title: correctionTitle,
          content: correctionContent,
          expectedVersion: evidence.version,
        },
        user,
      ),
    );
    if (updated !== null) {
      setEvidence(updated);
      setCorrecting(false);
      setCorrectionReason('');
    }
  };

  const submitClarification = async () => {
    if (clarificationQuestion.trim() === '') return;
    const created = await runReviewMutation(() =>
      api.requestClarification(
        workspaceId,
        sessionId,
        evidenceId,
        { question: clarificationQuestion },
        user,
      ),
    );
    if (created !== null) {
      setClarifications((current) => [...current, created]);
      setClarificationQuestion('');
      setClarifying(false);
      await refreshEvidence();
    }
  };

  const submitResponse = async (clarificationId: string) => {
    if (responseText.trim() === '') return;
    const updated = await runReviewMutation(() =>
      api.respondToClarification(
        workspaceId,
        sessionId,
        evidenceId,
        clarificationId,
        { response: responseText },
        user,
      ),
    );
    if (updated !== null) {
      setClarifications((current) =>
        current.map((clarification) => (clarification.id === updated.id ? updated : clarification)),
      );
      setRespondingId(null);
      setResponseText('');
    }
  };

  const closeClarification = async (clarificationId: string) => {
    const updated = await runReviewMutation(() =>
      api.closeClarification(workspaceId, sessionId, evidenceId, clarificationId, user),
    );
    if (updated !== null) {
      setClarifications((current) =>
        current.map((clarification) => (clarification.id === updated.id ? updated : clarification)),
      );
      await refreshEvidence();
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

      <section aria-labelledby="review-heading" className="space-y-4">
        <h2 id="review-heading" className="text-lg font-semibold">
          Review
        </h2>
        {reviewError !== null && <ErrorNotice message={reviewError} />}

        <Card className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Reviewer assignment
          </h3>
          {assignment !== null ? (
            <div className="space-y-2 text-sm">
              <p>
                Assigned to{' '}
                <span className="font-medium">
                  {users.find((candidate) => candidate.id === assignment.reviewerUserId)
                    ?.displayName ?? assignment.reviewerUserId}
                </span>{' '}
                — status: {assignment.status.replace(/_/g, ' ')}
              </p>
              {!reassigning ? (
                <Button
                  variant="secondary"
                  disabled={reviewBusy}
                  onClick={() => setReassigning(true)}
                >
                  Reassign
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="New reviewer"
                    value={assigningReviewerId}
                    onChange={(event) => setAssigningReviewerId(event.target.value)}
                    className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm"
                  >
                    <option value="">Choose a reviewer…</option>
                    {users.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.displayName}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="primary"
                    disabled={reviewBusy || assigningReviewerId === ''}
                    onClick={() => void reassignReviewer()}
                  >
                    Confirm reassignment
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={reviewBusy}
                    onClick={() => setReassigning(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[var(--color-ink-muted)]">No reviewer assigned yet.</span>
              <select
                aria-label="Assign reviewer"
                value={assigningReviewerId}
                onChange={(event) => setAssigningReviewerId(event.target.value)}
                className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm"
              >
                <option value="">Choose a reviewer…</option>
                {users.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={reviewBusy || assigningReviewerId === ''}
                onClick={() => void assignReviewer()}
              >
                Assign
              </Button>
            </div>
          )}
        </Card>

        {evidence.permittedReviewActions.length > 0 && (
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Review decision
            </h3>
            <div className="flex flex-wrap gap-2">
              {evidence.permittedReviewActions.includes('begin_review') && (
                <Button
                  variant="primary"
                  disabled={reviewBusy}
                  onClick={() => void doReviewAction('begin_review')}
                >
                  Begin review
                </Button>
              )}
              {evidence.permittedReviewActions.includes('resume_review') && (
                <Button
                  variant="primary"
                  disabled={reviewBusy}
                  onClick={() => void doReviewAction('resume_review')}
                >
                  Resume review
                </Button>
              )}
              {evidence.permittedReviewActions.includes('validate') && (
                <Button
                  variant="primary"
                  disabled={reviewBusy}
                  onClick={() => void doReviewAction('validate')}
                >
                  Validate
                </Button>
              )}
              {evidence.permittedReviewActions.includes('reject') && !rejecting && (
                <Button variant="danger" disabled={reviewBusy} onClick={() => setRejecting(true)}>
                  Reject
                </Button>
              )}
            </div>
            {evidence.permittedReviewActions.includes('validate') && !rejecting && (
              <div>
                <label htmlFor="decisionReason" className="mb-1 block text-sm font-medium">
                  Reason (optional for validation)
                </label>
                <input
                  id="decisionReason"
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
            )}
            {rejecting && (
              <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
                <label htmlFor="rejectReason" className="mb-1 block text-sm font-medium">
                  Rejection reason <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="rejectReason"
                  required
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    disabled={reviewBusy || decisionReason.trim() === ''}
                    onClick={() => void doReviewAction('reject')}
                  >
                    Confirm rejection
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={reviewBusy}
                    onClick={() => setRejecting(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {evidence.reviewDecisionReason !== null && (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Last decision reason: {evidence.reviewDecisionReason}
              </p>
            )}
          </Card>
        )}

        {evidence.canCorrect && (
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Correction
              </h3>
              {!correcting && (
                <Button
                  variant="secondary"
                  disabled={reviewBusy}
                  onClick={() => setCorrecting(true)}
                >
                  Correct
                </Button>
              )}
            </div>
            {correcting && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="correctionType" className="mb-1 block text-sm font-medium">
                    Correction type
                  </label>
                  <select
                    id="correctionType"
                    value={correctionType}
                    onChange={(event) =>
                      setCorrectionType(event.target.value as EvidenceCorrectionType)
                    }
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  >
                    {EVIDENCE_CORRECTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CORRECTION_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="correctionTitle" className="mb-1 block text-sm font-medium">
                    Title
                  </label>
                  <input
                    id="correctionTitle"
                    maxLength={300}
                    value={correctionTitle}
                    onChange={(event) => setCorrectionTitle(event.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="correctionContent" className="mb-1 block text-sm font-medium">
                    Content
                  </label>
                  <textarea
                    id="correctionContent"
                    rows={4}
                    maxLength={20000}
                    value={correctionContent}
                    onChange={(event) => setCorrectionContent(event.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="correctionReason" className="mb-1 block text-sm font-medium">
                    Reason <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </label>
                  <input
                    id="correctionReason"
                    required
                    value={correctionReason}
                    onChange={(event) => setCorrectionReason(event.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    disabled={reviewBusy || correctionReason.trim() === ''}
                    onClick={() => void saveCorrection()}
                  >
                    {reviewBusy ? 'Saving…' : 'Save correction'}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={reviewBusy}
                    onClick={() => setCorrecting(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Clarifications
            </h3>
            {evidence.permittedReviewActions.length > 0 && !clarifying && (
              <Button variant="secondary" disabled={reviewBusy} onClick={() => setClarifying(true)}>
                Ask a question
              </Button>
            )}
          </div>

          {clarifying && (
            <div className="space-y-3 border-b border-[var(--color-line)] pb-4">
              <label htmlFor="clarificationQuestion" className="mb-1 block text-sm font-medium">
                Question <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <textarea
                id="clarificationQuestion"
                required
                rows={2}
                maxLength={2000}
                value={clarificationQuestion}
                onChange={(event) => setClarificationQuestion(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  disabled={reviewBusy || clarificationQuestion.trim() === ''}
                  onClick={() => void submitClarification()}
                >
                  Send
                </Button>
                <Button
                  variant="secondary"
                  disabled={reviewBusy}
                  onClick={() => setClarifying(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {clarifications.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">No clarifications yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {clarifications.map((clarification) => (
                <li
                  key={clarification.id}
                  className="space-y-2 border-b border-[var(--color-line)] pb-3 last:border-none last:pb-0"
                >
                  <p>
                    <span className="font-medium">{clarification.requestedBy.displayName}</span>{' '}
                    asked: {clarification.question}
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Status: {clarification.status.replace(/_/g, ' ')}
                  </p>
                  {clarification.response !== null && (
                    <p>
                      <span className="font-medium">{clarification.respondedBy?.displayName}</span>{' '}
                      answered: {clarification.response}
                    </p>
                  )}
                  {clarification.status === 'open' && respondingId !== clarification.id && (
                    <Button
                      variant="secondary"
                      disabled={reviewBusy}
                      onClick={() => setRespondingId(clarification.id)}
                    >
                      Respond
                    </Button>
                  )}
                  {respondingId === clarification.id && (
                    <div className="space-y-2">
                      <label
                        htmlFor={`response-${clarification.id}`}
                        className="mb-1 block text-sm font-medium"
                      >
                        Response <span aria-hidden="true">*</span>
                        <span className="sr-only">(required)</span>
                      </label>
                      <textarea
                        id={`response-${clarification.id}`}
                        required
                        rows={2}
                        maxLength={4000}
                        value={responseText}
                        onChange={(event) => setResponseText(event.target.value)}
                        className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          disabled={reviewBusy || responseText.trim() === ''}
                          onClick={() => void submitResponse(clarification.id)}
                        >
                          Send response
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={reviewBusy}
                          onClick={() => setRespondingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  {clarification.status === 'answered' && (
                    <Button
                      variant="primary"
                      disabled={reviewBusy}
                      onClick={() => void closeClarification(clarification.id)}
                    >
                      Close and resume review
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

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
