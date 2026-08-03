/**
 * Append one event to a subject's hash chain — shared by the users and
 * membership services.
 *
 * Reads the current tail inside the caller's transaction, exactly as
 * `RecordsService.appendAudit` does, so two concurrent writes to the same
 * subject cannot both chain onto the same predecessor. Factored out here
 * rather than duplicated three more times; the pre-existing per-service
 * copies (`RecordsService`, `OrganisationsService`, `WorkspacesService`) are
 * left as they are — this is new code sharing a helper, not a refactor of
 * theirs.
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
  const tail = await tx.auditEvent.findFirst({
    where: { subjectType, subjectId },
    orderBy: { occurredAt: 'desc' },
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
