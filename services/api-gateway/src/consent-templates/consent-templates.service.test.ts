/**
 * Service-level tests for `ConsentTemplatesService`, against an in-memory
 * Prisma double — see `participants.service.test.ts` for why this pattern
 * exists (no live Postgres was available while building this capability).
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainError } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { ConsentTemplatesService } from './consent-templates.service.js';

const ADMIN: Principal = {
  subject: 'dev:admin',
  displayName: 'An Admin',
  kind: 'human',
  roles: ['admin'],
};

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const ORG_2 = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_1 = '33333333-3333-4333-8333-333333333333';

function categories() {
  return [
    { category: 'participation', required: true },
    { category: 'audio_recording', required: false },
  ];
}

function createRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Community Consultation Consent',
    purpose: 'Consent to participate in a community consultation workshop.',
    plainLanguageSummary: 'We will ask what you think and may record it.',
    supportedLanguages: ['en'],
    categories: categories(),
    ...overrides,
  };
}

function fakePrisma() {
  const organisations: Record<string, unknown>[] = [{ id: ORG_1 }, { id: ORG_2 }];
  const workspaces: Record<string, unknown>[] = [{ id: WORKSPACE_1, organisationId: ORG_1 }];
  const templates: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    organisation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = organisations.find((o) => o['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = workspaces.find((w) => w['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    consentTemplate: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = templates.find((t) => t['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
      findMany: async ({
        where,
        distinct,
        orderBy,
      }: {
        where: { organisationId?: string; familyId?: string };
        distinct?: string[];
        orderBy?: unknown;
      }) => {
        let rows = templates.filter(
          (t) =>
            (where.organisationId === undefined || t['organisationId'] === where.organisationId) &&
            (where.familyId === undefined || t['familyId'] === where.familyId),
        );
        rows = [...rows].sort((a, b) => (b['version'] as number) - (a['version'] as number));
        if (distinct?.includes('familyId')) {
          const seen = new Set<string>();
          rows = rows.filter((r) => {
            const key = r['familyId'] as string;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        void orderBy;
        return rows.map((r) => ({ ...r }));
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        templates.push({ ...data });
        return { ...data };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; revision: number };
        data: Record<string, unknown>;
      }) => {
        const row = templates.find((t) => t['id'] === where.id && t['revision'] === where.revision);
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
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
        actors.push({ ...data });
        return { ...data };
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
        templates: templates.map((t) => ({ ...t })),
        actors: actors.map((a) => ({ ...a })),
        auditEvents: auditEvents.map((e) => ({ ...e })),
      };
      try {
        return await fn(prisma);
      } catch (error) {
        templates.splice(0, templates.length, ...snapshot.templates);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return { prisma: prisma as unknown as PrismaService, templates, auditEvents };
}

describe('ConsentTemplatesService.create', () => {
  it('creates version 1 as a draft', async () => {
    const { prisma, auditEvents } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);

    const detail = await service.create(ORG_1, createRequest(), ADMIN);

    expect(detail.version).toBe(1);
    expect(detail.status).toBe('draft');
    expect(detail.permittedActions).toEqual(['activate']);
    expect(auditEvents.some((e) => e['action'] === 'consent_template.created')).toBe(true);
  });

  it('ATTACK — rejects a template with no participation category', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);

    await expect(
      service.create(
        ORG_1,
        createRequest({ categories: [{ category: 'audio_recording', required: false }] }),
        ADMIN,
      ),
    ).rejects.toThrow(DomainError);
  });

  it('rejects creating a template in a non-existent organisation', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);

    await expect(service.create('ghost-org', createRequest(), ADMIN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ATTACK — rejects a workspace that belongs to a different organisation', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);

    await expect(
      service.create(ORG_2, createRequest({ workspaceId: WORKSPACE_1 }), ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ConsentTemplatesService versioning', () => {
  it('creates a new version sharing the same familyId, never mutating the previous row', async () => {
    const { prisma, templates } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);
    const v1 = await service.create(ORG_1, createRequest(), ADMIN);
    const v1Snapshot = { ...templates.find((t) => t['id'] === v1.id) };

    const v2 = await service.createVersion(ORG_1, v1.id, { name: 'Updated Terms' }, ADMIN);

    expect(v2.familyId).toBe(v1.familyId);
    expect(v2.version).toBe(2);
    expect(v2.name).toBe('Updated Terms');
    expect(templates.find((t) => t['id'] === v1.id)).toEqual(v1Snapshot);
  });

  it('lists only the latest version per family', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);
    const v1 = await service.create(ORG_1, createRequest(), ADMIN);
    await service.createVersion(ORG_1, v1.id, { name: 'V2' }, ADMIN);

    const list = await service.list(ORG_1);

    expect(list).toHaveLength(1);
    expect(list[0]!.version).toBe(2);
  });

  it('returns every version in version-descending order from the versions endpoint', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);
    const v1 = await service.create(ORG_1, createRequest(), ADMIN);
    await service.createVersion(ORG_1, v1.id, { name: 'V2' }, ADMIN);

    const versions = await service.versions(ORG_1, v1.id);

    expect(versions.map((v) => v.version)).toEqual([2, 1]);
  });
});

describe('ConsentTemplatesService lifecycle', () => {
  it('activates a draft template', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);
    const draft = await service.create(ORG_1, createRequest(), ADMIN);

    const active = await service.applyAction(
      ORG_1,
      draft.id,
      { action: 'activate', expectedRevision: draft.revision },
      ADMIN,
    );

    expect(active.status).toBe('active');
    expect(active.permittedActions).toEqual(['retire']);
  });

  it('ATTACK — rejects activating an already-active template', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);
    const draft = await service.create(ORG_1, createRequest(), ADMIN);
    const active = await service.applyAction(
      ORG_1,
      draft.id,
      { action: 'activate', expectedRevision: draft.revision },
      ADMIN,
    );

    await expect(
      service.applyAction(
        ORG_1,
        draft.id,
        { action: 'activate', expectedRevision: active.revision },
        ADMIN,
      ),
    ).rejects.toThrow(DomainError);
  });

  it('ATTACK — rejects a stale expectedRevision', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);
    const draft = await service.create(ORG_1, createRequest(), ADMIN);

    await expect(
      service.applyAction(
        ORG_1,
        draft.id,
        { action: 'activate', expectedRevision: draft.revision + 1 },
        ADMIN,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('retires an active template', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);
    const draft = await service.create(ORG_1, createRequest(), ADMIN);
    const active = await service.applyAction(
      ORG_1,
      draft.id,
      { action: 'activate', expectedRevision: draft.revision },
      ADMIN,
    );

    const retired = await service.applyAction(
      ORG_1,
      draft.id,
      { action: 'retire', expectedRevision: active.revision },
      ADMIN,
    );

    expect(retired.status).toBe('retired');
    expect(retired.permittedActions).toEqual([]);
  });
});

describe('ConsentTemplatesService cross-organisation isolation', () => {
  it('ATTACK — a template cannot be read through an organisation it does not belong to', async () => {
    const { prisma } = fakePrisma();
    const service = new ConsentTemplatesService(prisma);
    const created = await service.create(ORG_1, createRequest(), ADMIN);

    await expect(service.get(ORG_2, created.id)).rejects.toThrow(NotFoundException);
  });
});
