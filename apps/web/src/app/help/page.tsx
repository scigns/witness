'use client';

/**
 * Help & Knowledge (ADR-0032). Every result rendered here already passed
 * server-side role and entitlement filtering before this page ever saw it —
 * this component performs no filtering of its own, by design: a second,
 * client-side filter here would invite exactly the drift ADR-0032 warns
 * against between what the server decided and what the UI shows.
 */

import { useState } from 'react';

import type { HelpSearchResultView } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, EmptyState, ErrorNotice } from '@/components/ui';

export default function HelpPage() {
  const { user, ready } = useSession();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HelpSearchResultView[] | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSearch(submitted: string): Promise<void> {
    if (!ready || user === null || submitted.trim() === '') return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.searchHelp(submitted, user);
      setResults(response.results);
      setAppVersion(response.appVersion);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Help &amp; Knowledge</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Ask &ldquo;how do I…&rdquo;, &ldquo;what does this mean…&rdquo;, or &ldquo;what can my
          role do…&rdquo;. Results are scoped to your role and to the version of Witness you are
          running{appVersion !== null ? ` (${appVersion})` : ''} — never to a version you are not
          on.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
      >
        <label htmlFor="help-query" className="sr-only">
          Search help
        </label>
        <input
          id="help-query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="How do I find out what was decided?"
          className="flex-1 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
        >
          Search
        </button>
      </form>

      {error !== null && <ErrorNotice message={error} />}

      {loading ? (
        <Card>
          <p role="status" className="text-[var(--color-ink-muted)]">
            Searching…
          </p>
        </Card>
      ) : results === null ? null : results.length === 0 ? (
        <EmptyState
          title="No results"
          body="Nothing matched that search for your role on this version of Witness. Try different words, or ask an administrator if you expect a restricted answer."
        />
      ) : (
        <ul className="space-y-4">
          {results.map((result) => (
            <li key={result.chunkId}>
              <Card>
                <h2 className="text-lg font-medium">{result.title}</h2>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{result.snippet}</p>
                <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                  {result.sourcePath}
                  {result.sourceAnchor !== null ? `#${result.sourceAnchor}` : ''} · doc{' '}
                  {result.docVersion} · updated{' '}
                  {new Date(result.lastUpdatedAt).toLocaleDateString()}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
