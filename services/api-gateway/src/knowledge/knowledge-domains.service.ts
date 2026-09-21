/**
 * KnowledgeDomain governance configuration — Organisation Admin's "configure
 * governance policies... assign Knowledge Steward responsibilities" from
 * the originating feature request. Manage/create is gated on
 * `knowledge_domain:manage` (org-admin tier only); read is broad.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createKnowledgeDomain,
  toKnowledgeDomainId,
  toOrganisationId,
  toWorkspaceId,
  updateKnowledgeDomainPolicy,
  type AssertionValidationPolicy,
  type KnowledgeDomain,
} from '@witness/domain';
import type {
  CreateKnowledgeDomainRequest,
  KnowledgeDomainView,
  UpdateKnowledgeDomainPolicyRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

type KnowledgeDomainRow = Awaited<ReturnType<PrismaService['knowledgeDomain']['findFirstOrThrow']>>;

function toView(row: KnowledgeDomainRow): KnowledgeDomainView {
  const policy = row.validationPolicy as {
    requiresReviewerValidation: boolean;
    requiresCommunityValidation: boolean;
    permitsExternalPublication: boolean;
  };
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    key: row.key,
    name: row.name,
    description: row.description,
    validationPolicy: policy,
    defaultSensitivity: row.defaultSensitivity as KnowledgeDomainView['defaultSensitivity'],
    createdAt: row.createdAt.toISOString(),
  };
}

function toDomain(row: KnowledgeDomainRow): KnowledgeDomain {
  return {
    id: toKnowledgeDomainId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    key: row.key,
    name: row.name,
    description: row.description,
    validationPolicy: row.validationPolicy as unknown as AssertionValidationPolicy,
    defaultSensitivity: row.defaultSensitivity as KnowledgeDomain['defaultSensitivity'],
    createdAt: row.createdAt,
    createdBy: { id: row.createdById as never, kind: 'human', displayName: '' },
    version: row.version,
  };
}

@Injectable()
export class KnowledgeDomainsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<KnowledgeDomainView[]> {
    const rows = await this.prisma.knowledgeDomain.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toView);
  }

  async get(workspaceId: string, domainId: string): Promise<KnowledgeDomainView> {
    const row = await this.prisma.knowledgeDomain.findFirst({
      where: { id: domainId, workspaceId },
    });
    if (row === null) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Knowledge domain not found.' },
      });
    }
    return toView(row);
  }

  async create(
    organisationId: string,
    workspaceId: string,
    request: CreateKnowledgeDomainRequest,
    principal: Principal,
  ): Promise<KnowledgeDomainView> {
    const actor = await resolveActor(this.prisma, principal);
    const { domain, event } = createKnowledgeDomain({
      id: toKnowledgeDomainId(randomUUID()),
      organisationId: toOrganisationId(organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      key: request.key,
      name: request.name,
      description: request.description ?? null,
      validationPolicy: request.validationPolicy as Partial<AssertionValidationPolicy> | undefined,
      ...(request.defaultSensitivity ? { defaultSensitivity: request.defaultSensitivity } : {}),
      createdBy: actor,
      at: new Date(),
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeDomain.create({
        data: {
          id: domain.id,
          organisationId: domain.organisationId,
          workspaceId: domain.workspaceId,
          key: domain.key,
          name: domain.name,
          description: domain.description,
          validationPolicy: { ...domain.validationPolicy },
          defaultSensitivity: domain.defaultSensitivity,
          createdAt: domain.createdAt,
          createdById: domain.createdBy.id,
          version: domain.version,
        },
      });
      await appendAuditEvent(tx, 'knowledge_domain', created.id, event, domain.createdAt);
      return created;
    });

    return toView(row);
  }

  /**
   * Governance-policy-only edit — steward assignment / domain retirement are
   * separate concerns not requested here (ADR-0026 point 3 scopes
   * `KnowledgeDomain` to `validationPolicy` + `defaultSensitivity`; `key` and
   * `name` are not revised through this path once other rows reference the
   * domain by id).
   */
  async updatePolicy(
    workspaceId: string,
    domainId: string,
    request: UpdateKnowledgeDomainPolicyRequest,
    principal: Principal,
  ): Promise<KnowledgeDomainView> {
    const row = await this.prisma.knowledgeDomain.findFirst({
      where: { id: domainId, workspaceId },
    });
    if (row === null) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Knowledge domain not found.' },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const patch: Partial<AssertionValidationPolicy> = {
      ...(request.requiresReviewerValidation !== undefined
        ? { requiresReviewerValidation: request.requiresReviewerValidation }
        : {}),
      ...(request.requiresCommunityValidation !== undefined
        ? { requiresCommunityValidation: request.requiresCommunityValidation }
        : {}),
      ...(request.permitsExternalPublication !== undefined
        ? { permitsExternalPublication: request.permitsExternalPublication }
        : {}),
    };
    const { domain, event } = updateKnowledgeDomainPolicy(toDomain(row), patch, actor);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.knowledgeDomain.update({
        where: { id: domainId },
        data: { validationPolicy: { ...domain.validationPolicy }, version: domain.version },
      });
      await appendAuditEvent(tx, 'knowledge_domain', domainId, event, new Date());
      return saved;
    });

    return toView(updated);
  }
}
