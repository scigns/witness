import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { StoragePort } from '../storage/storage.port.js';
import { StorageQuotaService } from './storage-quota.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';
import { objectKey } from '../storage/storage.service.js';

export interface StorageDiscrepancy {
  code:
    | 'ORPHAN_OBJECT'
    | 'MISSING_OBJECT'
    | 'SIZE_MISMATCH'
    | 'INVALID_OBJECT_KEY'
    | 'EXPIRED_RESERVATION'
    | 'STUCK_RESERVATION'
    | 'STORAGE_UNAVAILABLE';
  reference: string;
}

@Injectable()
export class StorageReconciliationService {
  private readonly logger = new Logger(StorageReconciliationService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(StoragePort) private readonly storage: StoragePort | null,
    private readonly quota: StorageQuotaService,
  ) {}

  /** Observational snapshot, not a basis for deleting bytes. All repairs recheck under the quota lock. */
  async inspect(organisationId: string, principal: Principal) {
    if (!z.string().uuid().safeParse(organisationId).success)
      throw new BadRequestException('An organisation UUID is required.');
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true },
    });
    if (organisation === null) throw new NotFoundException('Organisation not found.');
    const actor = await resolveActor(this.prisma, principal);
    const measuredAt = new Date();
    const [attachments, resources, reservations, usage, inline] = await Promise.all([
      this.prisma.evidenceAttachment.findMany({
        where: { evidence: { organisationId }, storageKey: { not: null } },
        select: { id: true, sizeBytes: true, storageKey: true },
        take: 10001,
      }),
      this.prisma.resource.findMany({
        where: { workspace: { organisationId }, storageKey: { not: null } },
        select: { id: true, sizeBytes: true, storageKey: true },
        take: 10001,
      }),
      this.prisma.storageReservation.findMany({
        where: { organisationId, state: { in: ['RESERVED', 'WRITING', 'NEEDS_RECONCILIATION'] } },
        take: 10001,
      }),
      this.quota.usage(organisationId),
      this.prisma.$queryRaw<Array<{ id: string; declared: number; actual: number | null }>>`
        SELECT a.id::text, a.size_bytes AS declared, octet_length(a.content) AS actual
        FROM evidence_attachment a JOIN evidence e ON e.id = a.evidence_id
        WHERE e.organisation_id = ${organisationId}::uuid AND a.storage_key IS NULL
        AND (a.content IS NULL OR a.size_bytes <> octet_length(a.content))
        UNION ALL
        SELECT r.id::text, r.size_bytes AS declared, octet_length(r.content) AS actual
        FROM resource r JOIN workspace w ON w.id = r.workspace_id
        WHERE w.organisation_id = ${organisationId}::uuid AND r.resource_type = 'file' AND r.storage_key IS NULL
        AND (r.content IS NULL OR r.size_bytes <> octet_length(r.content)) LIMIT 10001`,
    ]);
    if ([attachments, resources, reservations, inline].some((rows) => rows.length > 10000))
      throw new ConflictException({
        error: {
          code: 'RECONCILIATION_LIMIT',
          message: 'Inventory exceeds the bounded inspection limit. No repair was performed.',
        },
      });
    const discrepancies: StorageDiscrepancy[] = inline.map((row) => ({
      code: row.actual === null ? 'MISSING_OBJECT' : 'SIZE_MISMATCH',
      reference: row.id,
    }));
    for (const reservation of reservations) {
      if (reservation.state === 'NEEDS_RECONCILIATION')
        discrepancies.push({ code: 'STUCK_RESERVATION', reference: reservation.id });
      else if (reservation.expiresAt <= measuredAt)
        discrepancies.push({
          code: reservation.state === 'RESERVED' ? 'EXPIRED_RESERVATION' : 'STUCK_RESERVATION',
          reference: reservation.id,
        });
    }
    const records = [
      ...attachments.map((row) => ({ ...row, kind: 'evidence-attachment' as const })),
      ...resources.map((row) => ({ ...row, kind: 'resource' as const })),
    ];
    let objectBytes: bigint | null = this.storage === null ? null : 0n;
    let inventoryComplete = true;
    if (
      this.storage === null &&
      (records.length !== 0 || reservations.some((row) => row.storageKey !== null))
    ) {
      discrepancies.push({ code: 'STORAGE_UNAVAILABLE', reference: organisationId });
      inventoryComplete = false;
    }
    if (this.storage !== null) {
      const expected = new Set(
        [
          ...records.map((row) => row.storageKey),
          ...reservations.map((row) => row.storageKey),
        ].filter((key) => key !== null),
      );
      try {
        let cursor: string | undefined;
        let pages = 0;
        do {
          const page = await this.storage.list(`${organisationId}/`, cursor);
          for (const object of page.objects) {
            objectBytes! += BigInt(object.sizeBytes);
            if (!expected.has(object.key))
              discrepancies.push({ code: 'ORPHAN_OBJECT', reference: object.key });
          }
          cursor = page.cursor ?? undefined;
          if (++pages >= 100 && cursor !== undefined)
            throw new Error('Inventory page limit exceeded.');
        } while (cursor !== undefined);
        // HEAD each referenced key; do not infer missing bytes from a racing list snapshot.
        for (const record of records) {
          if (
            record.storageKey !== objectKey({ organisationId, kind: record.kind, id: record.id })
          ) {
            discrepancies.push({ code: 'INVALID_OBJECT_KEY', reference: record.id });
            continue;
          }
          const object = await this.storage.head(record.storageKey!);
          if (object === null) discrepancies.push({ code: 'MISSING_OBJECT', reference: record.id });
          else if (object.sizeBytes !== record.sizeBytes)
            discrepancies.push({ code: 'SIZE_MISMATCH', reference: record.id });
        }
      } catch {
        inventoryComplete = false;
        objectBytes = null;
        discrepancies.push({ code: 'STORAGE_UNAVAILABLE', reference: organisationId });
        this.logger.warn({ event: 'storage.reconciliation_inventory_failed', organisationId });
      }
    }
    const reportHash = createHash('sha256')
      .update(
        JSON.stringify({
          organisationId,
          measuredAt,
          discrepancies,
          committedBytes: usage.usedBytes.toString(),
          reservedBytes: usage.reservedBytes.toString(),
          objectStorageBytes: objectBytes?.toString() ?? null,
          inventoryComplete,
        }),
      )
      .digest('hex');
    await this.prisma.$transaction(async (tx) => {
      await appendAuditEvent(
        tx,
        'organisation',
        organisationId,
        {
          action: 'organisation.storage_reconciled',
          actor,
          metadata: {
            mode: 'report_only',
            reportHash,
            discrepancyCount: String(discrepancies.length),
            inventoryComplete: String(inventoryComplete),
            committedBytes: usage.usedBytes.toString(),
            reservedBytes: usage.reservedBytes.toString(),
          },
        },
        measuredAt,
      );
    });
    return {
      organisationId,
      reportHash,
      measuredAt: measuredAt.toISOString(),
      inventoryComplete,
      consistency: 'OBSERVATIONAL' as const,
      committedBytes: usage.usedBytes.toString(),
      reservedBytes: usage.reservedBytes.toString(),
      objectStorageBytes: objectBytes?.toString() ?? null,
      discrepancies,
      repairsPerformed: 0,
    };
  }

  /** Only never-started expired leases can be released automatically. Uncertain writes remain charged. */
  async cleanExpired(organisationId: string, principal: Principal) {
    if (!z.string().uuid().safeParse(organisationId).success)
      throw new BadRequestException('An organisation UUID is required.');
    if (
      (await this.prisma.organisation.findUnique({
        where: { id: organisationId },
        select: { id: true },
      })) === null
    )
      throw new NotFoundException('Organisation not found.');
    const actor = await resolveActor(this.prisma, principal);
    return this.prisma.$transaction(async (tx) => {
      await this.quota.lockForWrite(tx, organisationId);
      const now = new Date();
      const expired = await tx.storageReservation.updateMany({
        where: { organisationId, state: 'RESERVED', expiresAt: { lte: now } },
        data: { state: 'RELEASED' },
      });
      const stuck = await tx.storageReservation.updateMany({
        where: { organisationId, state: 'WRITING', expiresAt: { lte: now } },
        data: { state: 'NEEDS_RECONCILIATION' },
      });
      await appendAuditEvent(
        tx,
        'organisation',
        organisationId,
        {
          action: 'organisation.storage_reconciled',
          actor,
          metadata: {
            mode: 'expired_leases',
            releasedNeverStarted: String(expired.count),
            retainedUncertain: String(stuck.count),
          },
        },
        now,
      );
      return {
        releasedNeverStarted: expired.count,
        retainedUncertain: stuck.count,
        objectsDeleted: 0,
      };
    });
  }
}
