/**
 * Which session's `CaptureSession` to load from the secure store on the
 * next launch. Deliberately **not** secure storage itself — a session id
 * is not a credential (the capture token that goes with it is, and lives
 * only in `secure-capture-session-store.ts`'s Keychain/Keystore-backed
 * store). Ordinary `localStorage` is the right tool for this one
 * non-sensitive pointer, same reasoning `apps/web`'s own
 * `capture-session.ts` gives for using it over IndexedDB.
 */

const POINTER_KEY = 'witness-current-session-id';

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getCurrentSessionId(): string | null {
  if (!storageAvailable()) return null;
  return window.localStorage.getItem(POINTER_KEY);
}

export function setCurrentSessionId(sessionId: string): void {
  if (!storageAvailable()) return;
  window.localStorage.setItem(POINTER_KEY, sessionId);
}

export function clearCurrentSessionId(): void {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(POINTER_KEY);
}
