/**
 * Where a participant's capture token lives between joining and capturing,
 * and across a refresh/closed-app — a workshop participant's screen may
 * lock mid-session. This module is deliberately just the port
 * (ADR-0003) — `save`/`load`/`clear` against an abstract store — because
 * *what* backs that store is a genuinely different decision on each
 * platform this client ships to:
 *
 *   - `apps/web` (a browser tab) uses `adapters/local-storage-capture-session-store.ts`
 *     — a handful of short strings, read synchronously, never sent anywhere
 *     except as the `X-Witness-Capture-Token` header. Acceptable for a
 *     browser session the same way it always was.
 *   - `apps/participant-mobile` (a shipped native app, per ADR-0031) must
 *     use an OS-backed secure store (iOS Keychain / Android Keystore) —
 *     see `docs/mobile/SECURE_TOKEN_STORAGE.md` for why `localStorage`-
 *     equivalent storage is not acceptable there: a lost/stolen phone is a
 *     different threat model than a browser tab.
 *
 * The interface is async throughout so both backends satisfy it without a
 * platform-specific caller needing to know which one it got.
 */

export interface CaptureSession {
  sessionId: string;
  workspaceId: string;
  participantId: string;
  captureToken: string;
}

/** The port every platform-specific capture-session store implements. */
export interface CaptureSessionStore {
  save(session: CaptureSession): Promise<void>;
  load(sessionId: string): Promise<CaptureSession | null>;
  clear(sessionId: string): Promise<void>;
}
