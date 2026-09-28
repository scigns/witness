import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  newClientRequestId,
  type CaptureSession,
  type ParticipantApiClient,
} from '@witness/participant-client';
import type { SessionJoinContextView } from '@witness/contracts';

import { Card, ErrorNotice, Loading } from '../components/ui.js';

const GOVERNANCE_LABELS: Record<SessionJoinContextView['governanceMode'], string> = {
  invited_only: 'Open to people already invited into this workspace',
  verified_guest: 'Open to anyone signed in to Witness',
  pseudonymous: 'Open to anyone — choose a name to contribute under',
  anonymous: 'Open to anyone — no name or sign-in needed',
};

/**
 * The mobile equivalent of `apps/web`'s `/join/[token]` page — same
 * two-step context-then-join flow, same governance-mode copy. Deliberately
 * has no sign-in step of its own: `requiresSignIn` sessions
 * (`verified_guest`/`invited_only`) are out of this v1's reach on a device
 * with no Witness account UI at all (ADR-0031's product boundary), so this
 * screen states that plainly rather than attempting a native OIDC flow.
 */
export function JoinScreen({
  token,
  participantClient,
  onJoined,
}: {
  token: string;
  participantClient: ParticipantApiClient;
  onJoined: (session: CaptureSession) => void;
}) {
  const [context, setContext] = useState<SessionJoinContextView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await participantClient.getSessionJoinContext(token);
      setContext(result);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  }, [token, participantClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async () => {
    setBusy(true);
    setJoinError(null);
    try {
      const result = await participantClient.joinSession(token, {
        clientRequestId: newClientRequestId(),
        displayName: displayName.trim() === '' ? undefined : displayName.trim(),
      });
      onJoined({
        sessionId: result.sessionId,
        workspaceId: result.workspaceId,
        participantId: result.participantId,
        captureToken: result.captureToken,
      });
    } catch (caught) {
      setJoinError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  if (loadError !== null) {
    return (
      <div className="screen">
        <ErrorNotice message={loadError} />
      </div>
    );
  }

  if (context === null) {
    return (
      <div className="screen">
        <Loading />
      </div>
    );
  }

  if (context.requiresSignIn) {
    return (
      <div className="screen">
        <ErrorNotice message="This session requires signing in to Witness. Open the link on the web to join, then come back to this app." />
      </div>
    );
  }

  const needsDisplayName = context.requiresDisplayName;
  const canJoin = !needsDisplayName || displayName.trim() !== '';
  const notJoinable = context.status !== 'active' || context.sessionStatus !== 'open';

  return (
    <div className="screen">
      <div className="center">
        <p className="muted">{context.organisationName}</p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0.25rem 0' }}>
          {context.sessionTitle}
        </h1>
        <p className="muted">{context.workspaceName}</p>
      </div>

      <Card>
        <p>
          Facilitated by <strong>{context.facilitatorDisplayName}</strong>
        </p>
        <p className="muted" style={{ fontSize: '0.75rem' }}>
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>Your name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How should we show your contributions?"
                maxLength={200}
                autoFocus
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => void join()}
            disabled={busy || !canJoin}
            className="button-primary"
          >
            {busy ? 'Joining…' : 'Join session'}
          </button>
        </>
      )}
    </div>
  );
}
