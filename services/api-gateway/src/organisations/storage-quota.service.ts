/** Customer file accounting plus a durable, per-organisation upload ledger.
 * RESERVED/WRITING/NEEDS_RECONCILIATION bytes remain charged until a committed
 * record replaces them or an operator establishes that releasing them is safe.
 * Expiring a writer is not proof that its storage operation stopped.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, StorageReservation } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { objectKey, type StorageKind } from '../storage/storage.service.js';

import {
  DEFAULT_STORAGE_QUOTA_BYTES,
  InvariantViolation,
  USAGE_WARNING_THRESHOLDS,
  type Actor,
} from '@witness/domain';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { EffectiveCommercialConfigurationService } from '../commercial/effective-commercial-configuration.service.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';

export type StorageQuotaSource = 'ADMIN_OVERRIDE' | 'RESOURCE_PROFILE' | 'FALLBACK_DEFAULT';

export interface StorageUsage {
  readonly usedBytes: bigint;
  readonly reservedBytes: bigint;
  readonly quotaBytes: bigint;
  readonly availableBytes: bigint;
  readonly percentageUsed: number;
  readonly source: StorageQuotaSource;
  readonly measuredAt: Date;
}

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class StorageQuotaService {
  private readonly logger = new Logger(StorageQuotaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commercialConfiguration: EffectiveCommercialConfigurationService,
  ) {}

  /** The allocated quota alone, without the (more expensive) used-bytes aggregate. */
  private async resolveAllocatedBytes(
    db: PrismaService | TransactionClient,
    organisationId: string,
  ): Promise<{ allocatedBytes: bigint; source: StorageQuotaSource }> {
    const organisation = await db.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { storageQuotaBytes: true },
    });
    if (organisation.storageQuotaBytes !== null) {
      return { allocatedBytes: organisation.storageQuotaBytes, source: 'ADMIN_OVERRIDE' };
    }

    try {
      const config = await this.commercialConfiguration.resolveFor(organisationId, db);
      if (config.resourceProfile !== null) {
        return {
          allocatedBytes: BigInt(config.resourceProfile.storageQuotaBytes),
          source: 'RESOURCE_PROFILE',
        };
      }
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      // No subscription at all — domain invariants make this vanishingly
      // rare (every organisation gets a FREE subscription at creation) but
      // fail safe to the last-resort default rather than propagate.
      this.logger.warn(
        `Organisation '${organisationId}' has no resolvable commercial configuration; ` +
          'falling back to the default storage quota.',
      );
    }
    return { allocatedBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES), source: 'FALLBACK_DEFAULT' };
  }

  private async usedBytes(
    db: PrismaService | TransactionClient,
    organisationId: string,
  ): Promise<bigint> {
    const [attachmentTotal, resourceTotal] = await Promise.all([
      db.evidenceAttachment.aggregate({
        where: { evidence: { organisationId } },
        _sum: { sizeBytes: true },
      }),
      db.resource.aggregate({
        where: { workspace: { organisationId } },
        _sum: { sizeBytes: true },
      }),
    ]);
    return BigInt(attachmentTotal._sum.sizeBytes ?? 0) + BigInt(resourceTotal._sum.sizeBytes ?? 0);
  }

  async usage(organisationId: string): Promise<StorageUsage> {
    return this.usageVia(this.prisma, organisationId);
  }

  private async reservedBytes(
    db: PrismaService | TransactionClient,
    organisationId: string,
    excludeId?: string,
  ): Promise<bigint> {
    const total = await db.storageReservation.aggregate({
      where: {
        organisationId,
        state: { in: ['RESERVED', 'WRITING', 'NEEDS_RECONCILIATION'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      _sum: { sizeBytes: true },
    });
    return total._sum.sizeBytes ?? 0n;
  }

  private async usageVia(
    db: PrismaService | TransactionClient,
    organisationId: string,
    excludeReservationId?: string,
  ): Promise<StorageUsage> {
    const [used, reserved, { allocatedBytes, source }] = await Promise.all([
      this.usedBytes(db, organisationId),
      this.reservedBytes(db, organisationId, excludeReservationId),
      this.resolveAllocatedBytes(db, organisationId),
    ]);
    const consumed = used + reserved;
    const availableBytes = allocatedBytes > consumed ? allocatedBytes - consumed : 0n;
    const percentageUsed =
      allocatedBytes === 0n
        ? 100
        : Math.min(100, Number((consumed * 10000n) / allocatedBytes) / 100);

    return {
      usedBytes: used,
      reservedBytes: reserved,
      quotaBytes: allocatedBytes,
      availableBytes,
      percentageUsed,
      source,
      measuredAt: new Date(),
    };
  }

  /**
   * Fast, non-transactional pre-check — rejects an obviously-over-quota
   * request before any StoragePort write is attempted. NOT the race-safe
   * boundary; see `checkQuotaInTransaction`.
   */
  async checkQuota(organisationId: string, additionalBytes: number): Promise<void> {
    const { usedBytes, reservedBytes, quotaBytes } = await this.usage(organisationId);
    assertWithinQuota(usedBytes + reservedBytes, quotaBytes, additionalBytes);
  }

  /**
   * Acquire a per-organisation advisory lock, scoped to the caller's
   * transaction (released automatically at commit/rollback). Call this
   * before `checkQuotaInTransaction`, in the same transaction that performs
   * the write — a lock taken and released in a separate transaction closes
   * nothing, since a concurrent request could slip in between the two.
   */
  async lockForWrite(tx: TransactionClient, organisationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('storage_quota'), hashtext(${organisationId}))`;
  }

  /**
   * The authoritative, race-safe check. MUST be called after `lockForWrite`
   * in the same transaction, immediately before the row that consumes the
   * quota is created — any other request for this organisation is blocked
   * at the lock until this transaction commits or rolls back, so there is
   * no window for two concurrent uploads to both read the same stale USED
   * figure.
   */
  async checkQuotaInTransaction(
    tx: TransactionClient,
    organisationId: string,
    additionalBytes: number,
    actor?: Actor,
    at: Date = new Date(),
    excludeReservationId?: string,
  ): Promise<void> {
    const { usedBytes, reservedBytes, quotaBytes } = await this.usageVia(
      tx,
      organisationId,
      excludeReservationId,
    );
    assertWithinQuota(usedBytes + reservedBytes, quotaBytes, additionalBytes);
    if (actor !== undefined && quotaBytes > 0n) {
      const projectedBytes = usedBytes + BigInt(additionalBytes);
      for (const threshold of USAGE_WARNING_THRESHOLDS) {
        const boundary = quotaBytes * BigInt(threshold);
        if (usedBytes * 100n < boundary && projectedBytes * 100n >= boundary) {
          await appendAuditEvent(
            tx,
            'organisation',
            organisationId,
            {
              action: 'organisation.storage_threshold_crossed',
              actor,
              metadata: {
                thresholdPercent: String(threshold),
                usedBytes: projectedBytes.toString(),
                allocatedBytes: quotaBytes.toString(),
              },
            },
            at,
          );
        }
      }
    }
  }

  async reserve(input: {
    organisationId: string;
    requestKey?: string | undefined;
    requestFingerprint: string;
    kind: StorageKind;
    sizeBytes: number;
    objectStorage: boolean;
    actor: Actor;
  }): Promise<StorageReservation> {
    const requestKey = input.requestKey ?? randomUUID();
    if (!z.string().uuid().safeParse(requestKey).success) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Upload Idempotency-Key must be a UUID.',
        },
      });
    }
    // Validate even when an idempotent result already exists.
    assertWithinQuota(0n, BigInt(Number.MAX_SAFE_INTEGER), input.sizeBytes);
    return this.prisma.$transaction(async (tx) => {
      await this.lockForWrite(tx, input.organisationId);
      const previous = await tx.storageReservation.findUnique({
        where: { organisationId_requestKey: { organisationId: input.organisationId, requestKey } },
      });
      if (previous !== null) {
        if (
          previous.requestFingerprint !== input.requestFingerprint ||
          previous.storageKind !== input.kind ||
          previous.sizeBytes !== BigInt(input.sizeBytes)
        ) {
          throw new ConflictException({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'The upload key was already used for a different request.',
            },
          });
        }
        if (previous.state === 'COMMITTED') return previous;
        throw new ConflictException({
          error: {
            code: 'UPLOAD_IN_PROGRESS',
            message:
              'This upload is pending or requires reconciliation. Do not submit its bytes again.',
          },
        });
      }
      await this.checkQuotaInTransaction(tx, input.organisationId, input.sizeBytes);
      const targetId = randomUUID();
      const now = new Date();
      const reservation = await tx.storageReservation.create({
        data: {
          id: randomUUID(),
          organisationId: input.organisationId,
          requestKey,
          requestFingerprint: input.requestFingerprint,
          storageKind: input.kind,
          targetId,
          storageKey: input.objectStorage
            ? objectKey({ organisationId: input.organisationId, kind: input.kind, id: targetId })
            : null,
          sizeBytes: BigInt(input.sizeBytes),
          state: 'RESERVED',
          expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        },
      });
      await appendAuditEvent(
        tx,
        'organisation',
        input.organisationId,
        {
          action: 'organisation.storage_reserved',
          actor: input.actor,
          metadata: { reservationId: reservation.id, sizeBytes: reservation.sizeBytes.toString() },
        },
        now,
      );
      return reservation;
    });
  }

  async claim(reservation: StorageReservation): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockForWrite(tx, reservation.organisationId);
      const result = await tx.storageReservation.updateMany({
        where: {
          id: reservation.id,
          organisationId: reservation.organisationId,
          state: 'RESERVED',
          expiresAt: { gt: new Date() },
        },
        data: { state: 'WRITING' },
      });
      if (result.count !== 1)
        throw new ConflictException({
          error: {
            code: 'RESERVATION_NOT_WRITABLE',
            message: 'The upload reservation is expired or already claimed.',
          },
        });
    });
  }

  /** Call before inserting the file record; same transaction must then commit the reservation. */
  async checkReservation(
    tx: TransactionClient,
    reservation: StorageReservation,
    actor: Actor,
    at: Date,
  ): Promise<void> {
    await this.lockForWrite(tx, reservation.organisationId);
    const current = await tx.storageReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    if (current.organisationId !== reservation.organisationId || current.state !== 'WRITING') {
      throw new InvariantViolation(
        'The upload reservation is no longer writable.',
        'RESERVATION_NOT_WRITABLE',
      );
    }
    await this.checkQuotaInTransaction(
      tx,
      current.organisationId,
      Number(current.sizeBytes),
      actor,
      at,
      current.id,
    );
  }

  async commitReservation(tx: TransactionClient, reservation: StorageReservation): Promise<void> {
    const updated = await tx.storageReservation.updateMany({
      where: { id: reservation.id, organisationId: reservation.organisationId, state: 'WRITING' },
      data: { state: 'COMMITTED' },
    });
    if (updated.count !== 1)
      throw new InvariantViolation(
        'Upload reservation changed before commit.',
        'RESERVATION_NOT_WRITABLE',
      );
  }

  /** Internal failure path only: caller proved rollback and removed any completed object write. */
  async releaseKnownFailure(reservation: StorageReservation, actor: Actor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockForWrite(tx, reservation.organisationId);
      const released = await tx.storageReservation.updateMany({
        where: { id: reservation.id, state: { in: ['RESERVED', 'WRITING'] } },
        data: { state: 'RELEASED' },
      });
      if (released.count === 1)
        await appendAuditEvent(
          tx,
          'organisation',
          reservation.organisationId,
          {
            action: 'organisation.storage_reconciled',
            actor,
            metadata: { reservationId: reservation.id, result: 'known_failed_upload_released' },
          },
          new Date(),
        );
    });
  }

  /** Unknown provider/commit outcomes stay charged; never delete their objects here. */
  async markUncertain(reservation: StorageReservation): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockForWrite(tx, reservation.organisationId);
        await tx.storageReservation.updateMany({
          where: { id: reservation.id, state: { in: ['RESERVED', 'WRITING'] } },
          data: { state: 'NEEDS_RECONCILIATION' },
        });
      });
      this.logger.warn({
        event: 'storage.reservation_requires_reconciliation',
        organisationId: reservation.organisationId,
        reservationId: reservation.id,
      });
    } catch {
      this.logger.error({
        event: 'storage.reservation_state_update_failed',
        reservationId: reservation.id,
      });
    }
  }
}

function assertWithinQuota(usedBytes: bigint, quotaBytes: bigint, additionalBytes: number): void {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) {
    throw new InvariantViolation(
      'Storage writes must declare a non-negative safe integer byte count.',
      'INVALID_STORAGE_SIZE',
    );
  }
  if (quotaBytes < 0n) {
    throw new InvariantViolation('Storage allocation cannot be negative.', 'INVALID_STORAGE_QUOTA');
  }
  const projected = usedBytes + BigInt(additionalBytes);
  if (projected > quotaBytes) {
    throw new InvariantViolation(
      `This organisation has used ${usedBytes} of ${quotaBytes} bytes of allocated storage. ` +
        `Adding ${additionalBytes} more bytes would exceed the quota. Existing content is ` +
        'unaffected — export or remove content to free up space, or ask an administrator to ' +
        'increase the allocation.',
      'STORAGE_QUOTA_EXCEEDED',
    );
  }
}
