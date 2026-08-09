'use client';

import { useEffect } from 'react';

/**
 * Client error boundary.
 *
 * Shows the message but never the stack. A stack trace rendered in the browser
 * leaks file paths and internal structure to anyone who can reach the page, and
 * it tells the user nothing they can act on.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-[var(--color-ink-muted)]">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)]"
      >
        Try again
      </button>
    </div>
  );
}
