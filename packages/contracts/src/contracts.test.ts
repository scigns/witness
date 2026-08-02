/**
 * Contract tests.
 *
 * These assert the shape of the public API surface. A change that breaks one of
 * these breaks every integrator compiling against `@witness/contracts` — which is
 * the whole reason this package is Apache-2.0 and versioned separately.
 *
 * Treat a failure here as a breaking change requiring a major version bump, not
 * as a test to update.
 */

import { describe, expect, it } from 'vitest';

import { createRecordRequestSchema, reviewActionSchema } from './index.js';

describe('createRecordRequest', () => {
  const valid = {
    title: 'A decision',
    body: 'What was decided and why.',
    source: {
      kind: 'meeting' as const,
      label: 'Committee — 14 March 2026',
      occurredAt: '2026-03-14T09:00:00.000Z',
    },
  };

  it('accepts a well-formed request', () => {
    expect(createRecordRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('trims surrounding whitespace rather than storing it', () => {
    const parsed = createRecordRequestSchema.parse({ ...valid, title: '  A decision  ' });
    expect(parsed.title).toBe('A decision');
  });

  it('rejects a whitespace-only title', () => {
    expect(createRecordRequestSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
  });

  it('rejects a title beyond the documented 200-character bound', () => {
    expect(createRecordRequestSchema.safeParse({ ...valid, title: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });

  it('requires a source — provenance is not optional (P3)', () => {
    const { source: _source, ...withoutSource } = valid;
    expect(createRecordRequestSchema.safeParse(withoutSource).success).toBe(false);
  });

  it('rejects an unknown source kind rather than coercing it', () => {
    expect(
      createRecordRequestSchema.safeParse({
        ...valid,
        source: { ...valid.source, kind: 'telepathy' },
      }).success,
    ).toBe(false);
  });

  it('requires an ISO-8601 timestamp with an offset, so the instant is unambiguous', () => {
    expect(
      createRecordRequestSchema.safeParse({
        ...valid,
        source: { ...valid.source, occurredAt: '14 March 2026' },
      }).success,
    ).toBe(false);
  });
});

describe('reviewAction', () => {
  it('accepts each action in the documented set', () => {
    expect(reviewActionSchema.safeParse({ action: 'submit' }).success).toBe(true);
    expect(reviewActionSchema.safeParse({ action: 'confirm' }).success).toBe(true);
    expect(reviewActionSchema.safeParse({ action: 'correct', body: 'new' }).success).toBe(true);
    expect(reviewActionSchema.safeParse({ action: 'reject', reason: 'wrong' }).success).toBe(true);
    expect(reviewActionSchema.safeParse({ action: 'reopen', reason: 'new evidence' }).success).toBe(
      true,
    );
  });

  it('requires a body for a correction', () => {
    expect(reviewActionSchema.safeParse({ action: 'correct' }).success).toBe(false);
  });

  it('requires a reason for a rejection — "no" without a reason teaches nobody anything', () => {
    expect(reviewActionSchema.safeParse({ action: 'reject' }).success).toBe(false);
    expect(reviewActionSchema.safeParse({ action: 'reject', reason: '  ' }).success).toBe(false);
  });

  it('requires a reason for a reopen — this reverses an institutional decision', () => {
    expect(reviewActionSchema.safeParse({ action: 'reopen' }).success).toBe(false);
  });

  it('rejects an unknown action', () => {
    expect(reviewActionSchema.safeParse({ action: 'approve' }).success).toBe(false);
  });
});
