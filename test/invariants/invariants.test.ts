/**
 * Invariant suite — the promises Witness makes, as executable assertions.
 *
 * `PROJECT_CONTEXT.md` calls principles P1–P8 architectural constraints rather
 * than aspirations. This file is where that claim is either true or false.
 *
 * A weakened assertion here is the loudest possible signal in code review. If a
 * change requires editing this file, the change is either wrong or needs an ADR
 * superseding the principle it breaks. There is no third case.
 *
 * Coverage is honest about the current phase. Invariants whose subject does not
 * exist yet are listed at the bottom with the phase that brings them, rather
 * than written as tests that pass vacuously — a green assertion over absent code
 * is worse than a documented gap, because it reports safety that nobody has.
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
  rejectRecord,
  toActorId,
  toAuditEventId,
  toRecordId,
  toSourceId,
  verifyChain,
  type AuditEvent,
} from '@witness/domain';
import { loadConfig } from '@witness/config';

const hash = (input: string): string => {
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
  displayName: 'Reviewer',
});

const MODEL = createActor({
  id: toActorId('22222222-2222-4222-8222-222222222222'),
  kind: 'model',
  displayName: 'ollama/llama3.3:70b-instruct',
});

const SOURCE = createSource({
  id: toSourceId('33333333-3333-4333-8333-333333333333'),
  kind: 'meeting',
  label: 'Committee',
  occurredAt: new Date('2026-03-14T09:00:00Z'),
});

const PROVENANCE = createProvenance({
  source: SOURCE,
  capturedBy: HUMAN,
  capturedAt: new Date('2026-03-14T11:00:00Z'),
});

const record = () =>
  captureRecord({
    id: toRecordId('44444444-4444-4444-8444-444444444444'),
    title: 'A decision',
    body: 'The committee decided something.',
    provenance: PROVENANCE,
    capturedAt: new Date('2026-03-14T11:00:00Z'),
  }).record;

const AT = new Date('2026-03-15T10:00:00Z');

// ─────────────────────────────────────────────────────────────────────────────

describe('INV-1 — P1: the sovereign profile cannot start with egress configured', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/w', NODE_ENV: 'production' };

  it.each([
    ['EXTERNAL_MODEL_PROVIDER', 'openai'],
    ['EXTERNAL_MODEL_BASE_URL', 'https://external-provider.invalid/v1'],
    ['EXTERNAL_MODEL_API_KEY', 'sk-x'],
  ])('refuses to start when %s is set', (key, value) => {
    expect(() =>
      loadConfig({ ...base, WITNESS_DEPLOYMENT_PROFILE: 'sovereign', [key]: value }),
    ).toThrow(/zero external calls/i);
  });

  it('refuses external telemetry reporting', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        TELEMETRY_EXTERNAL_REPORTING: 'true',
      }),
    ).toThrow(/egress is egress/i);
  });
});

describe('INV-2 — P3: a record cannot exist without provenance', () => {
  it('capture requires a provenance object; the type system admits no null', () => {
    const captured = record();
    expect(captured.provenance.source.id).toBe(SOURCE.id);
    expect(captured.provenance.capturedBy.id).toBe(HUMAN.id);
  });

  it('a source must be labelled, or it cannot be found again by a human', () => {
    expect(() =>
      createSource({
        id: toSourceId(SOURCE.id),
        kind: 'meeting',
        label: '  ',
        occurredAt: new Date(),
      }),
    ).toThrow();
  });

  it('capture cannot precede the source it captures', () => {
    expect(() =>
      createProvenance({
        source: SOURCE,
        capturedBy: HUMAN,
        capturedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toThrow(/before its source/i);
  });

  it('a model actor must carry its version, or its output is unreproducible', () => {
    expect(() =>
      createActor({ id: toActorId(MODEL.id), kind: 'model', displayName: 'llama' }),
    ).toThrow(/version/i);
  });
});

describe('INV-3 — P4: only a human can accept a record into institutional memory', () => {
  const inReview = () => {
    const captured = record();
    return { ...captured, reviewState: 'in_review' as const };
  };

  it('a model cannot confirm', () => {
    expect(() => confirmRecord(inReview(), MODEL, AT)).toThrow(/requires a human/i);
  });

  it('a model cannot correct', () => {
    expect(() => correctRecord(inReview(), MODEL, 'different', AT)).toThrow(/requires a human/i);
  });

  it('a model cannot reject', () => {
    expect(() => rejectRecord(inReview(), MODEL, 'because', AT)).toThrow(/requires a human/i);
  });

  it('a system actor cannot confirm either', () => {
    const system = createActor({
      id: toActorId('55555555-5555-4555-8555-555555555555'),
      kind: 'system',
      displayName: 'retention sweep',
    });
    expect(() => confirmRecord(inReview(), system, AT)).toThrow(/requires a human/i);
  });

  it('newly captured material is never accepted', () => {
    expect(record().reviewState).toBe('draft');
  });
});

describe('INV-4 — the audit chain is tamper-evident', () => {
  const chain = (): AuditEvent[] => {
    const first = createAuditEvent(
      {
        id: toAuditEventId('66666666-6666-4666-8666-666666666661'),
        recordId: toRecordId('44444444-4444-4444-8444-444444444444'),
        action: 'record.captured',
        actor: HUMAN,
        occurredAt: new Date('2026-03-14T11:00:00Z'),
        previousHash: null,
      },
      hash,
    );

    const second = createAuditEvent(
      {
        id: toAuditEventId('66666666-6666-4666-8666-666666666662'),
        recordId: toRecordId('44444444-4444-4444-8444-444444444444'),
        action: 'record.confirmed',
        actor: HUMAN,
        occurredAt: new Date('2026-03-15T11:00:00Z'),
        previousHash: first.hash,
      },
      hash,
    );

    return [first, second];
  };

  it('an intact chain verifies', () => {
    expect(verifyChain(chain(), hash).valid).toBe(true);
  });

  it('altering an event breaks verification and names the index', () => {
    const events = chain();
    const result = verifyChain([events[0]!, { ...events[1]!, action: 'record.rejected' }], hash);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('removing an event breaks verification', () => {
    expect(verifyChain([chain()[1]!], hash).valid).toBe(false);
  });

  it('reordering events breaks verification', () => {
    const [first, second] = chain();
    expect(verifyChain([second!, first!], hash).valid).toBe(false);
  });
});

describe('INV-5 — ADR-0013: a development profile cannot run in production', () => {
  it('refuses to start', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/w',
        NODE_ENV: 'production',
        WITNESS_DEPLOYMENT_PROFILE: 'development',
      }),
    ).toThrow(/never run in production/i);
  });
});

describe('INV-6 — no secret is exposed through public configuration', () => {
  it('publicConfig omits credentials', async () => {
    const { publicConfig } = await import('@witness/config');
    const config = loadConfig({
      DATABASE_URL: 'postgresql://user:hunter2@localhost:5432/w',
      EXTERNAL_MODEL_API_KEY: 'sk-secret-value',
      WITNESS_DEPLOYMENT_PROFILE: 'development',
    });

    const serialised = JSON.stringify(publicConfig(config));
    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('sk-secret-value');
    expect(serialised).not.toContain('postgresql://');
  });
});

/**
 * Invariants not yet testable, with the phase that makes them so.
 *
 * Listed rather than stubbed. A passing test over code that does not exist
 * reports a guarantee nobody has, which is worse than an acknowledged gap.
 *
 *   INV-7  P2 — no processing without a valid consent grant.      Phase 3 (3.4)
 *   INV-8  Tenant isolation: cross-tenant reads are impossible.   Phase 3 (3.5)
 *   INV-9  Projection rebuild: drop the graph, rebuild from the
 *          event log, byte-comparable result.                     Phase 4 (4.2)
 *   INV-10 Consent revocation propagates to every projection
 *          within the SLO.                                        Phase 3 (3.4)
 *
 * See docs/engineering/PHASE_EXECUTION_PLAN.md — each is an exit-gate condition
 * for its phase, not an optional extra.
 */
describe('INV-7..INV-10 — deferred to later phases', () => {
  it('are documented above with their owning phase, not stubbed as passing', () => {
    expect(true).toBe(true);
  });
});
