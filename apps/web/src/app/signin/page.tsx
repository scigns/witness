'use client';

/**
 * Sign-in entry point (BUILD_ROADMAP.md Milestone 1.3, Authentication).
 *
 * A single action, not a form — Witness never collects a password. Clicking
 * through leaves the application entirely for the identity provider's own
 * sign-in screen; the browser returns to `/auth/callback` only after that
 * provider has authenticated the person.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui';

export default function SignInPage() {
  const { status, currentUser } = useAuth();
  const router = useRouter();
  const [developmentProfile, setDevelopmentProfile] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && currentUser !== null) {
      // The router, not `window.location` — it applies
      // NEXT_PUBLIC_WITNESS_BASE_PATH; a raw href would land at the origin's
      // true root, which under a path deployment is a different site.
      router.replace('/');
    }
  }, [status, currentUser, router]);

  useEffect(() => {
    // Best-effort — a failed health check here just means the notice below
    // doesn't render, never that sign-in is blocked.
    api
      .health()
      .then((health) => setDevelopmentProfile(health.profile === 'development'))
      .catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      {developmentProfile && (
        <div
          role="status"
          className="rounded border border-[var(--color-line)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm"
        >
          <strong>Development identity provider active.</strong> This instance signs you in against
          a local, unverified test identity — not a real Keycloak. Never exposed outside the
          development profile.
        </div>
      )}
      <Card className="space-y-4">
        <p className="text-sm text-[var(--color-ink-muted)]">
          Sign in with your organisation&apos;s identity provider. Witness never sees or stores your
          password.
        </p>
        <a
          href={authApi.loginUrl()}
          className="inline-flex items-center justify-center rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
        >
          Sign in
        </a>
        <div className="flex flex-wrap gap-4 text-sm">
          <a href={authApi.forgotPasswordUrl()} className="underline">
            Forgot password?
          </a>
          <a href={authApi.loginUrl()} className="underline">
            Have an invitation? Activate your account
          </a>
          <a
            href="mailto:support@buildwithwitness.com?subject=Witness%20access%20request"
            className="underline"
          >
            Need access? Request access
          </a>
        </div>
      </Card>
    </div>
  );
}
