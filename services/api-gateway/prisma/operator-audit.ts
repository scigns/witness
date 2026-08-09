/**
 * The audit chain, for the two operator scripts that write outside HTTP.
 *
 * `bootstrap.ts` and `invite.ts` create records the API cannot create — the
 * first organisation, and the accounts an administrator invites before a
 * platform-administrator concept exists (see `packages/policy/policy.csv`).
 * Their rows have to verify under exactly the same chain check as every row
 * written through the API, or the first thing an auditor sees on a new
 * instance is a broken chain.
 *
 * Byte-for-byte the canonicalisation in `packages/domain/src/audit.ts`. It is
 * duplicated rather than imported because these scripts run under `tsx`
 * against the generated Prisma client, outside the service's module graph —
 * and because `packages/domain` is GPL-3.0 while this is a build-time
 * operator tool, so the boundary in ADR-0002 stays where it is.
 */

import { createHash, randomUUID } from 'node:crypto';

export interface AuditEventInput {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: string;
  readonly metadata: Record<string, string>;
}

const hash = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');

const canonicalise = (event: {
  id: string;
  subjectType: string;
  subjectId: string;
  action: string;
  actorId: string;
  occurredAt: Date;
  previousHash: string | null;
  metadata: Record<string, string>;
}): string =>
  [
    event.id,
    event.subjectType,
    event.subjectId,
    event.action,
    event.actorId,
    event.occurredAt.toISOString(),
    event.previousHash ?? '',
    Object.keys(event.metadata)
      .sort()
      .map((key) => `${key}=${event.metadata[key] ?? ''}`)
      .join(','),
  ].join('|');

/**
 * The row to insert for one event that starts its subject's chain.
 *
 * Operator scripts only ever create records, so `previousHash` is always null:
 * a subject that already has history is a subject this script must not touch.
 */
export function firstAuditEventFor(
  event: AuditEventInput,
  actorId: string,
  occurredAt: Date,
): {
  id: string;
  subjectType: string;
  subjectId: string;
  action: string;
  actorId: string;
  occurredAt: Date;
  previousHash: null;
  hash: string;
  metadata: Record<string, string>;
} {
  const id = randomUUID();
  return {
    id,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    action: event.action,
    actorId,
    occurredAt,
    previousHash: null,
    hash: hash(canonicalise({ id, ...event, actorId, occurredAt, previousHash: null })),
    metadata: event.metadata,
  };
}
