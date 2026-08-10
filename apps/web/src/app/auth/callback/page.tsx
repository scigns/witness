'use client';

/**
 * Where the browser lands after `GET /api/v1/auth/callback` completes a
 * sign-in and redirects here with `#token=<session>` — a URL fragment,
 * never sent to any server, read exactly once and handed to `useAuth`.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth';
import { ErrorNotice } from '@/components/ui';

export default function AuthCallbackPage() {
  const { setSessionToken } = useAuth();
  const router = useRouter();
  const [missingToken, setMissingToken] = useState(false);

  useEffect(() => {
    const match = /(?:^|#)token=([^&]+)/.exec(window.location.hash);

    if (match?.[1] === undefined) {
      setMissingToken(true);
      return;
    }

    setSessionToken(decodeURIComponent(match[1]));
    // Replace, not push — a back-navigation must not return to a URL that
    // once carried a session token in its fragment. The router — not
    // `window.location` — because it applies NEXT_PUBLIC_WITNESS_BASE_PATH;
    // a raw `window.location.replace('/')` lands at the origin's true root,
    // which under a path deployment is a different site, not this app.
    router.replace('/');
  }, [router, setSessionToken]);

  return (
    <div className="mx-auto max-w-md">
      {missingToken ? (
        <ErrorNotice message="No sign-in token was returned. Try signing in again." />
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">Completing sign-in…</p>
      )}
    </div>
  );
}
