import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { KnowledgeDomainsService } from './knowledge-domains.service.js';

const ADMIN: Principal = {
  subject: 'dev:admin',
  displayName: 'An Admin',
  kind: 'human',
  roles: ['organisation_admin'],
};

const ORG = '00000000-0000-4000-8000-000000000000';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE = '22222222-2222-4222-8222-222222222222';

function fakePrisma() {
  const actors: Record<string, unknown>[] = [];
  const domains: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  function actorFor(kind: string, displayName: string) {
    let actor = actors.find((a) => a['kind'] === kind && a['displayName'] === displayName);
    if (actor === undefined) {
      const n = String(actors.length + 1).padStart(12, '0');
      actor = { id: `aaaaaaaa-aaaa-4aaa-8aaa-${n}`, kind, displayName };
      actors.push(actor);
    }
    return actor;
  }

  const txApi = {
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) => {
        const found = actors.find(
          (a) => a['displayName'] === where.displayName && a['kind'] === where.kind,
        );
        return found === undefined ? null : { ...found };
      },
      create: async ({ data }: { data: { id: string; kind: string; displayName: string } }) => {
        const created = actorFor(data.kind, data.displayName);
        return { ...created };
      },
    },
    knowledgeDomain: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        domains.push({ ...data });
        return { ...data };
      },
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const row = domains.find(
          (d) => d['id'] === where.id && d['workspaceId'] === where.workspaceId,
        );
        return row === undefined ? null : { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = domains.findIndex((d) => d['id'] === where.id);
        domains[idx] = { ...domains[idx], ...data };
        return { ...domains[idx] };
      },
    },
    auditEvent: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
  };

  const prisma = {
    ...txApi,
    $transaction: async (fn: (tx: typeof txApi) => Promise<unknown>) => fn(txApi),
  };

  return { prisma, domains, auditEvents };
}

describe('KnowledgeDomainsService', () => {
  it('creates a domain with the default validation policy', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeDomainsService(prisma as never);

    const view = await service.create(
      ORG,
      WORKSPACE,
      { key: 'cultural_knowledge', name: 'Cultural Knowledge' },
      ADMIN,
    );

    expect(view.key).toBe('cultural_knowledge');
    expect(view.validationPolicy.requiresCommunityValidation).toBe(false);
  });

  it('gets a domain by id, scoped to its workspace', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeDomainsService(prisma as never);
    const created = await service.create(ORG, WORKSPACE, { key: 'needs', name: 'Needs' }, ADMIN);

    const fetched = await service.get(WORKSPACE, created.id);
    expect(fetched.name).toBe('Needs');

    await expect(service.get(OTHER_WORKSPACE, created.id)).rejects.toThrow(NotFoundException);
  });

  it('updates only the specified validation-policy fields, leaving others untouched', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeDomainsService(prisma as never);
    const created = await service.create(
      ORG,
      WORKSPACE,
      {
        key: 'cultural_knowledge',
        name: 'Cultural Knowledge',
        validationPolicy: { requiresReviewerValidation: true, permitsExternalPublication: true },
      },
      ADMIN,
    );

    const updated = await service.updatePolicy(
      WORKSPACE,
      created.id,
      { requiresCommunityValidation: true },
      ADMIN,
    );

    expect(updated.validationPolicy).toEqual({
      requiresReviewerValidation: true,
      requiresCommunityValidation: true,
      permitsExternalPublication: true,
    });
  });

  it('404s updating the policy of a domain outside the workspace', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeDomainsService(prisma as never);
    const created = await service.create(ORG, WORKSPACE, { key: 'needs', name: 'Needs' }, ADMIN);

    await expect(
      service.updatePolicy(
        OTHER_WORKSPACE,
        created.id,
        { requiresCommunityValidation: true },
        ADMIN,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
