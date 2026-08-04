/**
 * Application layer for consent templates (BUILD_ROADMAP.md Milestone 4,
 * Consent Management).
 *
 * Same shape as `SessionsService`/`ParticipantsService`: load the row(s),
 * reconstruct the domain aggregate, call into `@witness/domain` for the
 * rule, write the result and its audit event back in a transaction.
 *
 * One thing this service does that those do not: `createNewTemplateVersion`
 * and `activateConsentTemplate`/`retireConsentTemplate` never touch an
 * existing row — a new version is always a plain `create`, and a lifecycle
 * transition is a conditional `updateMany` against `revision` (the
 * optimistic-concurrency counter), never `version` (the template's own
 * content-version number) — see `consent-template.ts`'s doc comment on why
 * the two are named, and behave, differently.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  activateConsentTemplate,
  createConsentTemplate,
  createNewTemplateVersion,
  retireConsentTemplate,
  toConsentTemplateId,
  toOrganisationId,
  toWorkspaceId,
  type ConsentTemplate,
  type ConsentTemplateCategory,
  type ConsentTemplateOutcome,
} from '@witness/domain';
import type {
  ConsentTemplateAction,
  ConsentTemplateDetail,
  ConsentTemplateSummary,
  CreateConsentTemplateRequest,
  CreateConsentTemplateVersionRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

@Injectable()
export class ConsentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  /** The latest version in each template family belonging to this organisation. */
  async list(organisationId: string): Promise<ConsentTemplateSummary[]> {
    await this.requireOrganisation(organisationId);

    const rows = await this.prisma.consentTemplate.findMany({
      where: { organisationId },
      distinct: ['familyId'],
      orderBy: [{ familyId: 'asc' }, { version: 'desc' }],
      take: 500,
    });

    return rows.map(toSummary);
  }

  async get(organisationId: string, templateId: string): Promise<ConsentTemplateDetail> {
    const row = await this.requireTemplateRow(organisationId, templateId);
    return toDetail(row);
  }

  /** Every version in this template's family, newest first. */
  async versions(organisationId: string, templateId: string): Promise<ConsentTemplateDetail[]> {
    const row = await this.requireTemplateRow(organisationId, templateId);

    const rows = await this.prisma.consentTemplate.findMany({
      where: { organisationId, familyId: row.familyId },
      orderBy: { version: 'desc' },
    });

    return rows.map(toDetail);
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async create(
    organisationId: string,
    request: CreateConsentTemplateRequest,
    principal: Principal,
  ): Promise<ConsentTemplateDetail> {
    await this.requireOrganisation(organisationId);
    if (request.workspaceId !== undefined) {
      await this.requireWorkspaceInOrganisation(organisationId, request.workspaceId);
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = createConsentTemplate({
      id: toConsentTemplateId(randomUUID()),
      familyId: randomUUID(),
      organisationId: toOrganisationId(organisationId),
      workspaceId: request.workspaceId !== undefined ? toWorkspaceId(request.workspaceId) : null,
      name: request.name,
      purpose: request.purpose,
      description: request.description,
      plainLanguageSummary: request.plainLanguageSummary,
      supportedLanguages: request.supportedLanguages,
      categories: request.categories as readonly ConsentTemplateCategory[],
      validFrom: request.validFrom !== undefined ? new Date(request.validFrom) : null,
      validUntil: request.validUntil !== undefined ? new Date(request.validUntil) : null,
      createdBy: actor,
      at: now,
    });

    await this.persist(outcome, now);
    return toDetail(await this.requireTemplateRow(organisationId, outcome.template.id));
  }

  async createVersion(
    organisationId: string,
    templateId: string,
    request: CreateConsentTemplateVersionRequest,
    principal: Principal,
  ): Promise<ConsentTemplateDetail> {
    const previousRow = await this.requireTemplateRow(organisationId, templateId);
    const previous = toDomainTemplate(previousRow);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = createNewTemplateVersion({
      id: toConsentTemplateId(randomUUID()),
      previous,
      name: request.name,
      purpose: request.purpose,
      description: request.description,
      plainLanguageSummary: request.plainLanguageSummary,
      supportedLanguages: request.supportedLanguages,
      categories: request.categories as readonly ConsentTemplateCategory[] | undefined,
      validFrom: request.validFrom !== undefined ? nullableDate(request.validFrom) : undefined,
      validUntil: request.validUntil !== undefined ? nullableDate(request.validUntil) : undefined,
      createdBy: actor,
      at: now,
    });

    await this.persist(outcome, now);
    return toDetail(await this.requireTemplateRow(organisationId, outcome.template.id));
  }

  async applyAction(
    organisationId: string,
    templateId: string,
    action: ConsentTemplateAction,
    principal: Principal,
  ): Promise<ConsentTemplateDetail> {
    const row = await this.requireTemplateRow(organisationId, templateId);
    const template = toDomainTemplate(row);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome =
      action.action === 'activate'
        ? activateConsentTemplate(template, actor, now)
        : retireConsentTemplate(template, actor, now);

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.consentTemplate.updateMany({
        where: { id: templateId, revision: action.expectedRevision },
        data: toUpdateRow(outcome.template),
      });

      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message:
              'This consent template was changed by someone else since you last loaded it. ' +
              'Reload and try again.',
          },
        });
      }

      await appendAuditEvent(tx, 'consent_template', templateId, outcome.event, now);
    });

    return toDetail(await this.requireTemplateRow(organisationId, templateId));
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async persist(outcome: ConsentTemplateOutcome, at: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.consentTemplate.create({ data: toCreateRow(outcome.template) });
      await appendAuditEvent(tx, 'consent_template', outcome.template.id, outcome.event, at);
    });
  }

  private async requireOrganisation(organisationId: string): Promise<void> {
    const exists = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true },
    });

    if (exists === null) {
      throw new NotFoundException({
        error: {
          code: 'ORGANISATION_NOT_FOUND',
          message: `No organisation with id '${organisationId}'.`,
        },
      });
    }
  }

  private async requireWorkspaceInOrganisation(
    organisationId: string,
    workspaceId: string,
  ): Promise<void> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organisationId: true },
    });

    if (workspace === null || workspace.organisationId !== organisationId) {
      throw new NotFoundException({
        error: {
          code: 'WORKSPACE_NOT_FOUND',
          message: `No workspace '${workspaceId}' in organisation '${organisationId}'.`,
        },
      });
    }
  }

  private async requireTemplateRow(
    organisationId: string,
    templateId: string,
  ): Promise<TemplateRow> {
    const row = await this.prisma.consentTemplate.findUnique({ where: { id: templateId } });

    if (row === null || row.organisationId !== organisationId) {
      throw new NotFoundException({
        error: {
          code: 'CONSENT_TEMPLATE_NOT_FOUND',
          message: `No consent template '${templateId}' in organisation '${organisationId}'.`,
        },
      });
    }

    return row;
  }
}

function nullableDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

type TemplateRow = Awaited<ReturnType<PrismaService['consentTemplate']['findFirstOrThrow']>>;

function toDomainTemplate(row: TemplateRow): ConsentTemplate {
  return {
    id: toConsentTemplateId(row.id),
    familyId: row.familyId,
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: row.workspaceId !== null ? toWorkspaceId(row.workspaceId) : null,
    name: row.name,
    purpose: row.purpose,
    description: row.description,
    version: row.version,
    status: row.status as ConsentTemplate['status'],
    plainLanguageSummary: row.plainLanguageSummary,
    supportedLanguages: row.supportedLanguages,
    categories: row.categories as unknown as readonly ConsentTemplateCategory[],
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revision: row.revision,
  };
}

function toCreateRow(template: ConsentTemplate) {
  return {
    id: template.id,
    familyId: template.familyId,
    organisationId: template.organisationId,
    ...toUpdateRow(template),
    createdAt: template.createdAt,
  };
}

/** Every column a mutation might change — every write uses the full set, never a partial patch. */
function toUpdateRow(template: ConsentTemplate) {
  return {
    workspaceId: template.workspaceId,
    name: template.name,
    purpose: template.purpose,
    description: template.description,
    version: template.version,
    status: template.status,
    plainLanguageSummary: template.plainLanguageSummary,
    supportedLanguages: [...template.supportedLanguages],
    categories: template.categories as unknown as object,
    validFrom: template.validFrom,
    validUntil: template.validUntil,
    updatedAt: template.updatedAt,
    revision: template.revision,
  };
}

function permittedActions(status: ConsentTemplate['status']): ConsentTemplateAction['action'][] {
  switch (status) {
    case 'draft':
      return ['activate'];
    case 'active':
      return ['retire'];
    case 'retired':
      return [];
  }
}

function toSummary(row: TemplateRow): ConsentTemplateSummary {
  return {
    id: row.id,
    familyId: row.familyId,
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    name: row.name,
    version: row.version,
    status: row.status as ConsentTemplateSummary['status'],
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: TemplateRow): ConsentTemplateDetail {
  return {
    ...toSummary(row),
    purpose: row.purpose,
    description: row.description,
    plainLanguageSummary: row.plainLanguageSummary,
    supportedLanguages: [...row.supportedLanguages],
    categories: row.categories as unknown as ConsentTemplateDetail['categories'],
    validFrom: row.validFrom?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revision: row.revision,
    permittedActions: permittedActions(row.status as ConsentTemplate['status']),
  };
}
