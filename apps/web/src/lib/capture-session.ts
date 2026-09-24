/**
 * Where a participant's capture token lives between `/join/[token]` and
 * `/capture/[sessionId]` (Phase 5, Workstream 1.5-1.6) — and across a
 * refresh or a closed tab, since a workshop participant's phone screen may
 * lock mid-session.
 *
 * localStorage, not IndexedDB: this is a handful of short strings read
 * synchronously on every capture-page load, not a queue of structured
 * records — `offline-queue.ts`'s reasoning for IndexedDB does not apply
 * here. Never sent anywhere except as the `X-Witness-Capture-Token` header
 * the participant-capture API already expects.
 */

'use client';

const STORAGE_PREFIX = 'witness-capture-session:';

export interface CaptureSession {
  sessionId: string;
  workspaceId: string;
  participantId: string;
  captureToken: string;
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveCaptureSession(session: CaptureSession): void {
  if (!storageAvailable()) return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${session.sessionId}`, JSON.stringify(session));
}

export function loadCaptureSession(sessionId: string): CaptureSession | null {
  if (!storageAvailable()) return null;
  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as CaptureSession;
  } catch {
    return null;
  }
}

export function clearCaptureSession(sessionId: string): void {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(`${STORAGE_PREFIX}${sessionId}`);
}
