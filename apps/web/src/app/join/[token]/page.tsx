'use client';

/**
 * The QR/link landing page a participant reaches by scanning a facilitator's
 * QR code or opening a shared join link (Phase 5, Workstream 1.5-1.6).
 *
 * Deliberately outside the application `Shell` (see `components/shell.tsx`'s
 * `BARE_ROUTE_PREFIXES`) — no admin nav, no preview banner, nothing but the
 * session someone is being asked to join. Full context before any action,
 * same discipline as the workspace-invitation landing page: who is running
 * this, what session, and what governance mode applies, are all shown
 * before a sign-in prompt or a name field ever appears.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';

import type { SessionJoinContextView } from '@witness/contracts';

import { api, ApiError, authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { saveCaptureSession } from '@/lib/capture-session';
import { Card, ErrorNotice } from '@/components/ui';

function newClientRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

const GOVERNANCE_LABELS: Record<SessionJoinContextView['governanceMode'], string> = {
  invited_only: 'Open to people already invited into this workspace',
  verified_guest: 'Open to anyone signed in to Witness',
  pseudonymous: 'Open to anyone — choose a name to contribute under',
  anonymous: 'Open to anyone — no name or sign-in needed',
};

export default function JoinSessionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { status, currentUser } = useAuth();

  const [context, setContext] = useState<SessionJoinContextView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getSessionJoinContext(token);
      setContext(result);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async () => {
    setBusy(true);
    setJoinError(null);
    try {
      const result = await api.joinSession(token, {
        clientRequestId: newClientRequestId(),
        displayName: displayName.trim() === '' ? undefined : displayName.trim(),
      });
      saveCaptureSession({
        sessionId: result.sessionId,
        workspaceId: result.workspaceId,
        participantId: result.participantId,
        captureToken: result.captureToken,
      });
      router.push(`/capture/${result.sessionId}`);
    } catch (caught) {
      setJoinError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  if (loadError !== null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <ErrorNotice message={loadError} />
        <Link href="/" className="text-sm underline">
          ← Return to Witness
        </Link>
      </div>
    );
  }

  if (context === null) {
    return (
      <p
        role="status"
        className="flex min-h-dvh items-center justify-center text-[var(--color-ink-muted)]"
      >
        Loading…
      </p>
    );
  }

  const needsSignIn = context.requiresSignIn && status !== 'authenticated';
  const needsDisplayName = context.requiresDisplayName;
  const canJoin = !needsSignIn && (!needsDisplayName || displayName.trim() !== '');
  const notJoinable = context.status !== 'active' || context.sessionStatus !== 'open';

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-1 text-center">
        <p className="text-sm text-[var(--color-ink-muted)]">{context.organisationName}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {context.sessionTitle}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">{context.workspaceName}</p>
      </div>

      <Card className="space-y-3 text-center">
        <p className="text-sm text-[var(--color-ink)]">
          Facilitated by <strong>{context.facilitatorDisplayName}</strong>
        </p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          {GOVERNANCE_LABELS[context.governanceMode]}
        </p>
      </Card>

      {notJoinable ? (
        <ErrorNotice
          message={
            context.status !== 'active'
              ? 'This join link is no longer active. Ask the facilitator for a new one.'
              : 'This session is not open for joining right now.'
          }
        />
      ) : (
        <>
          {joinError !== null && <ErrorNotice message={joinError} />}

          {needsDisplayName && (
            <label className="space-y-1 text-sm">
              <span className="font-medium text-[var(--color-ink)]">Your name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How should we show your contributions?"
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-3 text-base"
                maxLength={200}
                autoFocus
              />
            </label>
          )}

          {needsSignIn ? (
            <div className="space-y-2 text-center">
              <a
                href={authApi.loginUrl()}
                className="inline-flex w-full items-center justify-center rounded bg-[var(--color-accent)] px-4 py-4 text-base font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
              >
                Sign in to join
              </a>
              <p className="text-xs text-[var(--color-ink-muted)]">
                After signing in, return to this link to join.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void join()}
              disabled={busy || !canJoin}
              className="w-full rounded bg-[var(--color-accent)] px-4 py-4 text-lg font-semibold text-[var(--color-accent-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Joining…' : 'Join session'}
            </button>
          )}

          {currentUser !== null && context.requiresSignIn && (
            <p className="text-center text-xs text-[var(--color-ink-muted)]">
              Joining as {currentUser.displayName}
            </p>
          )}
        </>
      )}
    </div>
  );
}
