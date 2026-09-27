/**
 * `offline-queue.ts` had zero test coverage anywhere in the repository
 * before this extraction (ADR-0031's own audit finding,
 * `docs/mobile/WITNESS_PARTICIPATE_CURRENT_STATE.md` §6) — the single
 * largest gap in what the whole offline/retry promise actually rests on.
 * `fake-indexeddb` gives a real (if in-memory) `IDBFactory` so these tests
 * exercise the actual IndexedDB code path, not a hand-rolled substitute.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  enqueue,
  isNetworkFailure,
  listAll,
  listForParticipantSession,
  remove,
  updateStatus,
  type QueuedParticipantContribution,
} from './offline-queue.js';

function fakeParticipantItem(
  overrides: Partial<QueuedParticipantContribution> = {},
): QueuedParticipantContribution {
  return {
    kind: 'participant',
    id: 'client-request-1',
    sessionId: 'session-1',
    captureToken: 'capture-token-1',
    body: {
      evidenceType: 'audio_note',
      title: 'Contribution',
      content: 'placeholder',
      clientRequestId: 'client-request-1',
    },
    attachment: null,
    status: 'pending',
    createdAt: Date.now(),
    lastError: null,
    ...overrides,
  };
}

// fake-indexeddb persists across tests in the same module unless the
// database is deleted — reset by removing every item so each test starts
// from an empty queue, matching a fresh device.
beforeEach(async () => {
  const all = await listAll();
  await Promise.all(all.map((item) => remove(item.id)));
});

describe('enqueue / one clientRequestId persists across retries', () => {
  it('re-enqueuing the same id overwrites rather than duplicating the item', async () => {
    const item = fakeParticipantItem();
    await enqueue(item);
    await enqueue({ ...item, status: 'syncing' });

    const all = await listForParticipantSession('session-1');
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe('syncing');
  });

  it('two distinct clientRequestIds produce two distinct queued items', async () => {
    await enqueue(fakeParticipantItem({ id: 'a' }));
    await enqueue(fakeParticipantItem({ id: 'b' }));

    const all = await listForParticipantSession('session-1');
    expect(all.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });
});

describe('queue state transitions are deterministic', () => {
  it('moves pending -> syncing -> synced on a successful retry', async () => {
    await enqueue(fakeParticipantItem({ status: 'pending' }));

    await updateStatus('client-request-1', 'syncing');
    let [item] = await listForParticipantSession('session-1');
    expect(item?.status).toBe('syncing');

    await updateStatus('client-request-1', 'synced');
    [item] = await listForParticipantSession('session-1');
    expect(item?.status).toBe('synced');
    expect(item?.lastError).toBeNull();
  });

  it('an unrecoverable error moves the item to failed, never synced — it must never pretend to be submitted', async () => {
    await enqueue(fakeParticipantItem({ status: 'pending' }));
    await updateStatus('client-request-1', 'syncing');

    await updateStatus('client-request-1', 'failed', 'Server rejected the request.');

    const [item] = await listForParticipantSession('session-1');
    expect(item?.status).toBe('failed');
    expect(item?.status).not.toBe('synced');
    expect(item?.lastError).toBe('Server rejected the request.');
  });

  it('updating a non-existent id is a no-op, not an error', async () => {
    await expect(updateStatus('does-not-exist', 'synced')).resolves.toBeUndefined();
  });
});

describe('remove', () => {
  it('a removed item no longer appears in any listing', async () => {
    await enqueue(fakeParticipantItem());
    await remove('client-request-1');

    expect(await listForParticipantSession('session-1')).toHaveLength(0);
  });
});

describe('listForParticipantSession scoping', () => {
  it('never returns an item belonging to a different session', async () => {
    await enqueue(fakeParticipantItem({ id: 'a', sessionId: 'session-1' }));
    await enqueue(fakeParticipantItem({ id: 'b', sessionId: 'session-2' }));

    const forSessionOne = await listForParticipantSession('session-1');
    expect(forSessionOne.map((i) => i.id)).toEqual(['a']);
  });
});

describe('isNetworkFailure', () => {
  it('is true only for a genuine network failure (status 0), never a real server response', () => {
    expect(isNetworkFailure({ status: 0 })).toBe(true);
    expect(isNetworkFailure({ status: 500 })).toBe(false);
    expect(isNetworkFailure({ status: 429 })).toBe(false);
    expect(isNetworkFailure(new Error('unrelated'))).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });
});
