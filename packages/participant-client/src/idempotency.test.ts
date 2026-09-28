import { describe, expect, it } from 'vitest';

import { newClientRequestId } from './idempotency.js';

describe('newClientRequestId', () => {
  it('generates a well-formed, non-empty identifier', () => {
    const id = newClientRequestId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates a distinct id on every call — never reused unless the caller reuses it deliberately', () => {
    const a = newClientRequestId();
    const b = newClientRequestId();
    expect(a).not.toBe(b);
  });
});
