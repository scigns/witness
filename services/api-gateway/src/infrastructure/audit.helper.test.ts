/**
 * Regression coverage for the concurrent-append race reproduced live against
 * the pilot deployment: two transactions appending to the same subject could
 * both read the same tail and both chain onto it, forking the hash chain.
 * See this file's own header comment for the full story and why the fix is
 * a `pg_advisory_xact_lock` rather than relying on `hash`'s uniqueness.
 *
 * A real Postgres integration test that actually races two transactions
 * isn't practical in this suite (no test database here — see
 * `packages/domain`'s own boundary), so this pins the two things a unit test
 * *can* verify: the lock is acquired, keyed correctly, and acquired before
 * the tail read (not after, which would defeat the point); and the
 * feature-detection correctly no-ops for the hand-rolled fake transactions
 * every other service test in this directory uses.
 */

import { describe, expect, it } from 'vitest';

import { toActorId, type Actor, type PendingAuditEvent } from '@witness/domain';

import { appendAuditEvent } from './audit.helper.js';

const ACTOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A Facilitator',
};

const PENDING: PendingAuditEvent = {
  action: 'agenda_item.updated',
  actor: ACTOR,
  metadata: {},
};

function fakeTxWithLock() {
  const calls: { sql: unknown; values: unknown[] }[] = [];
  const order: string[] = [];

  const tx = {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join('?'), values });
      order.push('lock');
      return Promise.resolve(1);
    },
    auditEvent: {
      findFirst: () => {
        order.push('read-tail');
        return Promise.resolve(null);
      },
      create: (args: { data: Record<string, unknown> }) => {
        order.push('write');
        return Promise.resolve(args.data);
      },
    },
  };

  return { tx, calls, order };
}

function fakeTxWithoutLock() {
  const order: string[] = [];
  return {
    tx: {
      auditEvent: {
        findFirst: () => {
          order.push('read-tail');
          return Promise.resolve(null);
        },
        create: (args: { data: Record<string, unknown> }) => {
          order.push('write');
          return Promise.resolve(args.data);
        },
      },
    },
    order,
  };
}

describe('appendAuditEvent — concurrency lock', () => {
  it('acquires an advisory lock keyed on (subjectType, subjectId) before reading the tail', async () => {
    const { tx, calls, order } = fakeTxWithLock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake tx does not implement the full PrismaClient surface
    const fakeTx: any = tx;
    await appendAuditEvent(
      fakeTx,
      'agenda_item',
      '22222222-2222-4222-8222-222222222222',
      PENDING,
      new Date(),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('pg_advisory_xact_lock');
    expect(calls[0]?.sql).toContain('hashtext');
    expect(calls[0]?.values).toEqual(['agenda_item', '22222222-2222-4222-8222-222222222222']);
    expect(order).toEqual(['lock', 'read-tail', 'write']);
  });

  it('no-ops the lock for a fake transaction with no $executeRaw, without throwing', async () => {
    const { tx, order } = fakeTxWithoutLock();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake tx does not implement the full PrismaClient surface
    const fakeTx: any = tx;
    await appendAuditEvent(
      fakeTx,
      'agenda_item',
      '22222222-2222-4222-8222-222222222222',
      PENDING,
      new Date(),
    );

    expect(order).toEqual(['read-tail', 'write']);
  });
});
