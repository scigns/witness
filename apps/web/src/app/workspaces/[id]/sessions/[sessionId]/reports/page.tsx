'use client';

/**
 * A session's reports (BUILD_ROADMAP.md Milestone 8).
 *
 * A session can have more than one report — an internal write-up and an
 * external summary are different documents with different consent
 * obligations, and revisions of an approved report are separate records
 * rather than edits. So this is a list, not a single page.
 *
 * The audience choice sits in the create form rather than being buried in
 * settings, because it decides what the report is allowed to contain. Making
 * it the second thing an author picks is the point.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  REPORT_AUDIENCES,
  type CoDesignSessionDetail,
  type ReportAudience,
  type ReportSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, EmptyState, ErrorNotice, ReportStatusBadge } from '@/components/ui';

const AUDIENCE_LABELS: Record<ReportAudience, string> = {
  internal: 'Internal — for use inside this organisation',
  external: 'External — shared with partners or funders',
  public: 'Public — published openly',
};

export default function SessionReportsPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [session, setSession] = useState<CoDesignSessionDetail | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [audience, setAudience] = useState<ReportAudience>('internal');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      const [sessionResult, reportsResult] = await Promise.allSettled([
        api.getSession(workspaceId, sessionId, user),
        api.listReports(workspaceId, sessionId, user),
      ]);
      if (cancelledRef.current) return;

      if (sessionResult.status === 'fulfilled') setSession(sessionResult.value);
      if (reportsResult.status === 'fulfilled') setReports(reportsResult.value.reports);

      if (reportsResult.status === 'rejected') {
        const caught: unknown = reportsResult.reason;
        if (caught instanceof ApiError && caught.status === 403) {
          setForbidden(true);
          setError(null);
        } else {
          setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        }
      } else if (sessionResult.status === 'rejected') {
        setError('You do not have permission to view this session.');
      } else {
        setError(null);
        setForbidden(false);
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

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createReport(
        workspaceId,
        sessionId,
        {
          title: title.trim(),
          audience,
          ...(purpose.trim() === '' ? {} : { purpose: purpose.trim() }),
        },
        user,
      );
      setReports((current) => [...current, created]);
      setTitle('');
      setPurpose('');
    } catch (caught) {
      setCreateError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  if (loading)
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this session's reports." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
          className="text-sm underline"
        >
          ← Back to session
        </Link>
      </div>
    );
  }

  const notStarted =
    session !== null && (session.status === 'draft' || session.status === 'scheduled');
  const canWrite = session !== null && session.status !== 'archived' && !notStarted;

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
          Reports{session !== null ? ` — ${session.title}` : ''}
        </h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          What this session produced, written up for a stated audience, reviewed before it counts as
          the institution&rsquo;s account, and redacted against participant consent whenever a copy
          is made.
        </p>
      </div>

      {notStarted && (
        <p className="text-sm text-[var(--color-ink-muted)]" role="status">
          A session can be reported on once it has opened.
        </p>
      )}

      {session?.status === 'archived' && (
        <p className="text-sm text-[var(--color-ink-muted)]" role="status">
          This session is archived and read-only.
        </p>
      )}

      {canWrite && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Start a report</h2>
          {createError !== null && <ErrorNotice message={createError} />}
          <form onSubmit={(event) => void create(event)} className="space-y-4">
            <div>
              <label htmlFor="reportTitle" className="mb-1 block text-sm font-medium">
                Title <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="reportTitle"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={300}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="reportAudience" className="mb-1 block text-sm font-medium">
                Audience <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="reportAudience"
                value={audience}
                onChange={(event) => setAudience(event.target.value as ReportAudience)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                {REPORT_AUDIENCES.map((value) => (
                  <option key={value} value={value}>
                    {AUDIENCE_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                This decides which consent each participant&rsquo;s evidence has to satisfy.
                Evidence a participant agreed to internally but not publicly is left out of a public
                report automatically.
              </p>
            </div>

            <div>
              <label htmlFor="reportPurpose" className="mb-1 block text-sm font-medium">
                Purpose
              </label>
              <textarea
                id="reportPurpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                rows={2}
                maxLength={20000}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <p className="text-xs text-[var(--color-ink-muted)]">
              Every validated piece of evidence, confirmed decision, active commitment and action in
              this session is cited automatically. You can remove any of them while the report is
              still a draft.
            </p>

            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create report'}
            </Button>
          </form>
        </Card>
      )}

      <section className="space-y-3" aria-label="Reports">
        {reports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            body="Create the first report above once evidence has been reviewed."
          />
        ) : (
          reports.map((report) => (
            <Card key={report.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/workspaces/${workspaceId}/sessions/${sessionId}/reports/${report.id}`}
                    className="font-medium underline"
                  >
                    {report.title}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    Revision {report.revision} · {report.audience} audience · {report.sourceCount}{' '}
                    source {report.sourceCount === 1 ? 'record' : 'records'} cited
                    {report.approvedAt !== null
                      ? ` · approved ${new Date(report.approvedAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                <ReportStatusBadge status={report.status} />
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
