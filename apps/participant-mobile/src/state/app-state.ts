/**
 * The app's top-level state, computed fresh from primitive signals rather
 * than tracked as its own `useState` — so there is exactly one source of
 * truth (session/context/consent/network/submission signals) and no way
 * for the derived state to drift out of sync with them. Not necessarily
 * shown verbatim in the UI (`CaptureScreen` collapses several of these
 * into one visual "recorder" state), but every screen-level branch in this
 * app is driven by this function, not by ad hoc conditionals scattered
 * across components.
 */
export type AppState =
  | 'NO_SESSION'
  | 'SESSION_CONTEXT'
  | 'JOINING'
  | 'CONSENT_REQUIRED'
  | 'PARTICIPATING'
  | 'OFFLINE'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'SESSION_UNAVAILABLE'
  | 'TOKEN_EXPIRED';

export interface AppStateInputs {
  /** A join token is present (from a deep link this launch, or one being joined). */
  hasJoinToken: boolean;
  /** A capture session (post-join) is stored on this device for the current route. */
  hasStoredSession: boolean;
  /** `getSessionJoinContext` succeeded for the current join token. */
  joinContextLoaded: boolean;
  /** The join-link itself is usable right now (`status === 'active' && sessionStatus === 'open'`). */
  joinContextJoinable: boolean;
  /** A `joinSession` call is in flight. */
  joining: boolean;
  /** `getParticipantCaptureContext` succeeded for the stored capture token. */
  captureContextLoaded: boolean;
  /**
   * Set from an `ApiError.code` on the capture-context call — distinct from a
   * transient network failure, which is `isOnline: false` below, not this.
   */
  captureContextError: 'expired' | 'revoked' | 'unavailable' | null;
  needsConsent: boolean;
  isOnline: boolean;
  submitting: boolean;
  /** The most recent contribution has a backend-confirmed receipt (never optimistic). */
  submitted: boolean;
}

export function computeAppState(inputs: AppStateInputs): AppState {
  // A dead or revoked credential always wins — no signal computed from a
  // capture context that never successfully loaded should ever be trusted
  // over this, however stale/cached it might be.
  if (inputs.captureContextError === 'expired' || inputs.captureContextError === 'revoked') {
    return 'TOKEN_EXPIRED';
  }
  if (inputs.captureContextError === 'unavailable') {
    return 'SESSION_UNAVAILABLE';
  }

  if (inputs.hasStoredSession && inputs.captureContextLoaded) {
    // Once inside the capture flow, in-flight work and connectivity outrank
    // consent — a participant already mid-submission, or currently offline,
    // should never be interrupted by a consent prompt appearing underneath.
    if (inputs.submitting) return 'SUBMITTING';
    if (!inputs.isOnline) return 'OFFLINE';
    if (inputs.needsConsent) return 'CONSENT_REQUIRED';
    if (inputs.submitted) return 'SUBMITTED';
    return 'PARTICIPATING';
  }

  if (inputs.hasJoinToken || inputs.joinContextLoaded) {
    if (inputs.joining) return 'JOINING';
    return 'SESSION_CONTEXT';
  }

  return 'NO_SESSION';
}
