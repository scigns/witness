/**
 * Application layer for session consent configuration (BUILD_ROADMAP.md
 * Milestone 4, Consent Management) — which `ConsentTemplate` version a
 * session uses, and which of that template's categories are required or
 * optional for this specific session.
 *
 * `configure` (first attachment) is the one write in this capability that
 * spans two aggregates in a single transaction, the same pattern
 * `SessionsService.applyOutcomes` established for combining multiple domain
 * outcomes into one all-or-nothing write: the new
 * `SessionConsentConfiguration` row and the `CoDesignSession` row's
 * `consentConfigurationState` (`markConsentConfigured`) commit together or
 * not at all, each with its own audit event under its own subject. Only the
 * *first* configuration call does this — `reconfigure` (replacing an
 * existing configuration) leaves `consentConfigurationState` exactly as it
 * already is, so it never calls `markConsentConfigured` a second time (that
 * function rejects a second call outright — see its doc comment in
 * `co-design-session.ts`).
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  configureSessionConsent,
  markConsentConfigured,
  reconfigureSessionConsent,
  toCoDesignSessionId,
  toConsentTemplateId,
  toOrganisationId,
  toSessionConsentConfigurationId,
  toWorkspaceId,
  type ConsentTemplate,
  type ConsentTemplateCategory,
  type SessionConsentConfiguration,
  type SessionStatus,
} from '@witness/domain';
import type {
  ConfigureSessionConsentRequest,
  ReconfigureSessionConsentRequest,
  SessionConsentConfigurationView,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

@Injectable()
export class SessionConsentConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string, sessionId: string): Promise<SessionConsentConfigurationView> {
    await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireConfigurationRow(sessionId);
    return toView(row);
  }

  async configure(
    workspaceId: string,
    sessionId: string,
    request: ConfigureSessionConsentRequest,
    principal: Principal,
  ): Promise<SessionConsentConfigurationView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);

    const existing = await this.prisma.sessionConsentConfiguration.findUnique({
      where: { sessionId },
      select: { id: true },
    });
    if (existing !== null) {
      throw new ConflictException({
        error: {
          code: 'CONSENT_ALREADY_CONFIGURED',
          message:
            'This session already has a consent configuration. Use the reconfigure endpoint to change it.',
        },
      });
    }

    const template = await this.requireTemplate(
      session.organisationId,
      workspaceId,
      request.consentTemplateId,
    );
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const configurationOutcome = configureSessionConsent(session.status as SessionStatus, {
      id: toSessionConsentConfigurationId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      template,
      requiredCategories: request.requiredCategories,
      optionalCategories: request.optionalCategories,
      facilitatorInstructions: request.facilitatorInstructions,
      participantIntroduction: request.participantIntroduction,
      effectiveDate:
        request.effectiveDate !== undefined ? new Date(request.effectiveDate) : undefined,
      configuredBy: actor,
      at: now,
    });

    const sessionOutcome = markConsentConfigured(toDomainSessionStub(session), actor, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionConsentConfiguration.create({
        data: toCreateRow(configurationOutcome.configuration),
      });
      await appendAuditEvent(
        tx,
        'session_consent_configuration',
        configurationOutcome.configuration.id,
        configurationOutcome.event,
        now,
      );

      const result = await tx.coDesignSession.updateMany({
        where: { id: sessionId, version: session.version },
        data: {
          consentConfigurationState: 'configured',
          updatedAt: now,
          version: session.version + 1,
        },
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message:
              'This session was changed by someone else since you last loaded it. Reload and try again.',
          },
        });
      }
      await appendAuditEvent(tx, 'co_design_session', sessionId, sessionOutcome.event, now);
    });

    return toView(await this.requireConfigurationRow(sessionId));
  }

  async reconfigure(
    workspaceId: string,
    sessionId: string,
    request: ReconfigureSessionConsentRequest,
    principal: Principal,
  ): Promise<SessionConsentConfigurationView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireConfigurationRow(sessionId);
    const configuration = toDomainConfiguration(row);

    const template = await this.requireTemplate(
      session.organisationId,
      workspaceId,
      request.consentTemplateId,
    );
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = reconfigureSessionConsent(configuration, session.status as SessionStatus, {
      template,
      requiredCategories: request.requiredCategories,
      optionalCategories: request.optionalCategories,
      facilitatorInstructions: request.facilitatorInstructions,
      participantIntroduction: request.participantIntroduction,
      reconfiguredBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.sessionConsentConfiguration.updateMany({
        where: { id: configuration.id, version: request.expectedVersion },
        data: toUpdateRow(outcome.configuration),
      });

      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message:
              'This consent configuration was changed by someone else since you last loaded it. ' +
              'Reload and try again.',
          },
        });
      }

      await appendAuditEvent(
        tx,
        'session_consent_configuration',
        configuration.id,
        outcome.event,
        now,
      );
    });

    return toView(await this.requireConfigurationRow(sessionId));
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async requireTemplate(
    organisationId: string,
    workspaceId: string,
    templateId: string,
  ): Promise<ConsentTemplate> {
    const row = await this.prisma.consentTemplate.findUnique({ where: { id: templateId } });

    if (
      row === null ||
      row.organisationId !== organisationId ||
      (row.workspaceId !== null && row.workspaceId !== workspaceId)
    ) {
      throw new NotFoundException({
        error: {
          code: 'CONSENT_TEMPLATE_NOT_FOUND',
          message: `No consent template '${templateId}' available to this session.`,
        },
      });
    }

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

  private async requireSessionRow(workspaceId: string, sessionId: string): Promise<SessionRow> {
    const row = await this.prisma.coDesignSession.findUnique({ where: { id: sessionId } });

    if (row === null || row.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `No co-design session '${sessionId}' in workspace '${workspaceId}'.`,
        },
      });
    }

    return row;
  }

  private async requireConfigurationRow(sessionId: string): Promise<ConfigurationRow> {
    const row = await this.prisma.sessionConsentConfiguration.findUnique({ where: { sessionId } });

    if (row === null) {
      throw new NotFoundException({
        error: {
          code: 'SESSION_CONSENT_NOT_CONFIGURED',
          message: `Session '${sessionId}' has no consent configuration yet.`,
        },
      });
    }

    return row;
  }
}

type SessionRow = Awaited<ReturnType<PrismaService['coDesignSession']['findFirstOrThrow']>>;
type ConfigurationRow = Awaited<
  ReturnType<PrismaService['sessionConsentConfiguration']['findFirstOrThrow']>
>;

/**
 * `markConsentConfigured` only reads `status`/`consentConfigurationState`
 * and writes back `consentConfigurationState`/`updatedAt`/`version` — this
 * stub carries exactly the fields that function's own `assertNotArchived`
 * and status check need, not the session's full column set, so this service
 * does not have to duplicate `SessionsService.toDomainSession`'s mapping
 * for fields it never reads.
 */
function toDomainSessionStub(row: SessionRow) {
  return {
    status: row.status as SessionStatus,
    consentConfigurationState: row.consentConfigurationState as 'not_configured' | 'configured',
    version: row.version,
    updatedAt: row.updatedAt,
  } as Parameters<typeof markConsentConfigured>[0];
}

function toDomainConfiguration(row: ConfigurationRow): SessionConsentConfiguration {
  return {
    id: toSessionConsentConfigurationId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    consentTemplateId: toConsentTemplateId(row.consentTemplateId),
    templateVersion: row.templateVersion,
    requiredCategories: row.requiredCategories,
    optionalCategories: row.optionalCategories,
    facilitatorInstructions: row.facilitatorInstructions,
    participantIntroduction: row.participantIntroduction,
    effectiveDate: row.effectiveDate,
    status: row.status as SessionConsentConfiguration['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toCreateRow(configuration: SessionConsentConfiguration) {
  return {
    id: configuration.id,
    organisationId: configuration.organisationId,
    workspaceId: configuration.workspaceId,
    sessionId: configuration.sessionId,
    ...toUpdateRow(configuration),
    createdAt: configuration.createdAt,
  };
}

/** Every column a mutation might change — every write uses the full set, never a partial patch. */
function toUpdateRow(configuration: SessionConsentConfiguration) {
  return {
    consentTemplateId: configuration.consentTemplateId,
    templateVersion: configuration.templateVersion,
    requiredCategories: [...configuration.requiredCategories],
    optionalCategories: [...configuration.optionalCategories],
    facilitatorInstructions: configuration.facilitatorInstructions,
    participantIntroduction: configuration.participantIntroduction,
    effectiveDate: configuration.effectiveDate,
    status: configuration.status,
    updatedAt: configuration.updatedAt,
    version: configuration.version,
  };
}

function toView(row: ConfigurationRow): SessionConsentConfigurationView {
  return {
    id: row.id,
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    sessionId: row.sessionId,
    consentTemplateId: row.consentTemplateId,
    templateVersion: row.templateVersion,
    requiredCategories: [...row.requiredCategories],
    optionalCategories: [...row.optionalCategories],
    facilitatorInstructions: row.facilitatorInstructions,
    participantIntroduction: row.participantIntroduction,
    effectiveDate: row.effectiveDate.toISOString(),
    status: row.status as SessionConsentConfigurationView['status'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}
