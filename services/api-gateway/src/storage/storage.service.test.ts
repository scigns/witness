/**
 * `objectKey()` and `resolveStoredContent()` are the two functions every
 * StoragePort consumer goes through — see storage.service.ts's file header.
 * A bug in either is a bug in every consumer at once, which is exactly why
 * these are tested directly rather than only indirectly through
 * evidence-attachment.service.test.ts and resources.service.ts's callers.
 */

import { describe, expect, it } from 'vitest';

import type { StoragePort } from './storage.port.js';
import { objectKey, resolveStoredContent } from './storage.service.js';

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const ORG_2 = '22222222-2222-4222-8222-222222222222';

describe('objectKey', () => {
  it('prefixes by organisation, then kind, then id', () => {
    expect(objectKey({ organisationId: ORG_1, kind: 'evidence-attachment', id: 'abc' })).toBe(
      `${ORG_1}/evidence-attachment/abc`,
    );
  });

  it('ATTACK — two organisations never produce the same key for the same id and kind', () => {
    const a = objectKey({ organisationId: ORG_1, kind: 'resource', id: 'same-id' });
    const b = objectKey({ organisationId: ORG_2, kind: 'resource', id: 'same-id' });
    expect(a).not.toBe(b);
  });
});

function fakeStorage(objects: Record<string, { content: Buffer; contentType: string }>) {
  return {
    put: async () => {},
    get: async (key: string) => objects[key] ?? null,
    delete: async () => {},
  } as unknown as StoragePort;
}

describe('resolveStoredContent', () => {
  it('returns the inline content column when storageKey is null', async () => {
    const content = Buffer.from('inline bytes');
    const result = await resolveStoredContent(null, { content, storageKey: null });
    expect(result).toBe(content);
  });

  it('fetches from StoragePort when storageKey is set', async () => {
    const content = Buffer.from('object store bytes');
    const storage = fakeStorage({ 'org/kind/id': { content, contentType: 'audio/wav' } });
    const result = await resolveStoredContent(storage, {
      content: null,
      storageKey: 'org/kind/id',
    });
    expect(result).toBe(content);
  });

  it('throws when storageKey is set but StoragePort is not configured', async () => {
    await expect(
      resolveStoredContent(null, { content: null, storageKey: 'org/kind/id' }),
    ).rejects.toThrow(/not configured/i);
  });

  it('throws when storageKey is set but the object is missing from the store', async () => {
    const storage = fakeStorage({});
    await expect(
      resolveStoredContent(storage, { content: null, storageKey: 'org/kind/missing' }),
    ).rejects.toThrow(/missing from storage/i);
  });

  it('throws when neither content nor storageKey is set — a row that should never exist', async () => {
    await expect(resolveStoredContent(null, { content: null, storageKey: null })).rejects.toThrow(
      /no content in either storage/i,
    );
  });
});
