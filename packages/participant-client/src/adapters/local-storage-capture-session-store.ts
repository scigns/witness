/**
 * The web adapter for `CaptureSessionStore` — moved verbatim (behaviour
 * unchanged) from `apps/web/src/lib/capture-session.ts` during the
 * participant-client extraction. Not used by `apps/participant-mobile` —
 * see `capture-session.ts`'s file header for why a shipped native app needs
 * a different adapter.
 */

import type { CaptureSession, CaptureSessionStore } from '../capture-session.js';

const STORAGE_PREFIX = 'witness-capture-session:';

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function createLocalStorageCaptureSessionStore(): CaptureSessionStore {
  return {
    save(session: CaptureSession): Promise<void> {
      if (storageAvailable()) {
        window.localStorage.setItem(
          `${STORAGE_PREFIX}${session.sessionId}`,
          JSON.stringify(session),
        );
      }
      return Promise.resolve();
    },

    load(sessionId: string): Promise<CaptureSession | null> {
      if (!storageAvailable()) return Promise.resolve(null);
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
      if (raw === null) return Promise.resolve(null);
      try {
        return Promise.resolve(JSON.parse(raw) as CaptureSession);
      } catch {
        return Promise.resolve(null);
      }
    },

    clear(sessionId: string): Promise<void> {
      if (storageAvailable()) {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${sessionId}`);
      }
      return Promise.resolve();
    },
  };
}
