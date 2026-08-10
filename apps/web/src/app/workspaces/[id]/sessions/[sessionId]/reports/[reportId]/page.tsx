'use client';

/**
 * One report — write it, cite it, move it through review, read it as it will
 * be read, and take a copy (BUILD_ROADMAP.md Milestone 8).
 *
 * The preview is the same `RenderedReport` the exports serialise, fetched
 * from the server with redaction already applied. That matters more than it
 * looks: an author previewing their own report sees exactly what a reader
 * will see, including the gaps where consent withheld something. A preview
 * built from unredacted data would show the author a document that does not
 * exist, and the first time anyone saw the real one would be after it left.
 *
 * Exports are fetched with the session attached and then saved from memory.
 * A plain `<a href>` was the obvious design and is wrong: a navigation sends
 * cookies, the session travels as an `Authorization: Bearer` header, so the
 * link is an unauthenticated request and a deployed instance answers it with
 * 401. The bytes therefore do pass through client-side JavaScript, but they
 * are never rendered — the blob is handed straight to a download, and the
 * server's `Content-Disposition` still names the file.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  REPORT_EXPORT_FORMATS,
  type RenderedReport,
  type ReportDetail,
  type ReportExportFormat,
  type ReportSourceType,
  type ReportTransitionRequest,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, ReportStatusBadge } from '@/components/ui';

const ACTION_LABELS: Record<ReportTransitionRequest['action'], string> = {
  submit: 'Submit for review',
  request_changes: 'Request changes',
  approve: 'Approve',
  publish: 'Publish internally',
  revise: 'Start a revision',
};

/** Actions the server requires a reason for. */
const REASON_REQUIRED: ReadonlySet<string> = new Set(['request_changes', 'revise']);

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string; reportId: string }>;
}) {
  const { id: workspaceId, sessionId, reportId } = use(params);
  const { user, ready } = useSession();
  const router = useRouter();

  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [rendered, setRendered] = useState<RenderedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const [synthesis, setSynthesis] = useState('');
  const [questions, setQuestions] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);

  /**
   * What this report may cite: the session's validated evidence and its
   * authoritative outcomes. Loaded lazily, and only while the report is still
   * editable — an approved report's citations are frozen.
   */
  const [citable, setCitable] = useState<{ type: ReportSourceType; id: string; label: string }[]>(
    [],
  );
  const [citing, setCiting] = useState('');

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * Take a copy: fetch with the session attached, then save from memory.
   * See this file's header for why this cannot be a link.
   */
  const takeCopy = async (format: ReportExportFormat): Promise<void> => {
    setExporting(format);
    setError(null);
    try {
      const { blob, filename } = await api.downloadReportExport(
        workspaceId,
        sessionId,
        reportId,
        format,
        user,
      );
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Revoked on the next tick rather than immediately: Chromium starts the
      // download asynchronously and a URL revoked in the same task can be gone
      // before it is read.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The export failed.');
    } finally {
      setExporting(null);
    }
  };

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      // Independent: a caller who may read the report but not compose it
      // should still see its metadata and its citations.
      const [detailResult, renderedResult] = await Promise.allSettled([
        api.getReport(workspaceId, sessionId, reportId, user),
        api.getRenderedReport(workspaceId, sessionId, reportId, user),
      ]);
      if (cancelledRef.current) return;

      if (renderedResult.status === 'fulfilled') setRendered(renderedResult.value);

      if (detailResult.status === 'fulfilled') {
        setDetail(detailResult.value);
        setSynthesis(detailResult.value.facilitatorSynthesis ?? '');
        setQuestions(detailResult.value.unresolvedQuestions ?? '');
        setRecommendations(detailResult.value.recommendations ?? '');
        setError(null);
        setForbidden(false);
      } else {
        const caught: unknown = detailResult.reason;
        if (caught instanceof ApiError && caught.status === 403) setForbidden(true);
        else setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      }
      setLoading(false);
    },
    [workspaceId, sessionId, reportId, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  // What may be cited, loaded once. Kept out of `load` because a caller who
  // cannot list evidence should still see the report; a failure here narrows
  // the picker rather than breaking the page.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      const [evidence, decisions, commitments, actions] = await Promise.allSettled([
        api.listEvidence(workspaceId, sessionId, user),
        api.listDecisions(workspaceId, sessionId, user),
        api.listCommitments(workspaceId, sessionId, user),
        api.listActionItems(workspaceId, sessionId, user),
      ]);
      if (cancelled) return;

      const options: { type: ReportSourceType; id: string; label: string }[] = [];
      if (evidence.status === 'fulfilled') {
        for (const item of evidence.value.evidence) {
          // Only validated evidence is admissible; offering the rest would be
          // an invitation to a refusal the picker could have prevented.
          if (item.reviewStatus === 'validated' && !item.withdrawn) {
            options.push({ type: 'evidence', id: item.id, label: `Evidence — ${item.title}` });
          }
        }
      }
      if (decisions.status === 'fulfilled') {
        for (const item of decisions.value.decisions) {
          options.push({ type: 'decision', id: item.id, label: `Decision — ${item.title}` });
        }
      }
      if (commitments.status === 'fulfilled') {
        for (const item of commitments.value.commitments) {
          options.push({ type: 'commitment', id: item.id, label: `Commitment — ${item.title}` });
        }
      }
      if (actions.status === 'fulfilled') {
        for (const item of actions.value.actions) {
          options.push({ type: 'action_item', id: item.id, label: `Action — ${item.title}` });
        }
      }
      setCitable(options);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, workspaceId, sessionId, user]);

  const refresh = useCallback(async () => {
    try {
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reload this report.');
    }
  }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (detail === null) return;
    setBusy(true);
    setSaveError(null);
    try {
      await api.updateReport(
        workspaceId,
        sessionId,
        reportId,
        {
          facilitatorSynthesis: synthesis.trim() === '' ? null : synthesis.trim(),
          unresolvedQuestions: questions.trim() === '' ? null : questions.trim(),
          recommendations: recommendations.trim() === '' ? null : recommendations.trim(),
          expectedVersion: detail.version,
        },
        user,
      );
      await refresh();
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: ReportTransitionRequest['action']) => {
    if (detail === null) return;
    setBusy(true);
    setActionError(null);
    try {
      const body: ReportTransitionRequest =
        action === 'request_changes'
          ? { action, reason: reason.trim(), expectedVersion: detail.version }
          : action === 'revise'
            ? { action, reason: reason.trim(), expectedVersion: detail.version }
            : { action, expectedVersion: detail.version };

      const next = await api.transitionReport(workspaceId, sessionId, reportId, body, user);
      setPendingAction(null);
      setReason('');

      // A revision is a *different* report, so stay useful and go to it.
      if (next.id !== reportId) {
        router.push(`/workspaces/${workspaceId}/sessions/${sessionId}/reports/${next.id}`);
        return;
      }
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const addSource = async () => {
    const chosen = citable.find((candidate) => `${candidate.type}:${candidate.id}` === citing);
    if (chosen === undefined) return;

    setBusy(true);
    setSaveError(null);
    try {
      await api.includeReportSource(
        workspaceId,
        sessionId,
        reportId,
        { sourceType: chosen.type, sourceId: chosen.id },
        user,
      );
      setCiting('');
      await refresh();
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const removeSource = async (sourceId: string) => {
    setBusy(true);
    setSaveError(null);
    try {
      await api.excludeReportSource(workspaceId, sessionId, reportId, sourceId, user);
      await refresh();
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-[var(--color-ink-muted)]">Loading…</p>;

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this report." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}/reports`}
          className="text-sm underline"
        >
          ← Back to reports
        </Link>
      </div>
    );
  }

  if (detail === null) {
    return <ErrorNotice message={error ?? 'This report could not be loaded.'} />;
  }

  const canSubmitPending =
    pendingAction === null
      ? false
      : REASON_REQUIRED.has(pendingAction)
        ? reason.trim() !== ''
        : true;

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}/reports`}
        className="inline-block text-sm underline"
      >
        ← Back to reports
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Revision {detail.revision} · {detail.audience} audience · {detail.sources.length} source{' '}
            {detail.sources.length === 1 ? 'record' : 'records'} cited
          </p>
        </div>
        <ReportStatusBadge status={detail.status} />
      </div>

      {detail.changesRequestedReason !== null && (
        <div
          className="rounded border border-amber-600 p-3 text-sm text-amber-700 dark:text-amber-400"
          role="status"
        >
          <strong>Changes requested:</strong> {detail.changesRequestedReason}
        </div>
      )}

      {detail.canEdit ? (
        <Card className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Your synthesis</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              These sections are your own interpretation. They are labelled as such wherever the
              report is read or exported, so they are never mistaken for what a participant said.
            </p>
          </div>
          {saveError !== null && <ErrorNotice message={saveError} />}
          <form onSubmit={(event) => void save(event)} className="space-y-4">
            <div>
              <label htmlFor="synthesis" className="mb-1 block text-sm font-medium">
                What this session found
              </label>
              <textarea
                id="synthesis"
                value={synthesis}
                onChange={(event) => setSynthesis(event.target.value)}
                rows={4}
                maxLength={20000}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="questions" className="mb-1 block text-sm font-medium">
                Unresolved questions
              </label>
              <textarea
                id="questions"
                value={questions}
                onChange={(event) => setQuestions(event.target.value)}
                rows={3}
                maxLength={20000}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="recommendations" className="mb-1 block text-sm font-medium">
                Recommendations
              </label>
              <textarea
                id="recommendations"
                value={recommendations}
                onChange={(event) => setRecommendations(event.target.value)}
                rows={3}
                maxLength={20000}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Synthesis</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            The facilitator&rsquo;s own interpretation, not participant testimony.
          </p>
          {detail.facilitatorSynthesis !== null && (
            <p className="whitespace-pre-wrap">{detail.facilitatorSynthesis}</p>
          )}
          {detail.unresolvedQuestions !== null && (
            <>
              <h3 className="font-medium">Unresolved questions</h3>
              <p className="whitespace-pre-wrap">{detail.unresolvedQuestions}</p>
            </>
          )}
          {detail.recommendations !== null && (
            <>
              <h3 className="font-medium">Recommendations</h3>
              <p className="whitespace-pre-wrap">{detail.recommendations}</p>
            </>
          )}
        </Card>
      )}

      {detail.permittedActions.length > 0 && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Review and approval</h2>
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
                  if (REASON_REQUIRED.has(action)) {
                    setPendingAction(pendingAction === action ? null : action);
                  } else {
                    void runAction(action);
                  }
                }}
              >
                {ACTION_LABELS[action]}
              </Button>
            ))}
          </div>

          {pendingAction !== null && (
            <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
              <div>
                <label htmlFor="reason" className="mb-1 block text-sm font-medium">
                  Reason <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  {pendingAction === 'request_changes'
                    ? 'Say what needs to change. A request with no statement of what is wrong is delay, not review.'
                    : 'Say why this approved report needs revising. The approved revision is kept exactly as it was.'}
                </p>
              </div>
              <Button
                disabled={busy || !canSubmitPending}
                onClick={() => void runAction(pendingAction as ReportTransitionRequest['action'])}
              >
                {busy
                  ? 'Saving…'
                  : `Confirm ${ACTION_LABELS[pendingAction as ReportTransitionRequest['action']]}`}
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">What this report cites</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            The version shown is the one frozen when the record was cited. If a record has been
            corrected since, it is flagged rather than silently swapped.
          </p>
        </div>
        {detail.canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <label htmlFor="citeSource" className="mb-1 block text-sm font-medium">
                Cite a record
              </label>
              <select
                id="citeSource"
                value={citing}
                onChange={(event) => setCiting(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                <option value="">Choose a record…</option>
                {citable
                  .filter(
                    (candidate) =>
                      !detail.sources.some(
                        (source) =>
                          source.sourceType === candidate.type && source.sourceId === candidate.id,
                      ),
                  )
                  .map((candidate) => (
                    <option
                      key={`${candidate.type}:${candidate.id}`}
                      value={`${candidate.type}:${candidate.id}`}
                    >
                      {candidate.label}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              variant="primary"
              disabled={busy || citing === ''}
              onClick={() => void addSource()}
            >
              Cite
            </Button>
          </div>
        )}

        {detail.sources.length === 0 ? (
          <p className="text-[var(--color-ink-muted)]">Nothing cited yet.</p>
        ) : (
          <ul className="space-y-2">
            {detail.sources.map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded border border-[var(--color-line)] p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {source.sourceTitle ?? source.sourceId}{' '}
                    <span className="text-xs font-normal text-[var(--color-ink-muted)]">
                      {source.sourceType.replace(/_/g, ' ')}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Cited at version {source.sourceVersion} ({source.sourceStatus})
                    {source.drifted ? ' · this record has changed since' : ''}
                  </p>
                </div>
                {detail.canEdit && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void removeSource(source.id)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {rendered !== null && (
        <Card className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Preview</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Exactly what a reader sees, with participant consent already applied.
              {rendered.redactedCount > 0
                ? ` ${rendered.redactedCount} record(s) are withheld from this copy under participant consent.`
                : ''}
            </p>
          </div>

          <p className="text-sm">
            {rendered.participants.total} participants — {rendered.participants.named} named,{' '}
            {rendered.participants.pseudonymous} pseudonymous, {rendered.participants.anonymous}{' '}
            anonymous. {rendered.participants.withdrawn} withdrew.
          </p>

          <div>
            <h3 className="font-medium">Validated evidence</h3>
            <ul className="mt-2 space-y-2">
              {rendered.evidence.map((item) => (
                <li key={item.id} className="border-l-2 border-[var(--color-line)] pl-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {item.evidenceType} · {item.attribution.replace(/_/g, ' ')}
                    {item.pseudonym !== undefined ? ` (${item.pseudonym})` : ''}
                  </p>
                  <p
                    className={
                      item.quotable
                        ? 'mt-1 text-sm'
                        : 'mt-1 text-sm italic text-[var(--color-ink-muted)]'
                    }
                  >
                    {item.quotable
                      ? item.content
                      : 'Content withheld — this participant did not consent to being quoted for this audience.'}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {detail.canExport && (
            <div className="border-t border-[var(--color-line)] pt-4">
              <h3 className="font-medium">Take a copy</h3>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Redaction is applied by the server, and every export is recorded in this
                report&rsquo;s history with its format and who took it.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {REPORT_EXPORT_FORMATS.map((format) => (
                  <Button
                    key={format}
                    variant="secondary"
                    disabled={exporting !== null}
                    onClick={() => void takeCopy(format)}
                  >
                    {exporting === format ? `${format.toUpperCase()}…` : format.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
