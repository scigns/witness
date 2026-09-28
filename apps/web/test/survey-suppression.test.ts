import { describe, expect, it } from 'vitest';

import { isSuppressed, suppress, type MinimalStorage } from '../src/lib/survey-suppression';

function mockStorage(): MinimalStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('survey suppression', () => {
  it('is not suppressed when nothing has been recorded', () => {
    const storage = mockStorage();
    expect(isSuppressed('evidence_capture', Date.now(), storage)).toBe(false);
  });

  it('is suppressed immediately after suppress()', () => {
    const storage = mockStorage();
    const now = Date.now();
    suppress('evidence_capture', now, storage);
    expect(isSuppressed('evidence_capture', now, storage)).toBe(true);
  });

  it('remains suppressed just under 14 days later', () => {
    const storage = mockStorage();
    const now = Date.now();
    suppress('facilitation', now, storage);
    expect(isSuppressed('facilitation', now + 14 * DAY_MS - 1000, storage)).toBe(true);
  });

  it('is no longer suppressed after 14 days', () => {
    const storage = mockStorage();
    const now = Date.now();
    suppress('review', now, storage);
    expect(isSuppressed('review', now + 14 * DAY_MS + 1000, storage)).toBe(false);
  });

  it('scopes suppression per product area — suppressing one never suppresses another', () => {
    const storage = mockStorage();
    const now = Date.now();
    suppress('evidence_capture', now, storage);
    expect(isSuppressed('facilitation', now, storage)).toBe(false);
    expect(isSuppressed('review', now, storage)).toBe(false);
    expect(isSuppressed('reporting', now, storage)).toBe(false);
  });

  it('ignores a malformed stored value rather than throwing', () => {
    const storage = mockStorage();
    storage.setItem('witness:survey-suppressed:evidence_capture', 'not-a-number');
    expect(isSuppressed('evidence_capture', Date.now(), storage)).toBe(false);
  });
});
