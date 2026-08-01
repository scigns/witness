'use client';

/**
 * Capture — the entry point of the institutional-memory workflow.
 *
 * Source details are required rather than optional. A record with no source is
 * exactly what principle P3 forbids, and the domain will reject it; asking for
 * the source here means the user finds out before typing three paragraphs.
 */

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { SourceKind } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

const SOURCE_KINDS: ReadonlyArray<{ value: SourceKind; label: string }> = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'document', label: 'Document' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'manual_entry', label: 'Manual entry' },
];

export default function NewRecordPage() {
  const router = useRouter();
  const { user } = useSession();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceKind, setSourceKind] = useState<SourceKind>('meeting');
  const [sourceLabel, setSourceLabel] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const created = await api.createRecord(
        {
          title,
          body,
          source: {
            kind: sourceKind,
            label: sourceLabel,
            occurredAt: new Date(occurredAt).toISOString(),
          },
        },
        user,
      );

      router.push(`/records/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Capture a record</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Everything captured starts as a draft. Nothing becomes institutional record until a human
          confirms it.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Card className="space-y-4">
          <h2 className="font-medium">What was recorded</h2>

          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium">
              Title <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="title"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Bore maintenance deferred pending the budget review"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="body" className="mb-1 block text-sm font-medium">
              Content <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <textarea
              id="body"
              required
              rows={8}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What was decided, who objected, what was promised in return…"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Record the reasoning, not only the outcome. The outcome is what minutes already
              capture; the reasoning is what institutions lose.
            </p>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-medium">
            Where it came from
            <span className="ml-2 text-xs font-normal text-[var(--color-ink-muted)]">
              required — provenance is not optional (P3)
            </span>
          </h2>

          <div>
            <label htmlFor="sourceKind" className="mb-1 block text-sm font-medium">
              Source type
            </label>
            <select
              id="sourceKind"
              value={sourceKind}
              onChange={(event) => setSourceKind(event.target.value as SourceKind)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            >
              {SOURCE_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sourceLabel" className="mb-1 block text-sm font-medium">
              Source description <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="sourceLabel"
              required
              maxLength={300}
              value={sourceLabel}
              onChange={(event) => setSourceLabel(event.target.value)}
              placeholder="Community Water Committee — 14 March 2026"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="occurredAt" className="mb-1 block text-sm font-medium">
              When the source occurred <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="occurredAt"
              type="datetime-local"
              required
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              When the meeting happened or the document was written — not now. A capture time
              earlier than this is rejected.
            </p>
          </div>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Capturing…' : 'Capture record'}
          </Button>
        </div>
      </form>
    </div>
  );
}
