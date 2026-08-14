/**
 * Storage quota — Flight 1's "5 GB included storage per organisation".
 *
 * Usage is computed on demand from the two tables that actually hold bytes
 * (`EvidenceAttachment`, `Resource`) rather than maintained as a running
 * counter: a counter can drift from reality (a failed write that partially
 * updated one but not the other, a row deleted outside the normal path), and
 * an aggregate query is cheap enough at the scale one organisation's content
 * reaches that the risk of drift is not worth taking on for the sake of an
 * O(1) read. Includes bytes regardless of which StoragePort adapter holds
 * them (Postgres-inline `content` or an S3-compatible object store,
 * `storage.port.ts`) — `sizeBytes` is recorded at write time either way.
 *
 * Never deletes content at quota. `checkQuota` is called before a write, not
 * after — the only enforcement is refusing to accept more, which the caller
 * (`EvidenceAttachmentService`, `ResourcesService`) turns into a clean 4xx
 * before anything is written.
 */

import { Injectable } from '@nestjs/common';

import { InvariantViolation } from '@witness/domain';

import { PrismaService } from '../infrastructure/prisma.service.js';

export interface StorageUsage {
  readonly usedBytes: bigint;
  readonly quotaBytes: bigint;
}

@Injectable()
export class StorageQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async usage(organisationId: string): Promise<StorageUsage> {
    const [organisation, attachmentTotal, resourceTotal] = await Promise.all([
      this.prisma.organisation.findUniqueOrThrow({
        where: { id: organisationId },
        select: { storageQuotaBytes: true },
      }),
      this.prisma.evidenceAttachment.aggregate({
        where: { evidence: { organisationId } },
        _sum: { sizeBytes: true },
      }),
      this.prisma.resource.aggregate({
        where: { workspace: { organisationId } },
        _sum: { sizeBytes: true },
      }),
    ]);

    const usedBytes =
      BigInt(attachmentTotal._sum.sizeBytes ?? 0) + BigInt(resourceTotal._sum.sizeBytes ?? 0);

    return { usedBytes, quotaBytes: organisation.storageQuotaBytes };
  }

  /**
   * Throws `InvariantViolation('STORAGE_QUOTA_EXCEEDED')` if adding
   * `additionalBytes` would put the organisation over quota. Existing
   * content is never touched by this check — it only ever refuses a new
   * write, and the caller decides how to surface that (see the file
   * header).
   */
  async checkQuota(organisationId: string, additionalBytes: number): Promise<void> {
    const { usedBytes, quotaBytes } = await this.usage(organisationId);
    const projected = usedBytes + BigInt(additionalBytes);

    if (projected > quotaBytes) {
      throw new InvariantViolation(
        `This organisation has used ${usedBytes} of ${quotaBytes} bytes of included storage. ` +
          `Adding ${additionalBytes} more bytes would exceed the quota. Existing content is ` +
          'unaffected — export or remove content to free up space, or ask an operator to ' +
          'increase the quota.',
        'STORAGE_QUOTA_EXCEEDED',
      );
    }
  }
}
