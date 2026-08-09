'use client';

/**
 * One outcome — a decision, a commitment or an action (BUILD_ROADMAP.md
 * Milestone 7).
 *
 * One page for all three registers rather than three near-identical ones:
 * they differ in their lifecycle vocabulary and in a couple of fields, not
 * in what a reader does with them. The lifecycle buttons come from the
 * server's `permittedActions`, so the client never reimplements the state
 * machine and never offers a transition the API would refuse.
 *
 * The basis panel is the point of the screen. Evidence offered for linking
 * is filtered to `validated` — the API refuses anything else by name, but a
 * picker that lists rejected evidence and then fails on submit teaches
 * people that the rule is arbitrary rather than that it is meaningful.
 * Institutional synthesis sits alongside it with a required rationale,
 * because "we judged this ourselves" is a legitimate basis and an unstated
 * one is not.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  ActionItemDetail,
  ActionItemTransitionRequest,
  CommitmentDetail,
  CommitmentTransitionRequest,
  DecisionDetail,
  DecisionTransitionRequest,
  EvidenceSummary,
  OutcomeSupportView,
} from '@witness/contracts';

import { api, ApiError, type OutcomeRegister } from '@/lib/api';
import { useSession } from '@/lib/session';
import {
  ActionItemStatusBadge,
  Button,
  Card,
  CommitmentStatusBadge,
  DecisionStatusBadge,
  ErrorNotice,
  OverdueBadge,
  SupportCountBadge,
} from '@/components/ui';

const REGISTERS: ReadonlySet<string> = new Set(['decisions', 'commitments', 'actions']);

type AnyDetail = DecisionDetail | CommitmentDetail | ActionItemDetail;

/** Actions that need a reason before the API will accept them. */
const REASON_REQUIRED: ReadonlySet<string> = new Set(['reverse', 'withdraw', 'block', 'cancel']);

/** Actions that take an optional note. */
const NOTE_OPTIONAL: ReadonlySet<string> = new Set(['fulfil', 'complete']);

const ACTION_LABELS: Record<string, string> = {
  confirm: 'Confirm',
  supersede: 'Supersede',
  reverse: 'Reverse',
  activate: 'Activate',
  fulfil: 'Mark fulfilled',
  withdraw: 'Withdraw',
  start: 'Start',
  record_progress: 'Record progress',
  block: 'Mark blocked',
  unblock: 'Unblock',
  complete: 'Mark complete',
  cancel: 'Cancel',
};

function formatDate(value: string | null): string {
  return value === null ? '—' : new Date(value).toLocaleDateString();
}

export default function OutcomeDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string; register: string; outcomeId: string }>;
}) {
  const { id: workspaceId, sessionId, register, outcomeId } = use(params);
  const { user, ready } = useSession();

  const [detail, setDetail] = useState<AnyDetail | null>(null);
  const [evidence, setEvidence] = useState<EvidenceSummary[]>([]);
  const [history, setHistory] = useState<
    { id: string; action: string; occurredAt: string; metadata: Record<string, string> }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [percentComplete, setPercentComplete] = useState('');

  const [supportBasis, setSupportBasis] = useState<
    'validated_evidence' | 'institutional_synthesis'
  >('validated_evidence');
  const [supportEvidenceId, setSupportEvidenceId] = useState('');
  const [supportRationale, setSupportRationale] = useState('');
  const [supportError, setSupportError] = useState<string | null>(null);

  const isValidRegister = REGISTERS.has(register);
  const outcomeRegister = register as OutcomeRegister;

  const fetchDetail = useCallback(async (): Promise<AnyDetail> => {
    if (outcomeRegister === 'decisions') {
      return api.getDecision(workspaceId, sessionId, outcomeId, user);
    }
    if (outcomeRegister === 'commitments') {
      return api.getCommitment(workspaceId, sessionId, outcomeId, user);
    }
    return api.getActionItem(workspaceId, sessionId, outcomeId, user);
  }, [outcomeRegister, workspaceId, sessionId, outcomeId, user]);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      // Applied independently — the outcome itself must still render when the
      // caller cannot read the session's evidence or its audit history.
      const [detailResult, evidenceResult, historyResult] = await Promise.allSettled([
        fetchDetail(),
        api.listEvidence(workspaceId, sessionId, user, { reviewStatus: 'validated' }),
        outcomeRegister === 'decisions'
          ? api.getDecisionHistory(workspaceId, sessionId, outcomeId, user)
          : outcomeRegister === 'commitments'
            ? api.getCommitmentHistory(workspaceId, sessionId, outcomeId, user)
            : api.getActionItemHistory(workspaceId, sessionId, outcomeId, user),
      ]);
      if (cancelledRef.current) return;

      if (evidenceResult.status === 'fulfilled') setEvidence(evidenceResult.value.evidence);
      if (historyResult.status === 'fulfilled') setHistory(historyResult.value.events);

      if (detailResult.status === 'fulfilled') {
        setDetail(detailResult.value);
        setError(null);
        setForbidden(false);
      } else {
        const caught: unknown = detailResult.reason;
        if (caught instanceof ApiError && caught.status === 403) {
          setForbidden(true);
        } else {
          setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        }
      }
      setLoading(false);
    },
    [fetchDetail, workspaceId, sessionId, outcomeId, outcomeRegister, user],
  );

  useEffect(() => {
    if (!ready || !isValidRegister) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, isValidRegister, load]);

  /**
   * Reload after any write. Guarded so a failed refetch surfaces as an error
   * rather than an unhandled rejection and a silently stale screen.
   */
  const refresh = useCallback(async () => {
    try {
      const cancelledRef = { current: false };
      await load(cancelledRef);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reload this outcome.');
    }
  }, [load]);

  if (!isValidRegister) {
    return <ErrorNotice message={`Unknown outcome register '${register}'.`} />;
  }

  const runAction = async (action: string) => {
    if (detail === null) return;
    setBusy(true);
    setActionError(null);
    try {
      if (outcomeRegister === 'decisions') {
        const body = ((): DecisionTransitionRequest => {
          if (action === 'supersede') {
            return {
              action: 'supersede',
              supersededByDecisionId: replacementId.trim(),
              ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
              expectedVersion: detail.version,
            };
          }
          if (action === 'reverse') {
            return { action: 'reverse', reason: reason.trim(), expectedVersion: detail.version };
          }
          return { action: 'confirm', expectedVersion: detail.version };
        })();
        await api.transitionDecision(workspaceId, sessionId, outcomeId, body, user);
      } else if (outcomeRegister === 'commitments') {
        const body = ((): CommitmentTransitionRequest => {
          if (action === 'supersede') {
            return {
              action: 'supersede',
              supersededByCommitmentId: replacementId.trim(),
              ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
              expectedVersion: detail.version,
            };
          }
          if (action === 'withdraw') {
            return { action: 'withdraw', reason: reason.trim(), expectedVersion: detail.version };
          }
          if (action === 'fulfil') {
            return {
              action: 'fulfil',
              ...(reason.trim() === '' ? {} : { note: reason.trim() }),
              expectedVersion: detail.version,
            };
          }
          return { action: 'activate', expectedVersion: detail.version };
        })();
        await api.transitionCommitment(workspaceId, sessionId, outcomeId, body, user);
      } else {
        const body = ((): ActionItemTransitionRequest => {
          if (action === 'record_progress') {
            const percent = Number.parseInt(percentComplete, 10);
            return {
              action: 'record_progress',
              ...(Number.isNaN(percent) ? {} : { percentComplete: percent }),
              ...(reason.trim() === '' ? {} : { note: reason.trim() }),
              expectedVersion: detail.version,
            };
          }
          if (action === 'block') {
            return { action: 'block', reason: reason.trim(), expectedVersion: detail.version };
          }
          if (action === 'cancel') {
            return { action: 'cancel', reason: reason.trim(), expectedVersion: detail.version };
          }
          if (action === 'complete') {
            return {
              action: 'complete',
              ...(reason.trim() === '' ? {} : { note: reason.trim() }),
              expectedVersion: detail.version,
            };
          }
          if (action === 'unblock') {
            return { action: 'unblock', expectedVersion: detail.version };
          }
          return { action: 'start', expectedVersion: detail.version };
        })();
        await api.transitionActionItem(workspaceId, sessionId, outcomeId, body, user);
      }

      setPendingAction(null);
      setReason('');
      setReplacementId('');
      setPercentComplete('');
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const addSupport = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setSupportError(null);
    try {
      await api.recordOutcomeSupport(
        workspaceId,
        sessionId,
        outcomeRegister,
        outcomeId,
        supportBasis === 'validated_evidence'
          ? { basis: 'validated_evidence', evidenceId: supportEvidenceId }
          : { basis: 'institutional_synthesis', rationale: supportRationale.trim() },
        user,
      );
      setSupportEvidenceId('');
      setSupportRationale('');
      await refresh();
    } catch (caught) {
      setSupportError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const removeSupport = async (supportId: string) => {
    setBusy(true);
    setSupportError(null);
    try {
      await api.removeOutcomeSupport(
        workspaceId,
        sessionId,
        outcomeRegister,
        outcomeId,
        supportId,
        user,
      );
      await refresh();
    } catch (caught) {
      setSupportError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this outcome." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes`}
          className="text-sm underline"
        >
          ← Back to outcomes
        </Link>
      </div>
    );
  }

  if (detail === null) {
    return <ErrorNotice message={error ?? 'This outcome could not be loaded.'} />;
  }

  /**
   * The asterisk and the control have to agree. Every action the server will
   * reject for a missing reason, a missing replacement, or an empty progress
   * update is held here rather than sent and bounced.
   */
  const canSubmitPending =
    pendingAction === null
      ? false
      : pendingAction === 'supersede'
        ? replacementId.trim() !== ''
        : REASON_REQUIRED.has(pendingAction)
          ? reason.trim() !== ''
          : pendingAction === 'record_progress'
            ? percentComplete.trim() !== '' || reason.trim() !== ''
            : true;

  /**
   * The server refuses to detach the last basis from an outcome that is
   * already authoritative. The client can tell without another round trip: an
   * outcome that can no longer be confirmed or activated already has been, and
   * one basis is all that is left.
   */
  const permitted: readonly string[] = detail.permittedActions;
  const isAuthoritative = !permitted.includes('confirm') && !permitted.includes('activate');
  const lastBasisIsLoadBearing = isAuthoritative && detail.supports.length === 1;

  const isDecision = 'statement' in detail;
  const isCommitment = 'fulfilmentNote' in detail;
  const isAction = 'percentComplete' in detail;

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes`}
        className="inline-block text-sm underline"
      >
        ← Back to outcomes
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {isDecision
              ? 'Decision'
              : isCommitment
                ? `Commitment — ${(detail as CommitmentDetail).ownerDescription}`
                : `Action — ${(detail as ActionItemDetail).ownerDescription}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(isCommitment || isAction) &&
            (detail as CommitmentDetail | ActionItemDetail).overdue && <OverdueBadge />}
          <SupportCountBadge count={detail.supports.length} />
          {isDecision && <DecisionStatusBadge status={(detail as DecisionDetail).status} />}
          {isCommitment && <CommitmentStatusBadge status={(detail as CommitmentDetail).status} />}
          {isAction && <ActionItemStatusBadge status={(detail as ActionItemDetail).status} />}
        </div>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{isDecision ? 'What was decided' : 'Detail'}</h2>
        <p className="whitespace-pre-wrap">
          {isDecision
            ? (detail as DecisionDetail).statement
            : (detail as CommitmentDetail | ActionItemDetail).description}
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {isDecision && (
            <>
              <div>
                <dt className="text-[var(--color-ink-muted)]">Proposed by</dt>
                <dd>{(detail as DecisionDetail).proposedBy.displayName || '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-muted)]">Confirmed</dt>
                <dd>{formatDate((detail as DecisionDetail).confirmedAt)}</dd>
              </div>
              {(detail as DecisionDetail).closeReason !== null && (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--color-ink-muted)]">Reason given on closing</dt>
                  <dd>{(detail as DecisionDetail).closeReason}</dd>
                </div>
              )}
            </>
          )}
          {isCommitment && (
            <>
              <div>
                <dt className="text-[var(--color-ink-muted)]">Due</dt>
                <dd>{formatDate((detail as CommitmentDetail).dueDate)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-muted)]">Fulfilled</dt>
                <dd>{formatDate((detail as CommitmentDetail).fulfilledAt)}</dd>
              </div>
              {(detail as CommitmentDetail).fulfilmentNote !== null && (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--color-ink-muted)]">How it was met</dt>
                  <dd>{(detail as CommitmentDetail).fulfilmentNote}</dd>
                </div>
              )}
            </>
          )}
          {isAction && (
            <>
              <div>
                <dt className="text-[var(--color-ink-muted)]">Priority</dt>
                <dd>{(detail as ActionItemDetail).priority}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-muted)]">Due</dt>
                <dd>{formatDate((detail as ActionItemDetail).dueDate)}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-ink-muted)]">Progress</dt>
                <dd>{(detail as ActionItemDetail).percentComplete}%</dd>
              </div>
              {(detail as ActionItemDetail).blockedReason !== null && (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--color-ink-muted)]">Blocked because</dt>
                  <dd>{(detail as ActionItemDetail).blockedReason}</dd>
                </div>
              )}
              {(detail as ActionItemDetail).progressNote !== null && (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--color-ink-muted)]">Latest progress note</dt>
                  <dd>{(detail as ActionItemDetail).progressNote}</dd>
                </div>
              )}
            </>
          )}
        </dl>
      </Card>

      {detail.permittedActions.length > 0 && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Move this on</h2>
          {actionError !== null && <ErrorNotice message={actionError} />}
          <div className="flex flex-wrap gap-2">
            {detail.permittedActions.map((action) => (
              <Button
                key={action}
                variant={pendingAction === action ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setReason('');
                  setReplacementId('');
                  setPercentComplete('');
                  const needsInput =
                    REASON_REQUIRED.has(action) ||
                    NOTE_OPTIONAL.has(action) ||
                    action === 'supersede' ||
                    action === 'record_progress';
                  if (needsInput) {
                    setPendingAction(pendingAction === action ? null : action);
                  } else {
                    void runAction(action);
                  }
                }}
              >
                {ACTION_LABELS[action] ?? action}
              </Button>
            ))}
          </div>

          {pendingAction !== null && (
            <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
              {pendingAction === 'supersede' && (
                <div>
                  <label htmlFor="replacementId" className="mb-1 block text-sm font-medium">
                    Replaced by <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </label>
                  <input
                    id="replacementId"
                    value={replacementId}
                    onChange={(event) => setReplacementId(event.target.value)}
                    placeholder="Identifier of the outcome that replaces this one"
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Superseding requires naming the replacement — otherwise this outcome simply
                    disappears from the record.
                  </p>
                </div>
              )}

              {pendingAction === 'record_progress' && (
                <div>
                  <label htmlFor="percentComplete" className="mb-1 block text-sm font-medium">
                    Percent complete
                  </label>
                  <input
                    id="percentComplete"
                    type="number"
                    min={0}
                    max={100}
                    value={percentComplete}
                    onChange={(event) => setPercentComplete(event.target.value)}
                    className="w-32 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
              )}

              <div>
                <label htmlFor="reason" className="mb-1 block text-sm font-medium">
                  {REASON_REQUIRED.has(pendingAction) ? (
                    <>
                      Reason <span aria-hidden="true">*</span>
                      <span className="sr-only">(required)</span>
                    </>
                  ) : (
                    'Note'
                  )}
                </label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>

              <Button
                disabled={busy || !canSubmitPending}
                onClick={() => void runAction(pendingAction)}
              >
                {busy ? 'Saving…' : `Confirm ${ACTION_LABELS[pendingAction] ?? pendingAction}`}
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">What this rests on</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {isAction
              ? 'An action carries out a decision rather than making a claim of its own, so it does not require a basis — but recording one is useful where it exists.'
              : 'This must rest on validated evidence, or on a stated institutional synthesis, before it can be made authoritative.'}
          </p>
        </div>

        {supportError !== null && <ErrorNotice message={supportError} />}

        {detail.supports.length === 0 ? (
          <p className="text-[var(--color-ink-muted)]">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {detail.supports.map((support) => (
              <li
                key={support.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded border border-[var(--color-line)] p-3"
              >
                <SupportEntry support={support} />
                <div className="text-right">
                  <Button
                    variant="secondary"
                    disabled={busy || lastBasisIsLoadBearing}
                    onClick={() => {
                      // A permanent delete of an audited record, so it asks.
                      if (
                        window.confirm(
                          'Remove this basis? The outcome will no longer cite it, and the record is deleted.',
                        )
                      ) {
                        void removeSupport(support.id);
                      }
                    }}
                  >
                    Remove
                  </Button>
                  {lastBasisIsLoadBearing && (
                    <p className="mt-1 max-w-[15rem] text-xs text-[var(--color-ink-muted)]">
                      This is the only basis behind an outcome that is already authoritative. Record
                      another first, or reverse the outcome.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => void addSupport(event)}
          className="space-y-3 border-t border-[var(--color-line)] pt-4"
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Add a basis</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="basis"
                  value="validated_evidence"
                  checked={supportBasis === 'validated_evidence'}
                  onChange={() => setSupportBasis('validated_evidence')}
                />
                Validated evidence
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="basis"
                  value="institutional_synthesis"
                  checked={supportBasis === 'institutional_synthesis'}
                  onChange={() => setSupportBasis('institutional_synthesis')}
                />
                Institutional synthesis
              </label>
            </div>
          </fieldset>

          {supportBasis === 'validated_evidence' ? (
            <div>
              <label htmlFor="supportEvidenceId" className="mb-1 block text-sm font-medium">
                Evidence <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="supportEvidenceId"
                value={supportEvidenceId}
                onChange={(event) => setSupportEvidenceId(event.target.value)}
                required
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                <option value="">Choose validated evidence…</option>
                {evidence.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              {evidence.length === 0 && (
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  No validated evidence in this session yet. Evidence has to be reviewed and
                  validated before an outcome can rest on it.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor="supportRationale" className="mb-1 block text-sm font-medium">
                Rationale <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <textarea
                id="supportRationale"
                value={supportRationale}
                onChange={(event) => setSupportRationale(event.target.value)}
                required
                rows={3}
                maxLength={4000}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Say what the institution judged and why. An outcome with neither evidence nor stated
                reasoning is indistinguishable from one somebody made up.
              </p>
            </div>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Record basis'}
          </Button>
        </form>
      </Card>

      {history.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">History</h2>
          <ol className="space-y-2 text-sm">
            {history.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-2">
                <span className="text-[var(--color-ink-muted)]">
                  {new Date(event.occurredAt).toLocaleString()}
                </span>
                <span>{event.action.replace(/[._]/g, ' ')}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

/**
 * The frozen evidence facts are shown, not the evidence's current ones — the
 * version recorded here is what the outcome was actually justified by, even
 * if the evidence has since been corrected.
 */
function SupportEntry({ support }: { support: OutcomeSupportView }) {
  if (support.basis === 'institutional_synthesis') {
    return (
      <div>
        <p className="text-sm font-medium">Institutional synthesis</p>
        <p className="mt-1 text-sm">{support.rationale}</p>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Recorded by {support.recordedBy.displayName || 'an unnamed actor'} on{' '}
          {new Date(support.recordedAt).toLocaleDateString()}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium">
        Validated evidence{support.evidenceTitle !== undefined ? ` — ${support.evidenceTitle}` : ''}
      </p>
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
        Version {support.evidenceVersion} as validated, {support.evidenceVerificationStatus} at the
        time it was linked
      </p>
      {support.note !== null && <p className="mt-1 text-sm">{support.note}</p>}
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
        Recorded by {support.recordedBy.displayName || 'an unnamed actor'} on{' '}
        {new Date(support.recordedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
