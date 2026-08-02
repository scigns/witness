'use client';

/**
 * Record detail — the content, its provenance, its audit trail, and the review
 * controls.
 *
 * Two things here are deliberate rather than incidental:
 *
 * 1. A record that is not accepted is labelled a **candidate**, prominently. P4
 *    says the machine proposes and the human disposes; a UI that renders
 *    unreviewed material identically to confirmed material silently defeats that.
 *
 * 2. `permittedActions` comes from the server. The client does not reimplement
 *    the state machine — it renders what the domain says is possible. Two copies
 *    of a state machine is one copy too many.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { RecordDetail, ReviewAction } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, NotImplemented, StateBadge } from '@/components/ui';

export default function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctedBody, setCorrectedBody] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.getRecord(id, user);
      setRecord(result);
      setCorrectedBody(result.body);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  }, [id, user]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const act = async (action: ReviewAction) => {
    setBusy(true);
    try {
      const updated = await api.review(id, action, user);
      setRecord(updated);
      setCorrectedBody(updated.body);
      setCorrecting(false);
      setError(null);
    } catch (caught) {
      // A 403 here is the authorisation boundary working. Surfacing the API's
      // own reason is more useful than a generic message, and demonstrates that
      // the denial came from the server rather than from a hidden button.
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (error !== null && record === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error} />
        <Link href="/records" className="text-sm underline">
          ← Back to records
        </Link>
      </div>
    );
  }

  if (record === null) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link href="/records" className="inline-block text-sm underline">
        ← Back to records
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="max-w-3xl text-2xl font-semibold tracking-tight">{record.title}</h1>
        <StateBadge state={record.reviewState} />
      </div>

      {!record.isInstitutionalRecord && (
        <div
          role="note"
          className="rounded border border-amber-600 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          <strong>This is a candidate, not institutional record.</strong> It has not been confirmed
          by a human reviewer, and must not be relied on or cited as a decision of record.
        </div>
      )}

      {!record.auditChainValid && (
        <div
          role="alert"
          className="rounded border border-red-700 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-100"
        >
          <strong>Audit chain verification failed.</strong> The audit trail for this record does not
          verify against its own hashes. Treat this record as untrustworthy and report it.
        </div>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
          Content
        </h2>
        {correcting ? (
          <div className="space-y-3">
            <label htmlFor="corrected" className="sr-only">
              Corrected content
            </label>
            <textarea
              id="corrected"
              value={correctedBody}
              onChange={(event) => setCorrectedBody(event.target.value)}
              rows={8}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-3 font-sans"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={busy || correctedBody.trim() === record.body}
                onClick={() => void act({ action: 'correct', body: correctedBody })}
              >
                Save correction and accept
              </Button>
              <Button onClick={() => setCorrecting(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              A correction must change the content. Corrections are tracked separately from
              confirmations because the correction rate is how we measure whether extraction is
              trustworthy.
            </p>
          </div>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{record.body}</p>
        )}
      </Card>

      <section aria-labelledby="review-heading">
        <h2 id="review-heading" className="mb-3 text-lg font-semibold">
          Human review
        </h2>
        <Card>
          {record.permittedActions.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              No transitions are available from this state.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {record.permittedActions.includes('submit') && (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void act({ action: 'submit' })}
                >
                  Submit for review
                </Button>
              )}
              {record.permittedActions.includes('confirm') && (
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void act({ action: 'confirm' })}
                >
                  Confirm as record
                </Button>
              )}
              {record.permittedActions.includes('correct') && (
                <Button disabled={busy} onClick={() => setCorrecting(true)}>
                  Correct and accept
                </Button>
              )}
              {record.permittedActions.includes('reject') && (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt('Why is this being rejected?');
                    if (reason !== null && reason.trim() !== '') {
                      void act({ action: 'reject', reason });
                    }
                  }}
                >
                  Reject
                </Button>
              )}
              {record.permittedActions.includes('reopen') && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt('Why is this decision being reopened?');
                    if (reason !== null && reason.trim() !== '') {
                      void act({ action: 'reopen', reason });
                    }
                  }}
                >
                  Reopen
                </Button>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
            Available transitions are computed by the server from the domain state machine. Acting
            as a <strong>reader</strong> will be refused by the API — the boundary is real.
          </p>
        </Card>
      </section>

      <section aria-labelledby="provenance-heading">
        <h2 id="provenance-heading" className="mb-3 text-lg font-semibold">
          Provenance
        </h2>
        <Card>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Source" value={record.provenance.source.label} />
            <Field label="Source type" value={record.provenance.source.kind.replace('_', ' ')} />
            <Field
              label="Source occurred"
              value={new Date(record.provenance.source.occurredAt).toLocaleString()}
            />
            <Field
              label="Captured"
              value={new Date(record.provenance.capturedAt).toLocaleString()}
            />
            <Field
              label="Captured by"
              value={`${record.provenance.capturedBy.displayName} (${record.provenance.capturedBy.kind})`}
            />
            <Field
              label="Consent grant"
              value={
                record.provenance.consentGrantId ?? 'Not recorded — consent service is Phase 3'
              }
            />
          </dl>
        </Card>
      </section>

      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading" className="mb-3 text-lg font-semibold">
          Audit trail
        </h2>
        <Card>
          <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
            Append-only and hash-chained. Each entry carries the hash of the one before it, so an
            alteration anywhere breaks every subsequent link.{' '}
            {record.auditChainValid ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Chain verified.
              </span>
            ) : (
              <span className="font-medium text-red-700 dark:text-red-400">
                Chain verification FAILED.
              </span>
            )}
          </p>

          <ol className="space-y-4">
            {record.auditTrail.map((event) => (
              <li key={event.id} className="border-l-2 border-[var(--color-line)] pl-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-medium">{event.action}</span>
                  <time
                    dateTime={event.occurredAt}
                    className="text-xs text-[var(--color-ink-muted)]"
                  >
                    {new Date(event.occurredAt).toLocaleString()}
                  </time>
                </div>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {event.actor.displayName} ({event.actor.kind})
                </p>
                {Object.keys(event.metadata).length > 0 && (
                  <ul className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    {Object.entries(event.metadata).map(([key, value]) => (
                      <li key={key}>
                        <span className="font-medium">{key}:</span> {value}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 break-all font-mono text-[10px] text-[var(--color-ink-muted)]">
                  {event.previousHash === null
                    ? 'genesis'
                    : `prev ${event.previousHash.slice(0, 16)}…`}{' '}
                  → {event.hash.slice(0, 16)}…
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section aria-labelledby="extraction-heading">
        <h2 id="extraction-heading" className="mb-3 text-lg font-semibold">
          Extracted assertions
        </h2>
        <NotImplemented
          capability="AI extraction of candidate assertions, with model version, prompt hash and source span"
          phase="Phase 5"
        />
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
