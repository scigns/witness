'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { IS_DEVELOPMENT_BUILD } from '@/lib/api';
import { safeReturnPath } from '@/lib/return-path';
import { ErrorNotice } from './ui';

/** Presentation guard only: the API remains authoritative for every request. */
export function ApplicationAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, errorMessage } = useAuth();
  const publicRoute = pathname === '/signin' || pathname.startsWith('/auth/');
  useEffect(() => {
    if (!IS_DEVELOPMENT_BUILD && !publicRoute && status === 'unauthenticated') {
      const target = safeReturnPath(pathname + window.location.search + window.location.hash);
      router.replace(`/signin?returnTo=${encodeURIComponent(target)}`);
    }
  }, [pathname, publicRoute, router, status]);
  if (IS_DEVELOPMENT_BUILD || publicRoute || status === 'authenticated') return <>{children}</>;
  if (status === 'suspended' || status === 'deactivated')
    return (
      <section className="space-y-4">
        <h1 className="text-3xl">Account access unavailable</h1>
        <p>Your account is {status}. Contact your organisation administrator or Witness support.</p>
        <a href="mailto:support@buildwithwitness.com" className="underline">
          Contact support
        </a>
      </section>
    );
  if (status === 'error')
    return <ErrorNotice message={errorMessage ?? 'Could not verify your session. Retrying…'} />;
  return (
    <p role="status">
      {status === 'loading' ? 'Checking your Witness session…' : 'Opening sign in…'}
    </p>
  );
}
