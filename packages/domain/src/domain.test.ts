/**
 * Domain tests.
 *
 * These test the invariants the architecture claims, not the getters. If one of
 * these fails, a promise made in PROJECT_CONTEXT.md is no longer true.
 */

import { describe, expect, it } from 'vitest';

import {
  captureRecord,
  confirmRecord,
  correctRecord,
  createActor,
  createAuditEvent,
  createProvenance,
  createSource,
  isInstitutionalRecord,
  permittedTransitions,
  rejectRecord,
  reopenRecord,
  submitForReview,
  toActorId,
  toAuditEventId,
  toRecordId,
  toSourceId,
  verifyChain,
  type AuditEvent,
} from './index.js';

// A deterministic, non-cryptographic hash. Real adapters use SHA-256; the domain
// does not care which, which is the point of injecting it.
const testHash = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

const HUMAN = createActor({
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A. Reviewer',
});

const MODEL = createActor({
  id: toActorId('22222222-2222-4222-8222-222222222222'),
  kind: 'model',
  displayName: 'ollama/llama3.3:70b-instruct',
});

const SOURCE = createSource({
  id: toSourceId('33333333-3333-4333-8333-333333333333'),
  kind: 'meeting',
  label: 'Water Committee, 14 March 2026',
  occurredAt: new Date('2026-03-14T09:00:00Z'),
});

const PROVENANCE = createProvenance({
  source: SOURCE,
  capturedBy: HUMAN,
  capturedAt: new Date('2026-03-14T11:00:00Z'),
});

const captured = () =>
  captureRecord({
    id: toRecordId('44444444-4444-4444-8444-444444444444'),
    title: 'Bore maintenance deferred to next quarter',
    body: 'The committee agreed to defer bore maintenance pending the budget review.',
    provenance: PROVENANCE,
    capturedAt: new Date('2026-03-14T11:00:00Z'),
  }).record;

describe('actors', () => {
  it('rejects an actor with no display name — provenance that names nobody is not provenance', () => {
    expect(() =>
      createActor({ id: toActorId(HUMAN.id), kind: 'human', displayName: '   ' }),
    ).toThrow(/display name/i);
  });

  it('rejects a model actor with no version, because an unversioned extraction is unreproducible', () => {
    expect(() =>
      createActor({ id: toActorId(MODEL.id), kind: 'model', displayName: 'llama' }),
    ).toThrow(/version/i);
  });

  it('accepts a versioned model actor', () => {
    expect(MODEL.displayName).toContain(':');
  });
});

describe('identifiers', () => {
  it('rejects a non-UUID identifier', () => {
    expect(() => toRecordId('not-a-uuid')).toThrow(/UUID/i);
  });
});

describe('provenance (P3)', () => {
  it('refuses a source with no label', () => {
    expect(() =>
      createSource({
        id: toSourceId(SOURCE.id),
        kind: 'meeting',
        label: '',
        occurredAt: new Date(),
      }),
    ).toThrow(/label/i);
  });

  it('refuses capture that precedes the source it captures', () => {
    expect(() =>
      createProvenance({
        source: SOURCE,
        capturedBy: HUMAN,
        capturedAt: new Date('2026-03-13T09:00:00Z'),
      }),
    ).toThrow(/before its source/i);
  });

  it('carries the consent grant when one is supplied', () => {
    const withConsent = createProvenance({
      source: SOURCE,
      capturedBy: HUMAN,
      capturedAt: new Date('2026-03-14T11:00:00Z'),
      consentGrantId: 'grant-123',
    });
    expect(withConsent.consentGrantId).toBe('grant-123');
  });
});

describe('capture', () => {
  it('always starts in draft — never as accepted', () => {
    const record = captured();
    expect(record.reviewState).toBe('draft');
    expect(isInstitutionalRecord(record)).toBe(false);
  });

  it('refuses an empty title', () => {
    expect(() =>
      captureRecord({
        id: toRecordId('44444444-4444-4444-8444-444444444444'),
        title: '  ',
        body: 'content',
        provenance: PROVENANCE,
        capturedAt: new Date(),
      }),
    ).toThrow(/title/i);
  });

  it('refuses empty content', () => {
    expect(() =>
      captureRecord({
        id: toRecordId('44444444-4444-4444-8444-444444444444'),
        title: 'A title',
        body: '   ',
        provenance: PROVENANCE,
        capturedAt: new Date(),
      }),
    ).toThrow(/content/i);
  });

  it('emits a capture audit intent that the caller cannot silently drop', () => {
    const outcome = captureRecord({
      id: toRecordId('44444444-4444-4444-8444-444444444444'),
      title: 'A title',
      body: 'Some content',
      provenance: PROVENANCE,
      capturedAt: new Date('2026-03-14T11:00:00Z'),
    });
    expect(outcome.event.action).toBe('record.captured');
    expect(outcome.event.metadata['sourceLabel']).toBe(SOURCE.label);
  });
});

describe('review state machine (P4)', () => {
  const at = new Date('2026-03-15T10:00:00Z');

  it('moves draft → in_review → confirmed', () => {
    const submitted = submitForReview(captured(), HUMAN, at).record;
    expect(submitted.reviewState).toBe('in_review');

    const confirmed = confirmRecord(submitted, HUMAN, at).record;
    expect(confirmed.reviewState).toBe('confirmed');
    expect(isInstitutionalRecord(confirmed)).toBe(true);
  });

  it('refuses to confirm straight from draft — review is not optional', () => {
    expect(() => confirmRecord(captured(), HUMAN, at)).toThrow(/Cannot move a record/i);
  });

  it('REFUSES CONFIRMATION BY A MODEL — this is principle P4 and it is the point', () => {
    const submitted = submitForReview(captured(), HUMAN, at).record;
    expect(() => confirmRecord(submitted, MODEL, at)).toThrow(/requires a human/i);
  });

  it('refuses correction and rejection by a model too', () => {
    const submitted = submitForReview(captured(), HUMAN, at).record;
    expect(() => correctRecord(submitted, MODEL, 'different text', at)).toThrow(
      /requires a human/i,
    );
    expect(() => rejectRecord(submitted, MODEL, 'wrong', at)).toThrow(/requires a human/i);
  });

  it('records a correction as a distinct state, preserving the correction-rate signal', () => {
    const submitted = submitForReview(captured(), HUMAN, at).record;
    const outcome = correctRecord(
      submitted,
      HUMAN,
      'The committee deferred maintenance to Q3.',
      at,
    );

    expect(outcome.record.reviewState).toBe('corrected');
    expect(outcome.record.body).toBe('The committee deferred maintenance to Q3.');
    expect(outcome.event.action).toBe('record.corrected');
    expect(isInstitutionalRecord(outcome.record)).toBe(true);
  });

  it('refuses a correction that changes nothing', () => {
    const submitted = submitForReview(captured(), HUMAN, at).record;
    expect(() => correctRecord(submitted, HUMAN, submitted.body, at)).toThrow(/must change/i);
  });

  it('refuses rejection with no reason', () => {
    const submitted = submitForReview(captured(), HUMAN, at).record;
    expect(() => rejectRecord(submitted, HUMAN, '  ', at)).toThrow(/reason/i);
  });

  it('allows a confirmed record to be reopened, with a reason', () => {
    const confirmed = confirmRecord(
      submitForReview(captured(), HUMAN, at).record,
      HUMAN,
      at,
    ).record;
    const reopened = reopenRecord(confirmed, HUMAN, 'New evidence from the March minutes.', at);

    expect(reopened.record.reviewState).toBe('in_review');
    expect(reopened.event.action).toBe('record.reopened');
    expect(reopened.event.metadata['reason']).toContain('New evidence');
  });

  it('refuses to reopen without a reason — this reverses an institutional decision', () => {
    const confirmed = confirmRecord(
      submitForReview(captured(), HUMAN, at).record,
      HUMAN,
      at,
    ).record;
    expect(() => reopenRecord(confirmed, HUMAN, '', at)).toThrow(/reason/i);
  });

  it('never mutates the record it was given', () => {
    const original = captured();
    submitForReview(original, HUMAN, at);
    expect(original.reviewState).toBe('draft');
  });

  it('exposes the permitted transitions so a UI need not hard-code them', () => {
    expect(permittedTransitions('draft')).toEqual(['in_review']);
    expect(permittedTransitions('in_review')).toContain('confirmed');
    expect(permittedTransitions('confirmed')).toEqual(['in_review']);
  });
});

describe('audit chain', () => {
  const recordId = toRecordId('44444444-4444-4444-8444-444444444444');

  const chain = (): AuditEvent[] => {
    const first = createAuditEvent(
      {
        id: toAuditEventId('55555555-5555-4555-8555-555555555551'),
        subjectType: 'record',
        subjectId: recordId,
        action: 'record.captured',
        actor: HUMAN,
        occurredAt: new Date('2026-03-14T11:00:00Z'),
        previousHash: null,
      },
      testHash,
    );

    const second = createAuditEvent(
      {
        id: toAuditEventId('55555555-5555-4555-8555-555555555552'),
        subjectType: 'record',
        subjectId: recordId,
        action: 'record.confirmed',
        actor: HUMAN,
        occurredAt: new Date('2026-03-15T11:00:00Z'),
        previousHash: first.hash,
        metadata: { from: 'in_review', to: 'confirmed' },
      },
      testHash,
    );

    return [first, second];
  };

  it('verifies an intact chain', () => {
    expect(verifyChain(chain(), testHash).valid).toBe(true);
  });

  it('detects an altered event', () => {
    const events = chain();
    const tampered = { ...events[1]!, action: 'record.rejected' as const };
    const result = verifyChain([events[0]!, tampered], testHash);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toMatch(/altered/i);
  });

  it('detects a removed event', () => {
    const events = chain();
    const result = verifyChain([events[1]!], testHash);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/inserted, removed or reordered/i);
  });

  it('produces a stable hash regardless of metadata key order', () => {
    const base = {
      id: toAuditEventId('55555555-5555-4555-8555-555555555553'),
      subjectType: 'record',
      subjectId: recordId,
      action: 'record.confirmed' as const,
      actor: HUMAN,
      occurredAt: new Date('2026-03-15T11:00:00Z'),
      previousHash: null,
    };

    const a = createAuditEvent(
      { ...base, metadata: { to: 'confirmed', from: 'in_review' } },
      testHash,
    );
    const b = createAuditEvent(
      { ...base, metadata: { from: 'in_review', to: 'confirmed' } },
      testHash,
    );

    expect(a.hash).toBe(b.hash);
  });
});
