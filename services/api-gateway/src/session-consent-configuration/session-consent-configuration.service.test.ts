/**
 * Service-level tests for `SessionConsentConfigurationService`, against an
 * in-memory Prisma double — see `participants.service.test.ts` for why this
 * pattern exists.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainError } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { SessionConsentConfigurationService } from './session-consent-configuration.service.js';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_1 = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_2 = '33333333-3333-4333-8333-333333333333';
const SESSION_1 = '44444444-4444-4444-8444-444444444444';
const TEMPLATE_1 = '55555555-5555-4555-8555-555555555555';
const TEMPLATE_DRAFT = '66666666-6666-4666-8666-666666666666';

function fakePrisma(sessionStatus = 'draft') {
  const sessions: Record<string, unknown>[] = [
    {
      id: SESSION_1,
      organisationId: ORG_1,
      workspaceId: WORKSPACE_1,
      status: sessionStatus,
      consentConfigurationState: 'not_configured',
      version: 1,
      updatedAt: new Date(),
    },
  ];
  const templates: Record<string, unknown>[] = [
    {
      id: TEMPLATE_1,
      familyId: 'family-1',
      organisationId: ORG_1,
      workspaceId: null,
      name: 'Consent Terms',
      purpose: 'Purpose',
      description: null,
      version: 1,
      status: 'active',
      plainLanguageSummary: 'Summary',
      supportedLanguages: ['en'],
      categories: [
        { category: 'participation', required: true },
        { category: 'audio_recording', required: false },
      ],
      validFrom: null,
      validUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      revision: 1,
    },
    {
      id: TEMPLATE_DRAFT,
      familyId: 'family-2',
      organisationId: ORG_1,
      workspaceId: null,
      name: 'Draft Terms',
      purpose: 'Purpose',
      description: null,
      version: 1,
      status: 'draft',
      plainLanguageSummary: 'Summary',
      supportedLanguages: ['en'],
      categories: [{ category: 'participation', required: true }],
      validFrom: null,
      validUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      revision: 1,
    },
  ];
  const configurations: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    coDesignSession: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = sessions.find((s) => s['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = sessions.find((s) => s['id'] === where.id && s['version'] === where.version);
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    consentTemplate: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = templates.find((t) => t['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    sessionConsentConfiguration: {
      findUnique: async ({ where }: { where: { sessionId: string } }) => {
        const row = configurations.find((c) => c['sessionId'] === where.sessionId);
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        configurations.push({ ...data });
        return { ...data };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = configurations.find(
          (c) => c['id'] === where.id && c['version'] === where.version,
        );
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
        sessions: sessions.map((s) => ({ ...s })),
        configurations: configurations.map((c) => ({ ...c })),
        actors: actors.map((a) => ({ ...a })),
        auditEvents: auditEvents.map((e) => ({ ...e })),
      };
      try {
        return await fn(prisma);
      } catch (error) {
        sessions.splice(0, sessions.length, ...snapshot.sessions);
        configurations.splice(0, configurations.length, ...snapshot.configurations);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return { prisma: prisma as unknown as PrismaService, sessions, configurations, auditEvents };
}

function configureRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    consentTemplateId: TEMPLATE_1,
    requiredCategories: ['participation'],
    optionalCategories: ['audio_recording'],
    ...overrides,
  };
}

describe('SessionConsentConfigurationService.configure', () => {
  it('attaches an active template and marks the session configured, atomically', async () => {
    const { prisma, sessions, auditEvents } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);

    const view = await service.configure(WORKSPACE_1, SESSION_1, configureRequest(), FACILITATOR);

    expect(view.status).toBe('active');
    expect(view.templateVersion).toBe(1);
    const session = sessions.find((s) => s['id'] === SESSION_1)!;
    expect(session['consentConfigurationState']).toBe('configured');
    expect(auditEvents.some((e) => e['action'] === 'session_consent_configuration.created')).toBe(
      true,
    );
    expect(auditEvents.some((e) => e['action'] === 'co_design_session.updated')).toBe(true);
  });

  it('ATTACK — rejects configuring a session that already has a configuration', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);
    await service.configure(WORKSPACE_1, SESSION_1, configureRequest(), FACILITATOR);

    await expect(
      service.configure(WORKSPACE_1, SESSION_1, configureRequest(), FACILITATOR),
    ).rejects.toThrow(ConflictException);
  });

  it('ATTACK — rejects attaching a draft (not yet active) template', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);

    await expect(
      service.configure(
        WORKSPACE_1,
        SESSION_1,
        configureRequest({ consentTemplateId: TEMPLATE_DRAFT, optionalCategories: [] }),
        FACILITATOR,
      ),
    ).rejects.toThrow(DomainError);
  });

  it('ATTACK — rejects configuring while the session is open', async () => {
    const { prisma } = fakePrisma('open');
    const service = new SessionConsentConfigurationService(prisma);

    await expect(
      service.configure(WORKSPACE_1, SESSION_1, configureRequest(), FACILITATOR),
    ).rejects.toThrow(DomainError);
  });

  it('rejects configuring a session that does not exist', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);

    await expect(
      service.configure(WORKSPACE_1, 'ghost-session', configureRequest(), FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('ATTACK — rejects a template not visible from this workspace', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);

    await expect(
      service.configure(WORKSPACE_2, SESSION_1, configureRequest(), FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('SessionConsentConfigurationService.reconfigure', () => {
  it('updates the configuration, bumping its version', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);
    const configured = await service.configure(
      WORKSPACE_1,
      SESSION_1,
      configureRequest(),
      FACILITATOR,
    );

    const updated = await service.reconfigure(
      WORKSPACE_1,
      SESSION_1,
      { ...configureRequest({ optionalCategories: [] }), expectedVersion: configured.version },
      FACILITATOR,
    );

    expect(updated.optionalCategories).toEqual([]);
    expect(updated.version).toBe(configured.version + 1);
  });

  it('ATTACK — rejects a stale expectedVersion', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);
    const configured = await service.configure(
      WORKSPACE_1,
      SESSION_1,
      configureRequest(),
      FACILITATOR,
    );

    await expect(
      service.reconfigure(
        WORKSPACE_1,
        SESSION_1,
        { ...configureRequest(), expectedVersion: configured.version + 1 },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects reconfiguring a session with no existing configuration', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);

    await expect(
      service.reconfigure(
        WORKSPACE_1,
        SESSION_1,
        { ...configureRequest(), expectedVersion: 1 },
        FACILITATOR,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('SessionConsentConfigurationService.get', () => {
  it('returns 404 before any configuration exists', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);

    await expect(service.get(WORKSPACE_1, SESSION_1)).rejects.toThrow(NotFoundException);
  });

  it('ATTACK — a configuration cannot be read through a workspace it does not belong to', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new SessionConsentConfigurationService(prisma);
    await service.configure(WORKSPACE_1, SESSION_1, configureRequest(), FACILITATOR);

    await expect(service.get(WORKSPACE_2, SESSION_1)).rejects.toThrow(NotFoundException);
  });
});
