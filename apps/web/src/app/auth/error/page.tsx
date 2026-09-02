'use client';

/**
 * Where the browser lands when `GET /api/v1/auth/callback` denies a sign-in.
 * `reason` is a small closed set the backend chose deliberately — never a
 * raw error message — so this page can explain the denial in plain language
 * without risking a leaked internal detail.
 */

import { use } from 'react';
import Link from 'next/link';

import { ErrorNotice } from '@/components/ui';

const REASON_MESSAGES: Record<string, string> = {
  unknown_identity:
    'This account does not yet have access to Witness. If your organisation invited you, use the invitation link. Otherwise, request access from your organisation administrator.',
  account_suspended: 'This account has been suspended. Contact an administrator.',
  account_deactivated: 'This account has been deactivated. Contact an administrator.',
  invalid_callback: 'The sign-in could not be completed. Please try again.',
};

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = use(searchParams);
  const message =
    (reason !== undefined && REASON_MESSAGES[reason]) || REASON_MESSAGES['invalid_callback']!;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sign-in failed</h1>
      <ErrorNotice message={message} />
      <Link href="/signin" className="text-sm underline">
        Try again
      </Link>
    </div>
  );
}
