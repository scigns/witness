import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    set: vi.fn(async (key: string, data: unknown) => {
      store.set(key, data);
    }),
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    remove: vi.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed;
    }),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

const { createSecureCaptureSessionStore } = await import('./secure-capture-session-store.js');

describe('createSecureCaptureSessionStore', () => {
  beforeEach(() => {
    store.clear();
  });

  it('round-trips a saved session', async () => {
    const secureStore = createSecureCaptureSessionStore();
    await secureStore.save({
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      participantId: 'participant-1',
      captureToken: 'capture-token-1',
    });

    await expect(secureStore.load('session-1')).resolves.toEqual({
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      participantId: 'participant-1',
      captureToken: 'capture-token-1',
    });
  });

  it('returns null for a session that was never saved', async () => {
    const secureStore = createSecureCaptureSessionStore();
    await expect(secureStore.load('never-saved')).resolves.toBeNull();
  });

  it('clear() removes the session, and a subsequent load returns null', async () => {
    const secureStore = createSecureCaptureSessionStore();
    await secureStore.save({
      sessionId: 'session-2',
      workspaceId: 'w',
      participantId: 'p',
      captureToken: 't',
    });
    await secureStore.clear('session-2');
    await expect(secureStore.load('session-2')).resolves.toBeNull();
  });

  it('fails safely on malformed stored data rather than returning it or throwing', async () => {
    const secureStore = createSecureCaptureSessionStore();
    store.set('witness-capture-session:session-3', { unexpected: 'shape' });
    await expect(secureStore.load('session-3')).resolves.toBeNull();

    store.set('witness-capture-session:session-4', 'just a plain string');
    await expect(secureStore.load('session-4')).resolves.toBeNull();
  });

  it('scopes sessions by id — loading one session never returns another', async () => {
    const secureStore = createSecureCaptureSessionStore();
    await secureStore.save({
      sessionId: 'session-a',
      workspaceId: 'wa',
      participantId: 'pa',
      captureToken: 'ta',
    });
    await secureStore.save({
      sessionId: 'session-b',
      workspaceId: 'wb',
      participantId: 'pb',
      captureToken: 'tb',
    });

    await expect(secureStore.load('session-a')).resolves.toMatchObject({ captureToken: 'ta' });
    await expect(secureStore.load('session-b')).resolves.toMatchObject({ captureToken: 'tb' });
  });
});
