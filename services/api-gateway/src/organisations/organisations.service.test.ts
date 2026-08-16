/**
 * `OrganisationsService.list` is a visibility boundary, not just a
 * convenience filter — a real session must only see organisations it holds
 * a membership row in, independent of any single record's authorisation
 * check (Milestone 1.4, Authorisation hardening). The unverified
 * `X-Witness-Dev-User` path is untouched: it has always seen everything,
 * and there is no membership set to scope a header nobody has verified to.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { OrganisationsService } from './organisations.service.js';
import type { StorageQuotaService } from './storage-quota.service.js';
import type { ConsentTemplatesService } from '../consent-templates/consent-templates.service.js';

function fakeConsentTemplates(): ConsentTemplatesService & { create: ReturnType<typeof vi.fn> } {
  return { create: vi.fn().mockResolvedValue(undefined) } as unknown as ConsentTemplatesService & {
    create: ReturnType<typeof vi.fn>;
  };
}

const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

function fakeStorageQuota(
  usage: StorageQuotaService['usage'] = async () => ({
    usedBytes: 0n,
    quotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
  }),
) {
  return { usage, checkQuota: async () => {} } as unknown as StorageQuotaService;
}

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const ORG_2 = '22222222-2222-4222-8222-222222222222';
const USER_1 = '33333333-3333-4333-8333-333333333333';

const SESSION_PRINCIPAL: Principal = {
  subject: `user:${USER_1}`,
  displayName: 'Real Session User',
  kind: 'human',
  roles: [],
};

const DEV_PRINCIPAL: Principal = {
  subject: 'dev:Local Dev',
  displayName: 'Local Dev',
  kind: 'human',
  roles: ['admin'],
};

interface FakeUser {
  id: string;
  email: string;
  displayName: string;
  accountState: string;
}

function fakePrisma(options: {
  organisations: { id: string; name: string }[];
  organisationMemberships?: { organisationId: string; userId: string }[];
  users?: FakeUser[];
  /** Simulates a concurrent create winning the race for this email once. */
  raceOnEmail?: string;
}) {
  const memberships = options.organisationMemberships ?? [];
  const organisations = options.organisations.map((o) => ({
    ...o,
    storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
    profile: 'general',
    createdAt: new Date(),
  }));
  const users = [...(options.users ?? [])];
  const actors: { id: string; kind: string; displayName: string }[] = [];
  const roleAssignments: {
    id: string;
    scopeType: string;
    organisationId: string;
    userId: string;
    role: string;
  }[] = [];
  const auditEvents: { subjectType: string; subjectId: string; action: string }[] = [];
  let raceOnEmail = options.raceOnEmail ?? null;

  const organisationOps = {
    create: async ({
      data,
    }: {
      data: {
        id: string;
        name: string;
        storageQuotaBytes: bigint;
        profile: string;
        createdAt: Date;
      };
    }) => {
      if (organisations.some((o) => o.name === data.name)) {
        throw { code: 'P2002' };
      }
      organisations.push({ ...data });
      return data;
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      organisations.find((o) => o.id === where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { storageQuotaBytes: bigint };
    }) => {
      const row = organisations.find((o) => o.id === where.id);
      if (row === undefined) throw new Error('organisation not found');
      row.storageQuotaBytes = data.storageQuotaBytes;
      return row;
    },
  };

  const tx = {
    organisation: organisationOps,
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) =>
        actors.find((a) => a.displayName === where.displayName && a.kind === where.kind) ?? null,
      create: async ({ data }: { data: { id: string; kind: string; displayName: string } }) => {
        actors.push(data);
        return data;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        users.find((u) => u.email === where.email) ?? null,
      create: async ({ data }: { data: FakeUser }) => {
        // Simulates a second request's insert winning the race for this
        // email between this test's own findUnique and create.
        if (raceOnEmail === data.email) {
          raceOnEmail = null;
          users.push({ ...data, id: `${data.id}-winner` });
          throw { code: 'P2002' };
        }
        users.push(data);
        return data;
      },
    },
    organisationMembership: {
      create: async ({ data }: { data: { organisationId: string; userId: string } }) => {
        memberships.push(data);
        return data;
      },
    },
    roleAssignment: {
      create: async ({
        data,
      }: {
        data: {
          id: string;
          scopeType: string;
          organisationId: string;
          userId: string;
          role: string;
        };
      }) => {
        roleAssignments.push(data);
        return data;
      },
    },
    auditEvent: {
      findFirst: async () => null,
      create: async ({
        data,
      }: {
        data: { subjectType: string; subjectId: string; action: string };
      }) => {
        auditEvents.push(data);
        return data;
      },
    },
  };

  const prisma = {
    organisation: {
      findMany: async ({ where }: { where?: { id?: { in: string[] } } }) => {
        const rows = organisations.map((o) => ({ ...o }));
        if (where?.id === undefined) return rows;
        return rows.filter((o) => where.id!.in.includes(o.id));
      },
      findUnique: organisationOps.findUnique,
    },
    organisationMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        memberships.filter((m) => m.userId === where.userId),
    },
    actor: tx.actor,
    $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(tx),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    state: { organisations, users, memberships, roleAssignments, auditEvents },
  };
}

describe('OrganisationsService.list — visibility scoping', () => {
  it('a real session only sees organisations it has a membership row in', async () => {
    const { prisma } = fakePrisma({
      organisations: [
        { id: ORG_1, name: 'Org One' },
        { id: ORG_2, name: 'Org Two' },
      ],
      organisationMemberships: [{ organisationId: ORG_1, userId: USER_1 }],
    });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    const result = await service.list(SESSION_PRINCIPAL);

    expect(result.map((o) => o.id)).toEqual([ORG_1]);
  });

  it('a real session with no memberships sees no organisations', async () => {
    const { prisma } = fakePrisma({
      organisations: [
        { id: ORG_1, name: 'Org One' },
        { id: ORG_2, name: 'Org Two' },
      ],
    });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    const result = await service.list(SESSION_PRINCIPAL);

    expect(result).toEqual([]);
  });

  it('the unverified dev-header path is unscoped, as before', async () => {
    const { prisma } = fakePrisma({
      organisations: [
        { id: ORG_1, name: 'Org One' },
        { id: ORG_2, name: 'Org Two' },
      ],
    });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    const result = await service.list(DEV_PRINCIPAL);

    expect(result.map((o) => o.id).sort()).toEqual([ORG_1, ORG_2].sort());
  });
});

describe('OrganisationsService.create — provisions an administrator', () => {
  it('creates the organisation, invites the administrator, and grants them organisation-scoped admin', async () => {
    const { prisma, state } = fakePrisma({ organisations: [] });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    const result = await service.create(
      'New Institution',
      'admin@new-institution.example',
      'New Admin',
      SESSION_PRINCIPAL,
    );

    expect(state.organisations).toHaveLength(1);
    expect(state.organisations[0]).toMatchObject({
      id: result.id,
      name: 'New Institution',
      storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
    });
    expect(state.users).toHaveLength(1);
    expect(state.users[0]).toMatchObject({
      email: 'admin@new-institution.example',
      displayName: 'New Admin',
      accountState: 'invited',
    });
    const invitedUserId = state.users[0]!.id;
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({
      organisationId: result.id,
      userId: invitedUserId,
    });
    expect(state.roleAssignments).toHaveLength(1);
    expect(state.roleAssignments[0]).toMatchObject({
      scopeType: 'organisation',
      organisationId: result.id,
      userId: invitedUserId,
      role: 'admin',
    });
    expect(state.auditEvents.map((e) => e.action)).toEqual([
      'organisation.created',
      'user.invited',
    ]);
  });

  it('defaults to the general profile and never seeds a starter consent template for it', async () => {
    const { prisma } = fakePrisma({ organisations: [] });
    const consentTemplates = fakeConsentTemplates();
    const service = new OrganisationsService(prisma, fakeStorageQuota(), consentTemplates);

    const result = await service.create(
      'General Institution',
      'admin@general.example',
      'Admin',
      SESSION_PRINCIPAL,
    );

    expect(result.profile).toBe('general');
    expect(consentTemplates.create).not.toHaveBeenCalled();
  });

  it("accepts an explicit profile and quota, and seeds that profile's starter consent template", async () => {
    const { prisma, state } = fakePrisma({ organisations: [] });
    const consentTemplates = fakeConsentTemplates();
    const service = new OrganisationsService(prisma, fakeStorageQuota(), consentTemplates);
    const tenGb = 10 * 1024 * 1024 * 1024;

    const result = await service.create(
      'Church Institution',
      'admin@church.example',
      'Admin',
      SESSION_PRINCIPAL,
      'church',
      tenGb,
    );

    expect(result.profile).toBe('church');
    expect(state.organisations[0]).toMatchObject({
      profile: 'church',
      storageQuotaBytes: BigInt(tenGb),
    });
    expect(consentTemplates.create).toHaveBeenCalledTimes(1);
    expect(consentTemplates.create).toHaveBeenCalledWith(
      result.id,
      expect.objectContaining({ name: expect.stringContaining('Congregational') }),
      SESSION_PRINCIPAL,
    );
  });

  it('does not fail organisation creation when starter consent template seeding fails', async () => {
    const { prisma } = fakePrisma({ organisations: [] });
    const consentTemplates = fakeConsentTemplates();
    consentTemplates.create.mockRejectedValueOnce(new Error('seeding failed'));
    const service = new OrganisationsService(prisma, fakeStorageQuota(), consentTemplates);

    const result = await service.create(
      'Resilient Institution',
      'admin@resilient.example',
      'Admin',
      SESSION_PRINCIPAL,
      'spc',
    );

    expect(result.id).toBeDefined();
    expect(result.profile).toBe('spc');
  });

  it('rejects a duplicate organisation name with a clean conflict, not a 500', async () => {
    const { prisma } = fakePrisma({
      organisations: [{ id: ORG_1, name: 'Existing Institution' }],
    });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    await expect(
      service.create('Existing Institution', 'admin@dup.example', 'Admin', SESSION_PRINCIPAL),
    ).rejects.toThrow(ConflictException);
  });

  it('reuses an existing user by email rather than creating a duplicate, and adds no second user.invited event', async () => {
    const { prisma, state } = fakePrisma({
      organisations: [],
      users: [
        {
          id: USER_1,
          email: 'shared-admin@example.org',
          displayName: 'Shared Admin',
          accountState: 'active',
        },
      ],
    });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    await service.create(
      'Second Org',
      'shared-admin@example.org',
      'Shared Admin',
      SESSION_PRINCIPAL,
    );

    expect(state.users).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({ userId: USER_1 });
    expect(state.auditEvents.map((e) => e.action)).toEqual(['organisation.created']);
  });

  it('ATTACK — a concurrent create winning the race for the same email is reused instead of failing the request', async () => {
    // Between this service's own findUnique and create, a P2002 from the
    // unique index on email means another request got there first — the
    // fallback re-fetches and continues with that row rather than
    // surfacing a 500 for something that is not actually a conflict from
    // the caller's point of view.
    const { prisma, state } = fakePrisma({
      organisations: [],
      raceOnEmail: 'racing-admin@example.org',
    });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    const result = await service.create(
      'Third Org',
      'racing-admin@example.org',
      'Racing Admin',
      SESSION_PRINCIPAL,
    );

    expect(state.users).toHaveLength(1);
    const winnerId = state.users[0]!.id;
    expect(winnerId).toMatch(/-winner$/);
    expect(state.memberships[0]).toMatchObject({ organisationId: result.id, userId: winnerId });
    expect(state.roleAssignments[0]).toMatchObject({ organisationId: result.id, userId: winnerId });
    // The user row that won the race is not this request's to have invited.
    expect(state.auditEvents.map((e) => e.action)).toEqual(['organisation.created']);
  });
});

describe('OrganisationsService.storage', () => {
  it('returns usage and quota as decimal strings — bigint does not survive JSON.stringify', async () => {
    const { prisma } = fakePrisma({ organisations: [{ id: ORG_1, name: 'Org One' }] });
    const storageQuota = fakeStorageQuota(async () => ({
      usedBytes: 2_147_483_648n,
      quotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
    }));
    const service = new OrganisationsService(prisma, storageQuota, fakeConsentTemplates());

    const result = await service.storage(ORG_1);

    expect(result).toEqual({
      usedBytes: '2147483648',
      quotaBytes: String(DEFAULT_STORAGE_QUOTA_BYTES),
    });
  });
});

describe('OrganisationsService.setStorageQuota', () => {
  it('replaces the quota, preserves existing content untouched, and records an audit event', async () => {
    const { prisma, state } = fakePrisma({ organisations: [{ id: ORG_1, name: 'Org One' }] });
    // Reads the quota back from the same state fakePrisma mutates — setStorageQuota's
    // final `return this.storage(...)` call goes through this service, and in
    // production it re-reads the row this method just updated in the same
    // database, so the fake needs to reflect that instead of a fixed value.
    const storageQuota = fakeStorageQuota(async () => ({
      usedBytes: 0n,
      quotaBytes: state.organisations[0]!.storageQuotaBytes,
    }));
    const service = new OrganisationsService(prisma, storageQuota, fakeConsentTemplates());
    const newQuota = 10 * 1024 * 1024 * 1024;

    const result = await service.setStorageQuota(ORG_1, newQuota, SESSION_PRINCIPAL);

    expect(result.quotaBytes).toBe(String(newQuota));
    expect(state.organisations[0]?.storageQuotaBytes).toBe(BigInt(newQuota));
    expect(state.auditEvents.map((e) => e.action)).toEqual(['organisation.storage_quota_updated']);
  });

  it('404s for an organisation that does not exist', async () => {
    const { prisma } = fakePrisma({ organisations: [] });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    await expect(service.setStorageQuota(ORG_1, 1024, SESSION_PRINCIPAL)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a non-positive quota — the domain layer, not the controller, is the one source of truth for this', async () => {
    const { prisma } = fakePrisma({ organisations: [{ id: ORG_1, name: 'Org One' }] });
    const service = new OrganisationsService(prisma, fakeStorageQuota(), fakeConsentTemplates());

    await expect(service.setStorageQuota(ORG_1, 0, SESSION_PRINCIPAL)).rejects.toThrow();
  });
});
