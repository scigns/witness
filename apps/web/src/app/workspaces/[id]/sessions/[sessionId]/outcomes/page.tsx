'use client';

/**
 * Session outcomes (BUILD_ROADMAP.md Milestone 7, Decisions, Commitments and
 * Actions) — the three registers a session produces, on one screen.
 *
 * They are together rather than on three pages because they are read
 * together: "what did we decide, who undertook what, and what is actually
 * being done about it" is one question. Each register lists its own outcomes
 * with the state and the number of bases behind them; the detail page is
 * where an outcome is edited, moved through its lifecycle, and given its
 * basis.
 *
 * The support count is shown on every row, including zero. That is
 * deliberate: an outcome resting on nothing is exactly what a reader
 * scanning a register needs to notice, and hiding it until you open the
 * outcome would be the wrong way round.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ACTION_ITEM_PRIORITIES,
  type ActionItemPriority,
  type ActionItemSummary,
  type CoDesignSessionDetail,
  type CommitmentSummary,
  type DecisionSummary,
  type OutcomeCandidateView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
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

type Register = 'decisions' | 'commitments' | 'actions';

const REGISTER_LABELS: Record<Register, string> = {
  decisions: 'Decisions',
  commitments: 'Commitments',
  actions: 'Actions',
};

function formatDate(value: string | null): string {
  if (value === null) return '—';
  return new Date(value).toLocaleDateString();
}

export default function SessionOutcomesPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [session, setSession] = useState<CoDesignSessionDetail | null>(null);
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [commitments, setCommitments] = useState<CommitmentSummary[]>([]);
  const [actions, setActions] = useState<ActionItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [tab, setTab] = useState<Register>('decisions');

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<OutcomeCandidateView[]>([]);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [candidatesJobId, setCandidatesJobId] = useState<string | null>(null);
  const [candidatesBusy, setCandidatesBusy] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ownerDescription, setOwnerDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<ActionItemPriority>('medium');

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      // Applied independently: one register a caller cannot read must not
      // blank the other two.
      const [sessionResult, decisionResult, commitmentResult, actionResult] =
        await Promise.allSettled([
          api.getSession(workspaceId, sessionId, user),
          api.listDecisions(workspaceId, sessionId, user),
          api.listCommitments(workspaceId, sessionId, user),
          api.listActionItems(workspaceId, sessionId, user),
        ]);
      if (cancelledRef.current) return;

      if (sessionResult.status === 'fulfilled') setSession(sessionResult.value);
      if (decisionResult.status === 'fulfilled') setDecisions(decisionResult.value.decisions);
      if (commitmentResult.status === 'fulfilled') {
        setCommitments(commitmentResult.value.commitments);
      }
      if (actionResult.status === 'fulfilled') setActions(actionResult.value.actions);

      // Only a denial of *every* register means the caller cannot read
      // outcomes at all; anything narrower keeps the page, so the registers
      // that did load still render. Collapsing these into one flag would
      // either replace a working page over a partial denial or, worse, leave
      // a denied session read showing three registers and no explanation.
      const registerResults = [decisionResult, commitmentResult, actionResult];
      const denied = (result: PromiseSettledResult<unknown>): boolean =>
        result.status === 'rejected' &&
        result.reason instanceof ApiError &&
        result.reason.status === 403;

      const deniedEverything = registerResults.every(denied);
      setForbidden(deniedEverything);

      const unexpected = [sessionResult, ...registerResults].find(
        (result) => result.status === 'rejected' && !denied(result),
      );

      if (deniedEverything) {
        setError(null);
      } else if (unexpected !== undefined && unexpected.status === 'rejected') {
        const caught: unknown = unexpected.reason;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } else if (sessionResult.status === 'rejected') {
        setError('You do not have permission to view this session.');
      } else if (registerResults.some(denied)) {
        setError('Some registers are not visible to you and have been left out.');
      } else {
        setError(null);
      }
      setLoading(false);
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

  const resetForm = () => {
    setTitle('');
    setBody('');
    setOwnerDescription('');
    setDueDate('');
    setPriority('medium');
  };

  const suggestCandidates = async () => {
    setCandidatesBusy(true);
    setCandidatesError(null);
    setCandidatesLoaded(false);
    try {
      const { jobId } = await api.requestOutcomeCandidates(workspaceId, sessionId, user);
      setCandidatesJobId(jobId);
    } catch (caught) {
      setCandidatesError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setCandidatesBusy(false);
    }
  };

  // CPU-bound local generation can take longer than a proxy in front of
  // this deployment holds a connection open, so this is a background job —
  // poll it rather than waiting on one long request.
  useEffect(() => {
    if (candidatesJobId === null) return;

    const poll = async () => {
      try {
        const job = await api.getOutcomeCandidateJob(workspaceId, sessionId, candidatesJobId, user);
        if (job.status === 'pending') return;

        if (job.status === 'completed') {
          setCandidates(job.candidates ?? []);
        } else {
          setCandidatesError(job.failureReason ?? 'Candidate suggestion failed.');
        }
        setCandidatesLoaded(true);
        setCandidatesBusy(false);
        setCandidatesJobId(null);
      } catch (caught) {
        setCandidatesError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        setCandidatesBusy(false);
        setCandidatesJobId(null);
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 3000);
    return () => clearInterval(interval);
  }, [candidatesJobId, workspaceId, sessionId, user]);

  const useCandidate = (candidate: OutcomeCandidateView) => {
    setTab(
      candidate.type === 'decision'
        ? 'decisions'
        : candidate.type === 'commitment'
          ? 'commitments'
          : 'actions',
    );
    setTitle(candidate.title);
    setBody(candidate.description);
    setOwnerDescription(candidate.ownerDescription ?? '');
    setCreateError(null);
    setCandidates((current) => current.filter((c) => c !== candidate));
  };

  const dismissCandidate = (candidate: OutcomeCandidateView) => {
    setCandidates((current) => current.filter((c) => c !== candidate));
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const due = dueDate === '' ? undefined : new Date(`${dueDate}T00:00:00Z`).toISOString();

      if (tab === 'decisions') {
        const created = await api.proposeDecision(
          workspaceId,
          sessionId,
          { title: title.trim(), statement: body.trim() },
          user,
        );
        setDecisions((current) => [...current, toDecisionSummary(created)]);
      } else if (tab === 'commitments') {
        const created = await api.proposeCommitment(
          workspaceId,
          sessionId,
          {
            title: title.trim(),
            description: body.trim(),
            ownerDescription: ownerDescription.trim(),
            ...(due !== undefined ? { dueDate: due } : {}),
          },
          user,
        );
        setCommitments((current) => [...current, created]);
      } else {
        const created = await api.createActionItem(
          workspaceId,
          sessionId,
          {
            title: title.trim(),
            description: body.trim(),
            ownerDescription: ownerDescription.trim(),
            priority,
            ...(due !== undefined ? { dueDate: due } : {}),
          },
          user,
        );
        setActions((current) => [...current, created]);
      }
      resetForm();
    } catch (caught) {
      setCreateError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setCreating(false);
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
        <ErrorNotice message="You do not have permission to view this session's outcomes." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
          className="text-sm underline"
        >
          ← Back to session
        </Link>
      </div>
    );
  }

  const canRecord = session !== null && session.status !== 'archived';
  const notStarted =
    session !== null && (session.status === 'draft' || session.status === 'scheduled');

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
        className="inline-block text-sm underline"
      >
        ← Back to session
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Outcomes{session !== null ? ` — ${session.title}` : ''}
        </h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          What this session decided, what people undertook to do, and what is being done about it. A
          decision or commitment becomes institutional record only once it rests on validated
          evidence or a stated institutional synthesis.
        </p>
      </div>

      {canRecord && !notStarted && (
        <section aria-labelledby="candidates-heading">
          <h2 id="candidates-heading" className="mb-3 text-lg font-semibold">
            Suggested outcomes
          </h2>
          {candidatesError !== null && <ErrorNotice message={candidatesError} />}
          <Card className="space-y-3">
            <p className="text-sm text-[var(--color-ink-muted)]">
              Witness can suggest possible decisions, commitments and actions from this session's
              eligible evidence and confirmed transcripts. These are drafts only — nothing becomes
              an outcome until a person reviews and records it below.
            </p>
            <Button
              variant="secondary"
              disabled={candidatesBusy}
              onClick={() => void suggestCandidates()}
            >
              {candidatesBusy
                ? 'Looking…'
                : candidatesLoaded
                  ? 'Suggest again'
                  : 'Suggest candidates'}
            </Button>
            {candidatesBusy && (
              <p className="text-xs text-[var(--color-ink-muted)]" role="status">
                This can take a minute or two depending on the amount of evidence in the session.
              </p>
            )}
            {candidatesLoaded && candidates.length === 0 && (
              <p className="text-sm text-[var(--color-ink-muted)]">
                No confident candidates found in this session's content.
              </p>
            )}
            {candidates.length > 0 && (
              <ul className="space-y-3">
                {candidates.map((candidate) => (
                  <li
                    key={`${candidate.type}-${candidate.title}`}
                    className="space-y-2 border-t border-[var(--color-line)] pt-3 text-sm first:border-t-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-current px-2 py-0.5 text-xs font-medium">
                        {
                          REGISTER_LABELS[
                            candidate.type === 'decision'
                              ? 'decisions'
                              : candidate.type === 'commitment'
                                ? 'commitments'
                                : 'actions'
                          ]
                        }
                      </span>
                      <span className="text-xs text-[var(--color-ink-muted)]">
                        Machine suggestion · Human review required
                      </span>
                      <details>
                        <summary className="cursor-pointer text-xs text-[var(--color-ink-muted)] underline hover:no-underline">
                          Processing details
                        </summary>
                        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                          Suggestion model: <span className="font-mono">{candidate.model}</span>
                        </p>
                      </details>
                    </div>
                    <p className="font-medium">{candidate.title}</p>
                    <p className="text-[var(--color-ink-muted)]">{candidate.description}</p>
                    {candidate.ownerDescription !== null && (
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        Owner: {candidate.ownerDescription}
                      </p>
                    )}
                    {candidate.sourceEvidenceId !== null && (
                      <Link
                        href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence/${candidate.sourceEvidenceId}`}
                        className="text-xs underline"
                      >
                        Source evidence →
                      </Link>
                    )}
                    <div className="flex gap-2">
                      <Button variant="primary" onClick={() => useCandidate(candidate)}>
                        Use this
                      </Button>
                      <Button variant="secondary" onClick={() => dismissCandidate(candidate)}>
                        Dismiss
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {/*
        Ordinary buttons rather than an ARIA tablist: a tablist owes the
        reader `aria-controls`, matching `role="tabpanel"` regions and
        arrow-key navigation, and a half-built one announces a selected tab
        with no panel behind it. `aria-pressed` states the same thing
        accurately with the behaviour these controls actually have.
      */}
      <div className="flex gap-2 border-b border-[var(--color-line)]">
        {(Object.keys(REGISTER_LABELS) as Register[]).map((register) => (
          <button
            key={register}
            type="button"
            aria-pressed={tab === register}
            onClick={() => {
              setTab(register);
              setCreateError(null);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === register
                ? 'border-[var(--color-ink)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-muted)]'
            }`}
          >
            {REGISTER_LABELS[register]} (
            {register === 'decisions'
              ? decisions.length
              : register === 'commitments'
                ? commitments.length
                : actions.length}
            )
          </button>
        ))}
      </div>

      {notStarted && (
        <p className="text-sm text-[var(--color-ink-muted)]" role="status">
          Outcomes can be recorded once this session has opened.
        </p>
      )}

      {session?.status === 'archived' && (
        <p className="text-sm text-[var(--color-ink-muted)]" role="status">
          This session is archived and read-only.
        </p>
      )}

      {canRecord && !notStarted && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">
            {tab === 'decisions'
              ? 'Propose a decision'
              : tab === 'commitments'
                ? 'Record a commitment'
                : 'Add an action'}
          </h2>
          {createError !== null && <ErrorNotice message={createError} />}
          <form onSubmit={(event) => void create(event)} className="space-y-4">
            <div>
              <label htmlFor="outcomeTitle" className="mb-1 block text-sm font-medium">
                Title <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="outcomeTitle"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={300}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="outcomeBody" className="mb-1 block text-sm font-medium">
                {tab === 'decisions' ? 'What was decided' : 'What this involves'}{' '}
                <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <textarea
                id="outcomeBody"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
                rows={3}
                maxLength={5000}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            {tab !== 'decisions' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ownerDescription" className="mb-1 block text-sm font-medium">
                    Owner <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </label>
                  <input
                    id="ownerDescription"
                    value={ownerDescription}
                    onChange={(event) => setOwnerDescription(event.target.value)}
                    required
                    maxLength={300}
                    placeholder="e.g. Parks and Open Spaces team"
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    In plain language. An owner is usually a team, a service or a named post rather
                    than an individual — and never a session participant.
                  </p>
                </div>
                <div>
                  <label htmlFor="dueDate" className="mb-1 block text-sm font-medium">
                    Due date
                  </label>
                  <input
                    id="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
              </div>
            )}

            {tab === 'actions' && (
              <div>
                <label htmlFor="priority" className="mb-1 block text-sm font-medium">
                  Priority
                </label>
                <select
                  id="priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as ActionItemPriority)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 sm:w-56"
                >
                  {ACTION_ITEM_PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button type="submit" disabled={creating}>
              {creating ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </Card>
      )}

      {tab === 'decisions' && (
        <section className="space-y-3" aria-label="Decisions">
          {decisions.length === 0 ? (
            <p className="text-[var(--color-ink-muted)]">No decisions recorded yet.</p>
          ) : (
            decisions.map((decision) => (
              <Card key={decision.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes/decisions/${decision.id}`}
                      className="font-medium underline"
                    >
                      {decision.title}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      Proposed {formatDate(decision.proposedAt)}
                      {decision.confirmedAt !== null
                        ? ` · confirmed ${formatDate(decision.confirmedAt)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SupportCountBadge count={decision.supportCount} />
                    <DecisionStatusBadge status={decision.status} />
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      {tab === 'commitments' && (
        <section className="space-y-3" aria-label="Commitments">
          {commitments.length === 0 ? (
            <p className="text-[var(--color-ink-muted)]">No commitments recorded yet.</p>
          ) : (
            commitments.map((commitment) => (
              <Card key={commitment.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes/commitments/${commitment.id}`}
                      className="font-medium underline"
                    >
                      {commitment.title}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {commitment.ownerDescription} · due {formatDate(commitment.dueDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {commitment.overdue && <OverdueBadge />}
                    <SupportCountBadge count={commitment.supportCount} />
                    <CommitmentStatusBadge status={commitment.status} />
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      {tab === 'actions' && (
        <section className="space-y-3" aria-label="Actions">
          {actions.length === 0 ? (
            <p className="text-[var(--color-ink-muted)]">No actions recorded yet.</p>
          ) : (
            actions.map((action) => (
              <Card key={action.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/workspaces/${workspaceId}/sessions/${sessionId}/outcomes/actions/${action.id}`}
                      className="font-medium underline"
                    >
                      {action.title}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {action.ownerDescription} · {action.priority} priority · due{' '}
                      {formatDate(action.dueDate)} · {action.percentComplete}% complete
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {action.overdue && <OverdueBadge />}
                    <ActionItemStatusBadge status={action.status} />
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
      )}
    </div>
  );
}

/** The detail the server just returned, narrowed to what the register shows. */
function toDecisionSummary(detail: DecisionSummary): DecisionSummary {
  return {
    id: detail.id,
    sessionId: detail.sessionId,
    title: detail.title,
    status: detail.status,
    proposedAt: detail.proposedAt,
    confirmedAt: detail.confirmedAt,
    supportCount: detail.supportCount,
    updatedAt: detail.updatedAt,
  };
}
