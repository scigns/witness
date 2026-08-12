/**
 * Append one event to a subject's hash chain — shared by the users and
 * membership services.
 *
 * Reads the current tail inside the caller's transaction, exactly as
 * `RecordsService.appendAudit` does — but reading the tail is not enough by
 * itself: under Postgres's default READ COMMITTED isolation, two concurrent
 * transactions appending to the *same* subject can both read the same tail
 * before either commits, and both then write a child pointing at that same
 * predecessor, forking the chain (`hash` staying globally unique does not
 * stop this — the fork is two different rows agreeing on `previousHash`, not
 * two rows sharing a `hash`). Reproduced live against the pilot deployment
 * under concurrent writes to one agenda item before this lock was added.
 *
 * `pg_advisory_xact_lock` serialises every append to a given
 * (subjectType, subjectId) pair within this transaction, released
 * automatically on commit or rollback — the second concurrent transaction
 * blocks here until the first commits, then reads the real, updated tail.
 * Factored out here rather than duplicated three more times; the
 * pre-existing per-service copies (`RecordsService`, `OrganisationsService`,
 * `WorkspacesService`) are left as they are — this is new code sharing a
 * helper, not a refactor of theirs. `RecordsService.appendAudit` has the
 * identical race and the identical fix applied separately.
 *
 * The tail lookup orders by `sequence`, not `occurredAt` — `occurredAt` is
 * the caller's own clock reading, taken before this lock is acquired, so
 * concurrent-but-serialized appends to the same subject can still carry
 * identical millisecond timestamps with no defined tiebreak between them.
 * The lock alone does not fix that: it correctly serializes the writes, but
 * a tail *read* ordered by a tied column can still return the wrong row.
 * See `sequence`'s own doc comment on the `AuditEvent` model for the live
 * reproduction.
 *
 * The lock call is feature-detected (`typeof tx.$executeRaw === 'function'`)
 * rather than unconditional: every service test file hand-rolls its own
 * in-memory `fakePrisma()` transaction double that implements only the
 * `auditEvent`/entity methods each test needs, not the full `PrismaClient`
 * surface, and those doubles run single-threaded with no concurrent callers
 * to race — skipping the lock there changes nothing observable. A real
 * `PrismaClient` transaction always has `$executeRaw`.
 */

import { randomUUID } from 'node:crypto';

import {
  createAuditEvent,
  toAuditEventId,
  type AuditSubjectType,
  type PendingAuditEvent,
} from '@witness/domain';

import type { PrismaService } from './prisma.service.js';
import { sha256 } from './hashing.js';

type PrismaTransaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export async function appendAuditEvent(
  tx: PrismaTransaction,
  subjectType: AuditSubjectType,
  subjectId: string,
  pending: PendingAuditEvent,
  at: Date,
): Promise<void> {
  if (typeof tx.$executeRaw === 'function') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectType}), hashtext(${subjectId}))`;
  }

  const tail = await tx.auditEvent.findFirst({
    where: { subjectType, subjectId },
    orderBy: { sequence: 'desc' },
    select: { hash: true },
  });

  const event = createAuditEvent(
    {
      id: toAuditEventId(randomUUID()),
      subjectType,
      subjectId,
      action: pending.action,
      actor: pending.actor,
      occurredAt: at,
      previousHash: tail?.hash ?? null,
      metadata: { ...pending.metadata },
    },
    sha256,
  );

  await tx.auditEvent.create({
    data: {
      id: event.id,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      action: event.action,
      actorId: event.actor.id,
      occurredAt: event.occurredAt,
      previousHash: event.previousHash,
      hash: event.hash,
      metadata: event.metadata,
    },
  });
}
