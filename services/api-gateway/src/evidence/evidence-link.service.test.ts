/**
 * Service-level tests for `EvidenceLinkService`, against the same in-memory
 * Prisma double pattern as `evidence.service.test.ts`.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainError } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { EvidenceLinkService } from './evidence-link.service.js';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';
const SESSION_2 = '39999999-9999-4999-8999-999999999999';
const EVIDENCE_A = '77777777-7777-4777-8777-777777777777';
const EVIDENCE_B = '78888888-8888-4888-8888-888888888888';
const EVIDENCE_OTHER_SESSION = '79999999-9999-4999-8999-999999999999';

function baseEvidenceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    organisationId: '00000000-0000-4000-8000-000000000000',
    workspaceId: WORKSPACE_1,
    sessionId: SESSION_1,
    evidenceType: 'observation',
    title: 'x',
    content: 'x',
    ...overrides,
  };
}

function fakePrisma() {
  const evidenceRows: Record<string, unknown>[] = [
    { id: EVIDENCE_A, ...baseEvidenceRow() },
    { id: EVIDENCE_B, ...baseEvidenceRow() },
    { id: EVIDENCE_OTHER_SESSION, ...baseEvidenceRow({ sessionId: SESSION_2 }) },
  ];
  const evidenceLinks: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    evidence: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = evidenceRows.find((e) => e['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    evidenceLink: {
      findFirst: async ({
        where,
      }: {
        where: { fromEvidenceId: string; toEvidenceId: string; linkType: string };
      }) => {
        const row = evidenceLinks.find(
          (l) =>
            l['fromEvidenceId'] === where.fromEvidenceId &&
            l['toEvidenceId'] === where.toEvidenceId &&
            l['linkType'] === where.linkType,
        );
        return row === undefined ? null : { ...row };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = evidenceLinks.find((l) => l['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
      findMany: async ({
        where,
      }: {
        where: { OR: { fromEvidenceId?: string; toEvidenceId?: string }[] };
      }) =>
        evidenceLinks
          .filter((l) =>
            where.OR.some(
              (clause) =>
                (clause.fromEvidenceId !== undefined &&
                  l['fromEvidenceId'] === clause.fromEvidenceId) ||
                (clause.toEvidenceId !== undefined && l['toEvidenceId'] === clause.toEvidenceId),
            ),
          )
          .map((l) => ({ ...l, createdBy: actors.find((a) => a['id'] === l['createdById']) })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        evidenceLinks.push({ ...data });
        return { ...data };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = evidenceLinks.findIndex((l) => l['id'] === where.id);
        if (index === -1) throw new Error('link not found');
        const [removed] = evidenceLinks.splice(index, 1);
        return removed;
      },
    },
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) => {
        const row = actors.find(
          (a) => a['displayName'] === where.displayName && a['kind'] === where.kind,
        );
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data };
        actors.push(row);
        return row;
      },
    },
    auditEvent: {
      findFirst: async ({ where }: { where: { subjectType: string; subjectId: string } }) => {
        const matching = auditEvents.filter(
          (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
        );
        return matching.at(-1) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => {
      const snapshot = {
        evidenceLinks: evidenceLinks.map((l) => ({ ...l })),
        actors: actors.map((a) => ({ ...a })),
        auditEvents: auditEvents.map((e) => ({ ...e })),
      };
      try {
        return await fn(prisma);
      } catch (error) {
        evidenceLinks.splice(0, evidenceLinks.length, ...snapshot.evidenceLinks);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return { prisma: prisma as unknown as PrismaService, evidenceLinks, auditEvents };
}

function linkRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return { linkType: 'supports', toEvidenceId: EVIDENCE_B, ...overrides } as never;
}

describe('EvidenceLinkService.create', () => {
  it('creates a link between two pieces of evidence in the same session', async () => {
    const { prisma } = fakePrisma();
    const service = new EvidenceLinkService(prisma);

    const link = await service.create(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_A,
      linkRequest(),
      FACILITATOR,
    );

    expect(link.fromEvidenceId).toBe(EVIDENCE_A);
    expect(link.toEvidenceId).toBe(EVIDENCE_B);
    expect(link.linkType).toBe('supports');
  });

  it('ATTACK — rejects a duplicate link of the same type', async () => {
    const { prisma } = fakePrisma();
    const service = new EvidenceLinkService(prisma);
    await service.create(WORKSPACE_1, SESSION_1, EVIDENCE_A, linkRequest(), FACILITATOR);

    await expect(
      service.create(WORKSPACE_1, SESSION_1, EVIDENCE_A, linkRequest(), FACILITATOR),
    ).rejects.toThrow(ConflictException);
  });

  it('allows two different link types between the same pair', async () => {
    const { prisma } = fakePrisma();
    const service = new EvidenceLinkService(prisma);
    await service.create(WORKSPACE_1, SESSION_1, EVIDENCE_A, linkRequest(), FACILITATOR);

    const second = await service.create(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_A,
      linkRequest({ linkType: 'related_to' }),
      FACILITATOR,
    );
    expect(second.linkType).toBe('related_to');
  });

  it('ATTACK — rejects linking to evidence from a different session (IDOR)', async () => {
    const { prisma } = fakePrisma();
    const service = new EvidenceLinkService(prisma);

    await expect(
      service.create(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_A,
        linkRequest({ toEvidenceId: EVIDENCE_OTHER_SESSION }),
        FACILITATOR,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('ATTACK — rejects linking evidence to itself', async () => {
    const { prisma } = fakePrisma();
    const service = new EvidenceLinkService(prisma);

    await expect(
      service.create(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_A,
        linkRequest({ toEvidenceId: EVIDENCE_A }),
        FACILITATOR,
      ),
    ).rejects.toThrow(DomainError);
  });

  it('ATTACK — rejects a from-evidence id that does not exist in this session', async () => {
    const { prisma } = fakePrisma();
    const service = new EvidenceLinkService(prisma);

    await expect(
      service.create(WORKSPACE_1, SESSION_1, 'ghost-evidence', linkRequest(), FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('EvidenceLinkService.list', () => {
  it('returns links where the evidence is either side of the relationship', async () => {
    const { prisma } = fakePrisma();
    const service = new EvidenceLinkService(prisma);
    await service.create(WORKSPACE_1, SESSION_1, EVIDENCE_A, linkRequest(), FACILITATOR);

    const fromA = await service.list(WORKSPACE_1, SESSION_1, EVIDENCE_A);
    const fromB = await service.list(WORKSPACE_1, SESSION_1, EVIDENCE_B);
    expect(fromA).toHaveLength(1);
    expect(fromB).toHaveLength(1);
  });
});

describe('EvidenceLinkService.remove', () => {
  it('removes a link', async () => {
    const { prisma, evidenceLinks } = fakePrisma();
    const service = new EvidenceLinkService(prisma);
    const link = await service.create(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_A,
      linkRequest(),
      FACILITATOR,
    );

    await service.remove(WORKSPACE_1, SESSION_1, EVIDENCE_A, link.id, FACILITATOR);
    expect(evidenceLinks).toHaveLength(0);
  });

  it('ATTACK — rejects removing a link through evidence it does not involve', async () => {
    const { prisma } = fakePrisma();
    const service = new EvidenceLinkService(prisma);
    const link = await service.create(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_A,
      linkRequest(),
      FACILITATOR,
    );

    await expect(
      service.remove(WORKSPACE_1, SESSION_1, EVIDENCE_OTHER_SESSION, link.id, FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });
});
