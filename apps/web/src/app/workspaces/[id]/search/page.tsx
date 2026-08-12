'use client';

/**
 * Workspace search — "have we discussed this before?" Plain scoped text
 * search across everything a session in this workspace can produce; see
 * `services/api-gateway/src/search/search.service.ts`'s file header for
 * why this stays simple (no knowledge graph, no vector index) and how
 * scope and privacy are enforced.
 */

import Link from 'next/link';
import { use, useState, type FormEvent } from 'react';

import type { SearchResultType, SearchResultView } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

const TYPE_LABELS: Record<SearchResultType, string> = {
  session: 'Session',
  evidence: 'Contribution',
  transcript: 'Transcript',
  summary: 'Summary',
  decision: 'Decision',
  commitment: 'Commitment',
  action_item: 'Action',
};

function resultHref(workspaceId: string, result: SearchResultView): string {
  const base = `/workspaces/${workspaceId}/sessions/${result.sessionId}`;
  switch (result.type) {
    case 'session':
      return base;
    case 'evidence':
      return `${base}/evidence/${result.entityId}`;
    case 'transcript':
      return `${base}/evidence/${result.evidenceId}`;
    case 'summary':
      return `${base}/summary`;
    case 'decision':
      return `${base}/outcomes/decisions/${result.entityId}`;
    case 'commitment':
      return `${base}/outcomes/commitments/${result.entityId}`;
    case 'action_item':
      return `${base}/outcomes/actions/${result.entityId}`;
    default:
      return base;
  }
}

export default function WorkspaceSearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = use(params);
  const { user } = useSession();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    setBusy(true);
    setError(null);
    try {
      const result = await api.search(workspaceId, trimmed, user);
      setResults(result.results);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/workspaces/${workspaceId}`} className="inline-block text-sm underline">
        ← Back to workspace
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Session titles and purposes, contributions, transcripts, summaries, decisions, commitments
          and actions — everything in this program you already have permission to read.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      <form onSubmit={(event) => void runSearch(event)} className="flex gap-2">
        <label htmlFor="searchQuery" className="sr-only">
          Search this workspace
        </label>
        <input
          id="searchQuery"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search this workspace…"
          minLength={2}
          className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
        />
        <Button type="submit" variant="primary" disabled={busy || query.trim().length < 2}>
          {busy ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {results !== null && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">No matches.</p>
          ) : (
            <ul className="space-y-3">
              {results.map((result, index) => (
                <li key={`${result.type}-${result.entityId ?? result.evidenceId ?? index}`}>
                  <Card className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-current px-2 py-0.5 text-xs font-medium">
                        {TYPE_LABELS[result.type]}
                      </span>
                      {result.aiGenerated && (
                        <span className="text-xs text-[var(--color-ink-muted)]">
                          AI-generated
                          {result.confirmed === true
                            ? ', confirmed'
                            : result.confirmed === false
                              ? ', unconfirmed'
                              : ''}
                        </span>
                      )}
                      {result.status !== null && (
                        <span className="text-xs text-[var(--color-ink-muted)]">
                          {result.status}
                        </span>
                      )}
                    </div>
                    <Link
                      href={resultHref(workspaceId, result)}
                      className="block font-medium underline"
                    >
                      {result.title}
                    </Link>
                    <p className="text-[var(--color-ink-muted)]">{result.snippet}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      In session: {result.sessionTitle}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
