'use client';

/**
 * Cross-organisation "what needs attention" view for Witness's own operators
 * (Phase 5, Workstream 4.2) — `operator:read` is platform-scoped only (see
 * `operator.authorization.test.ts`), so a plain organisation admin gets the
 * same 403 here as any other operator-only action; the dev-preview's
 * "Administration" nav link is a convenience shortcut, not the enforcement.
 */

import { useEffect, useState } from 'react';

import type {
  OperatorFailureGroup,
  OperatorFailureItem,
  OperatorHealthView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { EmptyState, ErrorNotice } from '@/components/ui';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function itemLink(item: OperatorFailureItem): string | null {
  if (item.linkWorkspaceId && item.linkSessionId && item.linkEvidenceId) {
    return `/workspaces/${item.linkWorkspaceId}/sessions/${item.linkSessionId}/evidence/${item.linkEvidenceId}`;
  }
  if (item.linkWorkspaceId && item.linkSessionId) {
    return `/workspaces/${item.linkWorkspaceId}/sessions/${item.linkSessionId}/summary`;
  }
  return `/organisations/${item.organisationId}/billing`;
}

function FailureSection({ title, group }: { title: string; group: OperatorFailureGroup }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {title}
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            group.count === 0
              ? 'bg-[var(--color-paper)] text-[var(--color-ink-muted)]'
              : 'bg-[var(--color-attention)] text-white'
          }`}
        >
          {group.count}
        </span>
      </h2>
      {group.items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Nothing needs attention.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th className="py-2">Organisation</th>
                <th>Detail</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--color-line)]">
                  <td className="py-2">{item.organisationName}</td>
                  <td>
                    <a href={itemLink(item) ?? undefined} className="underline">
                      {item.detail}
                    </a>
                  </td>
                  <td className="text-[var(--color-ink-muted)]">{item.reason ?? '—'}</td>
                  <td className="text-[var(--color-ink-muted)]">{formatDate(item.occurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {group.count > group.items.length && (
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              Showing the {group.items.length} most recent of {group.count}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default function OperatorPage() {
  const { user, ready } = useSession();
  const [health, setHealth] = useState<OperatorHealthView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const result = await api.getOperatorHealth(user);
        if (cancelled) return;
        setHealth(result);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operator health</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Failed or stuck jobs across every organisation — transcription, session summaries,
          invitation email delivery, and overdue or rejected settlement.
        </p>
      </div>

      {error && <ErrorNotice message={error} />}

      {loading && !health && <p role="status">Loading…</p>}

      {health && (
        <>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Generated {formatDate(health.generatedAt)}
          </p>
          <FailureSection title="Transcription" group={health.transcription} />
          <FailureSection title="Session summaries" group={health.summaries} />
          <FailureSection title="Invitation email" group={health.email} />
          <FailureSection title="Settlement" group={health.settlement} />
        </>
      )}

      {!loading && !error && !health && (
        <EmptyState title="No data" body="The operator health view could not be loaded." />
      )}
    </div>
  );
}
