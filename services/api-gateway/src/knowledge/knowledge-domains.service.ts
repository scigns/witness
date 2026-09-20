/**
 * KnowledgeDomain governance configuration — Organisation Admin's "configure
 * governance policies... assign Knowledge Steward responsibilities" from
 * the originating feature request. Manage/create is gated on
 * `knowledge_domain:manage` (org-admin tier only); read is broad.
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createKnowledgeDomain,
  toKnowledgeDomainId,
  toOrganisationId,
  toWorkspaceId,
  type AssertionValidationPolicy,
} from '@witness/domain';
import type { CreateKnowledgeDomainRequest, KnowledgeDomainView } from '@witness/contracts';

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
}
