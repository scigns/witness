import { App as CapacitorApp } from '@capacitor/app';
import { useEffect, useMemo, useState } from 'react';

import { createParticipantApiClient, type CaptureSession } from '@witness/participant-client';

import { ErrorNotice } from './components/ui.js';
import { parseJoinDeepLink } from './lib/deep-link.js';
import { resolveApiBaseUrl } from './lib/runtime-config.js';
import { createSecureCaptureSessionStore } from './lib/secure-capture-session-store.js';
import {
  clearCurrentSessionId,
  getCurrentSessionId,
  setCurrentSessionId,
} from './lib/current-session-pointer.js';
import { CaptureScreen } from './screens/capture-screen.js';
import { JoinScreen } from './screens/join-screen.js';

const API_BASE_URL = resolveApiBaseUrl({
  VITE_WITNESS_BUILD_PROFILE: import.meta.env['VITE_WITNESS_BUILD_PROFILE'],
  VITE_WITNESS_API_URL: import.meta.env['VITE_WITNESS_API_URL'],
});

/**
 * `NO_SESSION` / `SESSION_CONTEXT` / `JOINING` / `PARTICIPATING` /
 * `TOKEN_EXPIRED` — the subset of `state/app-state.ts`'s model this
 * top-level component actually branches on. `CaptureScreen` owns the
 * finer-grained `CONSENT_REQUIRED` / `OFFLINE` / `SUBMITTING` /
 * `SUBMITTED` states internally, since those never change which *screen*
 * is mounted, only what that screen renders.
 */
type Route =
  | { kind: 'loading' }
  | { kind: 'no_session' }
  | { kind: 'join'; token: string }
  | { kind: 'capture'; session: CaptureSession }
  | { kind: 'token_invalid' };

export function App() {
  const [route, setRoute] = useState<Route>({ kind: 'loading' });

  const participantClient = useMemo(() => createParticipantApiClient(API_BASE_URL), []);
  const secureStore = useMemo(() => createSecureCaptureSessionStore(), []);

  useEffect(() => {
    let cancelled = false;

    const applyDeepLink = (url: string) => {
      const parsed = parseJoinDeepLink(url);
      if (parsed !== null && !cancelled) {
        setRoute({ kind: 'join', token: parsed.token });
      }
    };

    void (async () => {
      const launch = await CapacitorApp.getLaunchUrl();
      if (launch?.url !== undefined) {
        applyDeepLink(launch.url);
        return;
      }
      if (cancelled) return;

      const currentSessionId = getCurrentSessionId();
      if (currentSessionId === null) {
        setRoute({ kind: 'no_session' });
        return;
      }
      const stored = await secureStore.load(currentSessionId);
      if (cancelled) return;
      setRoute(stored === null ? { kind: 'no_session' } : { kind: 'capture', session: stored });
    })();

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', (event) => {
      applyDeepLink(event.url);
    });

    return () => {
      cancelled = true;
      void listenerPromise.then((handle) => handle.remove());
    };
  }, [secureStore]);

  const handleJoined = (session: CaptureSession) => {
    setCurrentSessionId(session.sessionId);
    void secureStore.save(session).then(() => setRoute({ kind: 'capture', session }));
  };

  const handleTokenInvalid = () => {
    if (route.kind !== 'capture') return;
    const { sessionId } = route.session;
    void secureStore.clear(sessionId).then(() => {
      clearCurrentSessionId();
      setRoute({ kind: 'token_invalid' });
    });
  };

  switch (route.kind) {
    case 'loading':
      return null;

    case 'no_session':
      return (
        <div className="screen">
          <p role="status" className="center">
            Scan a facilitator&rsquo;s QR code or open a Witness join link to get started.
          </p>
        </div>
      );

    case 'token_invalid':
      return (
        <div className="screen">
          <ErrorNotice message="This session is no longer available on this device. Ask your facilitator for a new join link." />
        </div>
      );

    case 'join':
      return (
        <JoinScreen
          token={route.token}
          participantClient={participantClient}
          onJoined={handleJoined}
        />
      );

    case 'capture':
      return (
        <CaptureScreen
          session={route.session}
          participantClient={participantClient}
          onTokenInvalid={handleTokenInvalid}
        />
      );
  }
}
