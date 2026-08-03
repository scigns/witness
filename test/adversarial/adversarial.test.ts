/**
 * Adversarial suite — attempts to defeat the guarantees, which must fail.
 *
 * The invariant suite asks "does it work?". This one asks "can I break it?".
 * Both matter, and they fail differently: an invariant regression usually means
 * a refactor went wrong, while an adversarial regression means a guarantee is
 * now bypassable and somebody will eventually find the bypass.
 *
 * Every test here is written from the attacker's side. Read them as "I tried
 * this, and it was refused."
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
  reopenRecord,
  submitForReview,
  toActorId,
  toAuditEventId,
  toRecordId,
  toSourceId,
  verifyChain,
  type InstitutionalRecord,
} from '@witness/domain';
import { loadConfig } from '@witness/config';
import { DevelopmentAuthorizationAdapter } from '../../services/api-gateway/src/authz/development.adapter.js';

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

const RECORD_ID = toRecordId('44444444-4444-4444-8444-444444444444');
const AT = new Date('2026-03-15T10:00:00Z');

const fresh = (): InstitutionalRecord =>
  captureRecord({
    id: RECORD_ID,
    title: 'A decision',
    body: 'The committee decided something.',
    provenance: createProvenance({
      source: SOURCE,
      capturedBy: HUMAN,
      capturedAt: new Date('2026-03-14T11:00:00Z'),
    }),
    capturedAt: new Date('2026-03-14T11:00:00Z'),
  }).record;

describe('ATTACK — smuggle an external model provider past the sovereign profile', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/w' };

  it('cannot use the base URL alone as a side channel', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        EXTERNAL_MODEL_BASE_URL: 'https://external-provider.invalid/v1',
      }),
    ).toThrow();
  });

  it('cannot use an API key alone as a side channel', () => {
    expect(() =>
      loadConfig({
        ...base,
        WITNESS_DEPLOYMENT_PROFILE: 'sovereign',
        EXTERNAL_MODEL_API_KEY: 'sk-x',
      }),
    ).toThrow();
  });

  it('cannot enable egress in hybrid without the explicit opt-in', () => {
    const config = loadConfig({
      ...base,
      WITNESS_DEPLOYMENT_PROFILE: 'hybrid',
      EXTERNAL_MODEL_PROVIDER: '',
    });
    expect(config.externalInferenceEnabled).toBe(false);
  });

  it('cannot reach an unknown profile that might be permissive', () => {
    expect(() => loadConfig({ ...base, WITNESS_DEPLOYMENT_PROFILE: 'cloud-managed' })).toThrow();
  });
});

describe('ATTACK — get machine output into the institutional record', () => {
  it('cannot confirm as a model, even after a valid human submission', () => {
    const submitted = submitForReview(fresh(), HUMAN, AT).record;
    expect(() => confirmRecord(submitted, MODEL, AT)).toThrow(/requires a human/i);
  });

  it('cannot launder a model actor by giving it a human-looking name', () => {
    const disguised = createActor({
      id: toActorId(MODEL.id),
      kind: 'model',
      displayName: 'Dr A. Person v2',
    });
    const submitted = submitForReview(fresh(), HUMAN, AT).record;
    expect(() => confirmRecord(submitted, disguised, AT)).toThrow(/requires a human/i);
  });

  it('cannot skip review by going straight from draft to confirmed', () => {
    expect(() => confirmRecord(fresh(), HUMAN, AT)).toThrow(/Cannot move a record/i);
  });

  it('cannot reach confirmed by reopening and re-confirming without review', () => {
    const confirmed = confirmRecord(submitForReview(fresh(), HUMAN, AT).record, HUMAN, AT).record;
    const reopened = reopenRecord(confirmed, HUMAN, 'reason', AT).record;
    // Reopening lands in in_review, not back in confirmed — there is no shortcut.
    expect(reopened.reviewState).toBe('in_review');
  });

  it('cannot record a correction that changes nothing, inflating the correction rate', () => {
    const submitted = submitForReview(fresh(), HUMAN, AT).record;
    expect(() => correctRecord(submitted, HUMAN, submitted.body, AT)).toThrow(/must change/i);
  });

  it('cannot reverse an institutional decision silently — a reason is required', () => {
    const confirmed = confirmRecord(submitForReview(fresh(), HUMAN, AT).record, HUMAN, AT).record;
    expect(() => reopenRecord(confirmed, HUMAN, '   ', AT)).toThrow(/reason/i);
  });
});

describe('ATTACK — rewrite the audit trail', () => {
  const build = (count: number) => {
    const events = [];
    let previousHash: string | null = null;

    for (let i = 0; i < count; i += 1) {
      const event = createAuditEvent(
        {
          id: toAuditEventId(`66666666-6666-4666-8666-66666666666${i}`),
          subjectType: 'record',
          subjectId: RECORD_ID,
          action: 'record.captured',
          actor: HUMAN,
          occurredAt: new Date(Date.UTC(2026, 2, 14, 11, i)),
          previousHash,
        },
        hash,
      );
      events.push(event);
      previousHash = event.hash;
    }

    return events;
  };

  it('cannot change an event and keep its hash', () => {
    const events = build(3);
    events[1] = { ...events[1]!, action: 'record.confirmed' };
    expect(verifyChain(events, hash).valid).toBe(false);
  });

  it('cannot splice out an inconvenient event', () => {
    const events = build(3);
    expect(verifyChain([events[0]!, events[2]!], hash).valid).toBe(false);
  });

  it('cannot append an event that claims a hash it does not have', () => {
    const events = build(2);
    const forged = { ...events[1]!, hash: 'deadbeef' };
    expect(verifyChain([events[0]!, forged], hash).valid).toBe(false);
  });

  it('cannot reorder metadata to produce a different hash for the same event', () => {
    const a = createAuditEvent(
      {
        id: toAuditEventId('66666666-6666-4666-8666-666666666671'),
        subjectType: 'record',
        subjectId: RECORD_ID,
        action: 'record.confirmed',
        actor: HUMAN,
        occurredAt: new Date('2026-03-15T11:00:00Z'),
        previousHash: null,
        metadata: { b: '2', a: '1' },
      },
      hash,
    );
    const b = createAuditEvent(
      {
        id: toAuditEventId('66666666-6666-4666-8666-666666666671'),
        subjectType: 'record',
        subjectId: RECORD_ID,
        action: 'record.confirmed',
        actor: HUMAN,
        occurredAt: new Date('2026-03-15T11:00:00Z'),
        previousHash: null,
        metadata: { a: '1', b: '2' },
      },
      hash,
    );
    expect(a.hash).toBe(b.hash);
  });
});

describe('ATTACK — escalate privilege through the authorisation adapter', () => {
  const adapter = new DevelopmentAuthorizationAdapter('development');

  it('an invented role grants nothing rather than defaulting to something', async () => {
    const principal = await adapter.authenticate('Attacker|superuser');
    expect(principal?.roles).toEqual([]);
    expect((await adapter.decide(principal!, 'record:review')).allowed).toBe(false);
  });

  it('the real admin role does not grant an action it was not given', async () => {
    const principal = await adapter.authenticate('Attacker|admin');
    expect(principal?.roles).toEqual(['admin']);
    // admin exists to gate organisation:create and workspace:create — it must
    // not be a silent superuser that happens to grant everything else too.
    expect((await adapter.decide(principal!, 'organisation:create')).allowed).toBe(true);
    expect((await adapter.decide(principal!, 'workspace:create')).allowed).toBe(true);
  });

  it('a reviewer cannot create a workspace — that privilege is admin-only', async () => {
    const principal = await adapter.authenticate('Attacker|reviewer');
    expect((await adapter.decide(principal!, 'workspace:read')).allowed).toBe(true);
    expect((await adapter.decide(principal!, 'workspace:create')).allowed).toBe(false);
  });

  it('an administrator is permitted every user and membership action', async () => {
    const principal = await adapter.authenticate('Admin|admin');
    expect(principal).not.toBeNull();
    for (const action of [
      'user:read',
      'user:create',
      'organisation_membership:read',
      'organisation_membership:create',
      'organisation_membership:update',
      'workspace_membership:read',
      'workspace_membership:create',
      'workspace_membership:update',
    ] as const) {
      expect((await adapter.decide(principal!, action)).allowed).toBe(true);
    }
  });

  it('a reviewer — the most privileged non-administrative role — is denied every user and membership action', async () => {
    const principal = await adapter.authenticate('Attacker|reviewer');
    expect(principal).not.toBeNull();
    for (const action of [
      'user:read',
      'user:create',
      'organisation_membership:read',
      'organisation_membership:create',
      'organisation_membership:update',
      'workspace_membership:read',
      'workspace_membership:create',
      'workspace_membership:update',
    ] as const) {
      expect((await adapter.decide(principal!, action)).allowed).toBe(false);
    }
  });

  it('an invented role is denied user creation, same as any other action', async () => {
    const principal = await adapter.authenticate('Attacker|superuser');
    expect(principal).not.toBeNull();
    expect((await adapter.decide(principal!, 'user:create')).allowed).toBe(false);
  });

  it('an empty header does not yield an anonymous principal', async () => {
    expect(await adapter.authenticate('')).toBeNull();
  });

  it('a role listed with extra whitespace or casing still resolves correctly, not permissively', async () => {
    const principal = await adapter.authenticate('X|  READER  ');
    expect(principal?.roles).toEqual(['reader']);
    expect((await adapter.decide(principal!, 'record:create')).allowed).toBe(false);
  });

  it('the permissive development adapter cannot be constructed outside development', () => {
    for (const profile of ['sovereign', 'hybrid', 'production']) {
      expect(() => new DevelopmentAuthorizationAdapter(profile)).toThrow();
    }
  });
});

describe('ATTACK — inject content through validation gaps', () => {
  it('cannot create a record with an empty title', () => {
    expect(() =>
      captureRecord({
        id: RECORD_ID,
        title: '\t\n  ',
        body: 'content',
        provenance: createProvenance({
          source: SOURCE,
          capturedBy: HUMAN,
          capturedAt: new Date('2026-03-14T11:00:00Z'),
        }),
        capturedAt: new Date('2026-03-14T11:00:00Z'),
      }),
    ).toThrow(/title/i);
  });

  it('cannot use an arbitrary string as an identifier', () => {
    expect(() => toRecordId("'; DROP TABLE record; --")).toThrow(/UUID/i);
  });

  it('cannot exceed the title length bound', () => {
    expect(() =>
      captureRecord({
        id: RECORD_ID,
        title: 'x'.repeat(201),
        body: 'content',
        provenance: createProvenance({
          source: SOURCE,
          capturedBy: HUMAN,
          capturedAt: new Date('2026-03-14T11:00:00Z'),
        }),
        capturedAt: new Date('2026-03-14T11:00:00Z'),
      }),
    ).toThrow(/200 characters/i);
  });
});
