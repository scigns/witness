/**
 * Storage quota (commercial-runtime-readiness work, succeeding Flight 1's
 * flat "5 GB included storage per organisation").
 *
 * USED is computed on demand from the two tables that actually hold bytes
 * (`EvidenceAttachment`, `Resource`) rather than maintained as a running
 * counter: a counter can drift from reality (a failed write that partially
 * updated one but not the other, a row deleted outside the normal path), and
 * an aggregate query is cheap enough at the scale one organisation's content
 * reaches that the risk of drift is not worth taking on for the sake of an
 * O(1) read. Includes bytes regardless of which StoragePort adapter holds
 * them (Postgres-inline `content` or an S3-compatible object store,
 * `storage.port.ts`) — `sizeBytes` is recorded at write time either way.
 *
 * ALLOCATED is resolved live: `organisation.storageQuotaBytes`, when an
 * administrator has explicitly set it, takes precedence; otherwise it is
 * the organisation's effective commercial `ResourceProfile`'s
 * `storageQuotaBytes` (Plan default, or a negotiated
 * `SubscriptionEntitlementOverride` on `resource.profile`) — a plan change
 * is reflected immediately, with no data migration. `DEFAULT_STORAGE_QUOTA_BYTES`
 * is the fallback of last resort, used only if an organisation somehow has
 * no resolvable subscription at all.
 *
 * Never deletes content at quota. `checkQuota` is called before a write, not
 * after — the only enforcement is refusing to accept more, which the caller
 * (`EvidenceAttachmentService`, `ResourcesService`) turns into a clean 4xx
 * before anything is written. That call is a fast, non-transactional
 * pre-check (avoids wasting a StoragePort write on an obviously-over-quota
 * request); the authoritative, race-safe check is `checkQuotaInTransaction`,
 * which MUST run inside the same transaction as the row it is guarding,
 * after `lockForWrite` — two simultaneous uploads for the same organisation
 * otherwise both read the same stale USED figure and can jointly exceed the
 * quota (TOCTOU). See `evidence-attachment.service.ts`/`resources.service.ts`
 * for the two call sites.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { DEFAULT_STORAGE_QUOTA_BYTES, InvariantViolation } from '@witness/domain';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { EffectiveCommercialConfigurationService } from '../commercial/effective-commercial-configuration.service.js';

export type StorageQuotaSource = 'ADMIN_OVERRIDE' | 'RESOURCE_PROFILE' | 'FALLBACK_DEFAULT';

export interface StorageUsage {
  readonly usedBytes: bigint;
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
      const config = await this.commercialConfiguration.resolveFor(organisationId);
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

  private async usageVia(
    db: PrismaService | TransactionClient,
    organisationId: string,
  ): Promise<StorageUsage> {
    const [used, { allocatedBytes, source }] = await Promise.all([
      this.usedBytes(db, organisationId),
      this.resolveAllocatedBytes(db, organisationId),
    ]);
    const availableBytes = allocatedBytes > used ? allocatedBytes - used : 0n;
    const percentageUsed =
      allocatedBytes === 0n ? 100 : Math.min(100, Number((used * 10000n) / allocatedBytes) / 100);

    return {
      usedBytes: used,
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
    const { usedBytes, quotaBytes } = await this.usage(organisationId);
    assertWithinQuota(usedBytes, quotaBytes, additionalBytes);
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
  ): Promise<void> {
    const { usedBytes, quotaBytes } = await this.usageVia(tx, organisationId);
    assertWithinQuota(usedBytes, quotaBytes, additionalBytes);
  }
}

function assertWithinQuota(usedBytes: bigint, quotaBytes: bigint, additionalBytes: number): void {
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
