'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { RecordSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, ErrorNotice, StateBadge } from '@/components/ui';

export default function RecordsPage() {
  const { user, ready } = useSession();
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const result = await api.listRecords(user);
        if (cancelled) return;
        setRecords(result.records);
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Records</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Everything captured, and where it sits in review.
          </p>
        </div>
        <Link
          href="/records/new"
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Capture a record
        </Link>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      {loading ? (
        <Card>
          <p className="text-[var(--color-ink-muted)]">Loading…</p>
        </Card>
      ) : records.length === 0 ? (
        <Card>
          <p className="font-medium">No records yet.</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Capture one, or run <code className="font-mono">make seed</code> for synthetic fixtures.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Institutional records, most recently updated first
            </caption>
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Title
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Source
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  State
                </th>
                <th scope="col" className="py-2 font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-[var(--color-line)] hover:bg-[var(--color-accent-soft)]"
                >
                  <td className="py-3 pr-4">
                    <Link href={`/records/${record.id}`} className="font-medium hover:underline">
                      {record.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-[var(--color-ink-muted)]">{record.sourceLabel}</td>
                  <td className="py-3 pr-4">
                    <StateBadge state={record.reviewState} />
                  </td>
                  <td className="py-3 text-[var(--color-ink-muted)]">
                    <time dateTime={record.updatedAt}>
                      {new Date(record.updatedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
