'use client';

/**
 * The invitation landing page an external collaborator (facilitator,
 * reviewer, or Knowledge Steward from another organisation) reaches from
 * their invitation email — ADR-0028.
 *
 * Full context before any action, always (PART 7 of the originating
 * request): who invited you, which organisation, which programme, what
 * role, and what you're participating as, are all shown before a sign-in
 * prompt ever appears — never "authenticate first, discover later what you
 * accepted".
 *
 * A signed-out invitee who clicks "Sign in to accept" is returned to this
 * same invitation after the OIDC round-trip (Track C, ADR-0030's `returnTo`
 * — this page previously had to warn that this did not happen; it now does).
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { WorkspaceInvitationContextView } from '@witness/contracts';

import { api, ApiError, authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AffiliationTag, Button, Card, ErrorNotice } from '@/components/ui';

// Manually prefixed, like `manifest.ts`/`service-worker.tsx` — this path is
// consumed server-side as a plain redirect target after the OIDC round-trip,
// not routed through Next's own basePath-aware router.
const BASE_PATH = process.env['NEXT_PUBLIC_WITNESS_BASE_PATH'] ?? '';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function WorkspaceInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { status, currentUser } = useAuth();

  const [context, setContext] = useState<WorkspaceInvitationContextView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'accepted' | 'declined' | null>(null);
  const [acceptedWorkspaceId, setAcceptedWorkspaceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getWorkspaceInvitationContext(token);
      setContext(result);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await api.acceptWorkspaceInvitation(token);
      setOutcome('accepted');
      setAcceptedWorkspaceId(result.workspaceId);
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await api.declineWorkspaceInvitation(token);
      setOutcome('declined');
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loadError !== null) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <ErrorNotice message={loadError} />
        <Link href="/" className="text-sm underline">
          ← Return to Witness
        </Link>
      </div>
    );
  }

  if (context === null) {
    return (
      <p role="status" className="mx-auto max-w-md text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (outcome === 'accepted') {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">You&rsquo;re in</h1>
        <Card className="space-y-3">
          <p className="text-sm text-[var(--color-ink)]">
            You now have {context.roleLabel.toLowerCase()} access to{' '}
            <strong>{context.workspaceName}</strong>, on behalf of {context.organisationName}.
          </p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            You have not been made a member of {context.organisationName} — your access is scoped to
            this one programme.
          </p>
          {acceptedWorkspaceId !== null && (
            <Link
              href={`/workspaces/${acceptedWorkspaceId}`}
              className="inline-flex items-center justify-center rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
            >
              Open {context.workspaceName}
            </Link>
          )}
        </Card>
      </div>
    );
  }

  if (outcome === 'declined') {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Invitation declined</h1>
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            You have declined this invitation. No access was granted.
          </p>
        </Card>
      </div>
    );
  }

  const alreadyResolved = context.status !== 'pending';
  const emailMatches =
    currentUser !== null &&
    currentUser.email.trim().toLowerCase() === context.invitedEmail.trim().toLowerCase();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {context.organisationName} has invited you to participate in
      </h1>
      <p className="text-xl font-semibold text-[var(--color-ink)]">{context.workspaceName}</p>

      <Card className="space-y-3">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-ink-muted)]">Role</dt>
            <dd className="font-medium text-[var(--color-ink)]">{context.roleLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-ink-muted)]">Invited by</dt>
            <dd className="font-medium text-[var(--color-ink)]">{context.inviterDisplayName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-ink-muted)]">Participating as</dt>
            <dd className="font-medium text-[var(--color-ink)]">
              <AffiliationTag type={context.affiliationType} label={context.affiliationLabel} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-ink-muted)]">Invited email</dt>
            <dd className="font-medium text-[var(--color-ink)]">{context.invitedEmail}</dd>
          </div>
        </dl>

        {context.workspaceDescription !== null && (
          <p className="border-t border-[var(--color-line)] pt-3 text-sm text-[var(--color-ink-muted)]">
            {context.workspaceDescription}
          </p>
        )}

        {context.message !== null && (
          <p className="border-t border-[var(--color-line)] pt-3 text-sm text-[var(--color-ink)]">
            &ldquo;{context.message}&rdquo;
          </p>
        )}

        <p className="border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-ink-muted)]">
          {alreadyResolved
            ? `This invitation is ${context.status} and can no longer be accepted.`
            : `This invitation expires ${formatDate(context.expiresAt)}.`}
        </p>
      </Card>

      <p className="text-sm text-[var(--color-ink-muted)]">
        You will not become a member of {context.organisationName}. Your access, if you accept,
        applies only to {context.workspaceName}.
      </p>

      {actionError !== null && <ErrorNotice message={actionError} />}

      {alreadyResolved ? null : status === 'authenticated' && !emailMatches ? (
        <ErrorNotice
          message={`This invitation was sent to ${context.invitedEmail}. You're signed in as ${
            currentUser?.email ?? 'a different account'
          }. Sign out and sign in with the invited email to accept, or decline below.`}
        />
      ) : status === 'authenticated' && emailMatches ? (
        <div className="flex gap-3">
          <Button variant="primary" onClick={() => void accept()} disabled={busy}>
            Accept invitation
          </Button>
          <Button variant="secondary" onClick={() => void decline()} disabled={busy}>
            Decline
          </Button>
        </div>
      ) : status === 'loading' ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Checking sign-in…</p>
      ) : (
        <div className="space-y-3">
          <a
            href={authApi.loginUrl(`${BASE_PATH}/workspace-invitations/${token}`)}
            className="inline-flex items-center justify-center rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
          >
            Sign in to accept
          </a>
          <p className="text-xs text-[var(--color-ink-muted)]">
            You&rsquo;ll be brought back here automatically after signing in.
          </p>
          <Button variant="secondary" onClick={() => void decline()} disabled={busy}>
            Decline without signing in
          </Button>
        </div>
      )}
    </div>
  );
}
