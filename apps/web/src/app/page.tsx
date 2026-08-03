'use client';

/**
 * Dashboard — system status and what this build can and cannot do.
 *
 * The "not implemented" list is fetched from the API rather than hard-coded in
 * the UI. One list, one source. Two lists would disagree within a month, and the
 * one a user reads would be the wrong one.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { HealthResponse, RecordSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { Card, ErrorNotice, StateBadge } from '@/components/ui';

export default function DashboardPage() {
  const { user, ready } = useSession();
  const { status: authStatus, currentUser } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const [healthResult, recordsResult] = await Promise.all([
          api.health(),
          api.listRecords(user).catch(() => ({ records: [] as RecordSummary[] })),
        ]);

        if (cancelled) return;
        setHealth(healthResult);
        setRecords(recordsResult.records);
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

  const accepted = records.filter((record) => record.isInstitutionalRecord).length;
  const awaiting = records.filter((record) => record.reviewState === 'in_review').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Institutional memory</h1>
        <p className="mt-1 max-w-2xl text-[var(--color-ink-muted)]">
          Witness records what was decided, why, who objected, and what was promised — with an
          unbroken chain back to the source, and a human decision on every entry.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      {authStatus === 'authenticated' && currentUser !== null && (
        <section aria-labelledby="access-heading" className="space-y-3">
          <h2 id="access-heading" className="text-lg font-semibold">
            Your access
          </h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Only the organisations and workspaces {currentUser.displayName} actually belongs to —
            never the full catalog.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <h3 className="mb-2 font-medium">Organisations</h3>
              {currentUser.organisations.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  No organisation memberships.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {currentUser.organisations.map((org) => (
                    <li key={org.id}>
                      <Link href={`/organisations/${org.id}`} className="hover:underline">
                        {org.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h3 className="mb-2 font-medium">Workspaces</h3>
              {currentUser.workspaces.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-muted)]">No workspace memberships.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {currentUser.workspaces.map((workspace) => (
                    <li key={workspace.id}>
                      <Link href={`/workspaces/${workspace.id}`} className="hover:underline">
                        {workspace.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </section>
      )}

      <section aria-labelledby="status-heading" className="space-y-3">
        <h2 id="status-heading" className="text-lg font-semibold">
          System status
        </h2>

        {loading && health === null ? (
          <Card>
            <p className="text-[var(--color-ink-muted)]">Checking…</p>
          </Card>
        ) : health === null ? (
          <Card>
            <p className="text-[var(--color-ink-muted)]">
              Status unavailable — the API is not reachable.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Overall" value={health.status} emphasis={health.status === 'ok'} />
              <Stat label="Deployment profile" value={health.profile} />
              <Stat label="Data residency" value={health.dataResidency} />
              <Stat
                label="External inference"
                value={health.externalInferenceEnabled ? 'enabled' : 'disabled'}
                emphasis={!health.externalInferenceEnabled}
              />
            </div>

            <Card>
              <h3 className="mb-3 font-medium">Components</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {Object.entries(health.components).map(([name, component]) => (
                  <li
                    key={name}
                    className="rounded border border-[var(--color-line)] px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono">{name}</span>
                      <span className="font-medium">
                        {component.status}
                        {component.latencyMs !== undefined && (
                          <span className="font-normal text-[var(--color-ink-muted)]">
                            {' '}
                            · {component.latencyMs}ms
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                      {component.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>

            <p className="text-xs text-[var(--color-ink-muted)]">
              {health.instanceName} · version {health.version} · build {health.buildId} · uptime{' '}
              {health.uptimeSeconds}s
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="records-heading" className="space-y-3">
        <h2 id="records-heading" className="text-lg font-semibold">
          Records
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Total captured" value={String(records.length)} />
          <Stat label="Accepted as record" value={String(accepted)} />
          <Stat label="Awaiting review" value={String(awaiting)} emphasis={awaiting > 0} />
        </div>

        {records.length > 0 && (
          <Card>
            <h3 className="mb-3 font-medium">Most recently updated</h3>
            <ul className="divide-y divide-[var(--color-line)]">
              {records.slice(0, 5).map((record) => (
                <li key={record.id} className="py-2">
                  <Link
                    href={`/records/${record.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 hover:underline"
                  >
                    <span>{record.title}</span>
                    <StateBadge state={record.reviewState} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {health !== null && health.notImplemented.length > 0 && (
        <section aria-labelledby="gaps-heading" className="space-y-3">
          <h2 id="gaps-heading" className="text-lg font-semibold">
            Not implemented in this build
          </h2>
          <Card>
            <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
              Listed so you never have to guess whether something is broken or simply not built yet.
              Nothing below is simulated.
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {health.notImplemented.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <Card className="!p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${emphasis ? 'text-[var(--color-accent)]' : ''}`}>
        {value}
      </p>
    </Card>
  );
}
