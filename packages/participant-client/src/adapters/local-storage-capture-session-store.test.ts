/**
 * Also proves the "malformed stored state fails safely" invariant: a
 * corrupted localStorage entry (hand-edited, or written by a future
 * incompatible version) must resolve to "no session," never throw and
 * never resurrect a partial/garbage credential.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { createLocalStorageCaptureSessionStore } from './local-storage-capture-session-store.js';
import type { CaptureSession } from '../capture-session.js';

function fakeSession(overrides: Partial<CaptureSession> = {}): CaptureSession {
  return {
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    participantId: 'participant-1',
    captureToken: 'raw-token',
    ...overrides,
  };
}

describe('createLocalStorageCaptureSessionStore', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      localStorage: (() => {
        const map = new Map<string, string>();
        return {
          getItem: (key: string) => map.get(key) ?? null,
          setItem: (key: string, value: string) => {
            map.set(key, value);
          },
          removeItem: (key: string) => {
            map.delete(key);
          },
        };
      })(),
    };
  });

  it('round-trips a saved session', async () => {
    const store = createLocalStorageCaptureSessionStore();
    const session = fakeSession();

    await store.save(session);

    await expect(store.load('session-1')).resolves.toEqual(session);
  });

  it('returns null for a session that was never saved', async () => {
    const store = createLocalStorageCaptureSessionStore();
    await expect(store.load('never-saved')).resolves.toBeNull();
  });

  it('clear() removes the session — a subsequent load() returns null', async () => {
    const store = createLocalStorageCaptureSessionStore();
    await store.save(fakeSession());

    await store.clear('session-1');

    await expect(store.load('session-1')).resolves.toBeNull();
  });

  it('fails safely (returns null, never throws) on malformed stored JSON', async () => {
    const store = createLocalStorageCaptureSessionStore();
    (globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(
      'witness-capture-session:session-1',
      'not-valid-json{{{',
    );

    await expect(store.load('session-1')).resolves.toBeNull();
  });

  it('scopes storage per sessionId — saving one session never clobbers or leaks into another', async () => {
    const store = createLocalStorageCaptureSessionStore();
    await store.save(fakeSession({ sessionId: 'session-a', captureToken: 'token-a' }));
    await store.save(fakeSession({ sessionId: 'session-b', captureToken: 'token-b' }));

    await expect(store.load('session-a')).resolves.toMatchObject({ captureToken: 'token-a' });
    await expect(store.load('session-b')).resolves.toMatchObject({ captureToken: 'token-b' });
  });
});
