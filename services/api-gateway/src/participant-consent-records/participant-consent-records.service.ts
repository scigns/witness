/**
 * Application layer for participant consent records (BUILD_ROADMAP.md
 * Milestone 4, Consent Management) — capture, amendment, withdrawal and
 * history of one participant's consent, plus the facilitator dashboard
 * summarising every participant in a session.
 *
 * Consent capture is facilitator-mediated, not participant self-service —
 * `captureMethod` records how a facilitator (or other authorised role)
 * captured what the participant told them, the same limitation Milestone 3
 * named for participant management generally (most participants cannot
 * sign in to Witness at all). There is therefore one grant tier for this
 * whole module (`participant_consent:*`), not a separate participant-facing
 * one.
 *
 * `amend` is the one write here that spans two `ParticipantConsentRecord`
 * rows in a single transaction — `supersedeConsentRecord` on the existing
 * active record and a fresh `captureParticipantConsent` for its replacement
 * — mirroring `SessionConsentConfigurationService.configure`'s two-aggregate
 * transaction and, ultimately, `SessionsService.applyOutcomes`'s original
 * "one request, one all-or-nothing write" pattern.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  captureParticipantConsent,
  participantConsentRecordStatus,
  resolveActiveConsentRecord,
  supersedeConsentRecord,
  withdrawParticipantConsent,
  toCoDesignSessionId,
  toConsentTemplateId,
  toOrganisationId,
  toParticipantConsentRecordId,
  toSessionParticipantId,
  toWorkspaceId,
  type ParticipantConsentRecord,
  type ParticipantConsentRecordStatus,
} from '@witness/domain';
import type {
  CaptureParticipantConsentRequest,
  ConsentDashboardParticipantView,
  ConsentFacilitatorDashboardView,
  ParticipantConsentRecordDetail,
  ParticipantConsentStatusSummary,
  WithdrawParticipantConsentRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { toDomainRecord } from '../consent/consent-policy.service.js';

@Injectable()
export class ParticipantConsentRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEnforcement: PolicyEnforcementService,
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async getActive(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    principal: Principal,
  ): Promise<ParticipantConsentRecordDetail> {
    await this.requireParticipantRow(workspaceId, sessionId, participantId);
    const now = new Date();
    const requiredCategories = await this.currentRequiredCategories(sessionId);
    const rows = await this.prisma.participantConsentRecord.findMany({
      where: { sessionId, participantId },
    });
    const active = resolveActiveConsentRecord(rows.map(toDomainRecord), now);

    if (active === null) {
      throw new NotFoundException({
        error: {
          code: 'PARTICIPANT_CONSENT_NOT_FOUND',
          message: `No active consent record for participant '${participantId}' in session '${sessionId}'.`,
        },
      });
    }

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    return toDetail(active, requiredCategories, now, includeRestricted);
  }

  async history(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    principal: Principal,
  ): Promise<ParticipantConsentRecordDetail[]> {
    await this.requireParticipantRow(workspaceId, sessionId, participantId);
    const now = new Date();
    const requiredCategories = await this.currentRequiredCategories(sessionId);

    const rows = await this.prisma.participantConsentRecord.findMany({
      where: { sessionId, participantId },
      orderBy: { capturedAt: 'asc' },
    });

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    return rows
      .map(toDomainRecord)
      .map((record) => toDetail(record, requiredCategories, now, includeRestricted));
  }

  async dashboard(
    workspaceId: string,
    sessionId: string,
  ): Promise<ConsentFacilitatorDashboardView> {
    await this.requireSessionRow(workspaceId, sessionId);

    const [configurationRow, participantRows, recordRows] = await Promise.all([
      this.prisma.sessionConsentConfiguration.findUnique({ where: { sessionId } }),
      this.prisma.sessionParticipant.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      this.prisma.participantConsentRecord.findMany({ where: { sessionId } }),
    ]);

    const now = new Date();
    const requiredCategories = configurationRow?.requiredCategories ?? null;
    const recordsByParticipant = new Map<string, ParticipantConsentRecord[]>();
    for (const row of recordRows) {
      const record = toDomainRecord(row);
      const list = recordsByParticipant.get(record.participantId) ?? [];
      list.push(record);
      recordsByParticipant.set(record.participantId, list);
    }

    const participants: ConsentDashboardParticipantView[] = participantRows.map((participant) => {
      const records = recordsByParticipant.get(participant.id) ?? [];
      const active = resolveActiveConsentRecord(records, now);
      return {
        participantId: participant.id,
        displayName: participant.displayName,
        status: statusSummary(records, requiredCategories, now),
        updatedAt: active?.updatedAt.toISOString() ?? null,
      };
    });

    return {
      sessionId,
      configuration: configurationRow === null ? null : toConfigurationView(configurationRow),
      participants,
    };
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async capture(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    request: CaptureParticipantConsentRequest,
    principal: Principal,
  ): Promise<ParticipantConsentRecordDetail> {
    await this.requireParticipantRow(workspaceId, sessionId, participantId);
    const configuration = await this.requireConfigurationRow(sessionId);

    const existing = await this.prisma.participantConsentRecord.findMany({
      where: { sessionId, participantId },
    });
    const now = new Date();
    if (resolveActiveConsentRecord(existing.map(toDomainRecord), now) !== null) {
      throw new ConflictException({
        error: {
          code: 'PARTICIPANT_CONSENT_ALREADY_ACTIVE',
          message:
            'This participant already has active consent on record. Use the amend endpoint to change it.',
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);

    const outcome = captureParticipantConsent({
      id: toParticipantConsentRecordId(randomUUID()),
      organisationId: toOrganisationId(configuration.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      participantId: toSessionParticipantId(participantId),
      consentTemplateId: toConsentTemplateId(configuration.consentTemplateId),
      templateVersion: configuration.templateVersion,
      categoryDecisions: request.categoryDecisions,
      requiredCategories: configuration.requiredCategories,
      optionalCategories: configuration.optionalCategories,
      captureMethod: request.captureMethod,
      language: request.language,
      expiresAt: request.expiresAt !== undefined ? new Date(request.expiresAt) : undefined,
      acknowledgementReference: request.acknowledgementReference,
      capturedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.participantConsentRecord.create({ data: toCreateRow(outcome.record) });
      await appendAuditEvent(
        tx,
        'participant_consent_record',
        outcome.record.id,
        outcome.event,
        now,
      );
      await this.refreshParticipantSummary(tx, participantId, sessionId, now);
    });

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    return toDetail(outcome.record, configuration.requiredCategories, now, includeRestricted);
  }

  async amend(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    request: CaptureParticipantConsentRequest,
    principal: Principal,
  ): Promise<ParticipantConsentRecordDetail> {
    await this.requireParticipantRow(workspaceId, sessionId, participantId);
    const configuration = await this.requireConfigurationRow(sessionId);

    const rows = await this.prisma.participantConsentRecord.findMany({
      where: { sessionId, participantId },
    });
    const now = new Date();
    const active = resolveActiveConsentRecord(rows.map(toDomainRecord), now);

    if (active === null) {
      throw new NotFoundException({
        error: {
          code: 'PARTICIPANT_CONSENT_NOT_FOUND',
          message: `No active consent record to amend for participant '${participantId}'.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const newRecordId = toParticipantConsentRecordId(randomUUID());

    const supersedeOutcome = supersedeConsentRecord(active, newRecordId, actor, now);
    const captureOutcome = captureParticipantConsent({
      id: newRecordId,
      organisationId: toOrganisationId(configuration.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      participantId: toSessionParticipantId(participantId),
      consentTemplateId: toConsentTemplateId(configuration.consentTemplateId),
      templateVersion: configuration.templateVersion,
      categoryDecisions: request.categoryDecisions,
      requiredCategories: configuration.requiredCategories,
      optionalCategories: configuration.optionalCategories,
      captureMethod: request.captureMethod,
      language: request.language,
      expiresAt: request.expiresAt !== undefined ? new Date(request.expiresAt) : undefined,
      amendsRecordId: active.id,
      acknowledgementReference: request.acknowledgementReference,
      capturedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.participantConsentRecord.updateMany({
        where: { id: active.id, version: active.version },
        data: toUpdateRow(supersedeOutcome.record),
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message:
              'This consent record was changed by someone else since you last loaded it. ' +
              'Reload and try again.',
          },
        });
      }
      await appendAuditEvent(
        tx,
        'participant_consent_record',
        active.id,
        supersedeOutcome.event,
        now,
      );

      await tx.participantConsentRecord.create({ data: toCreateRow(captureOutcome.record) });
      await appendAuditEvent(
        tx,
        'participant_consent_record',
        captureOutcome.record.id,
        captureOutcome.event,
        now,
      );

      await this.refreshParticipantSummary(tx, participantId, sessionId, now);
    });

    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    return toDetail(
      captureOutcome.record,
      configuration.requiredCategories,
      now,
      includeRestricted,
    );
  }

  async withdraw(
    workspaceId: string,
    sessionId: string,
    participantId: string,
    request: WithdrawParticipantConsentRequest,
    principal: Principal,
  ): Promise<ParticipantConsentRecordDetail> {
    await this.requireParticipantRow(workspaceId, sessionId, participantId);

    const rows = await this.prisma.participantConsentRecord.findMany({
      where: { sessionId, participantId },
    });
    const now = new Date();
    const active = resolveActiveConsentRecord(rows.map(toDomainRecord), now);

    if (active === null) {
      throw new NotFoundException({
        error: {
          code: 'PARTICIPANT_CONSENT_NOT_FOUND',
          message: `No active consent record to withdraw for participant '${participantId}'.`,
        },
      });
    }

    if (active.version !== request.expectedVersion) {
      throw new ConflictException({
        error: {
          code: 'STALE_VERSION',
          message:
            'This consent record was changed by someone else since you last loaded it. Reload and try again.',
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const outcome = withdrawParticipantConsent(active, actor, request.reason ?? null, now);

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.participantConsentRecord.updateMany({
        where: { id: active.id, version: request.expectedVersion },
        data: toUpdateRow(outcome.record),
      });
      if (result.count === 0) {
        throw new ConflictException({
          error: {
            code: 'STALE_VERSION',
            message:
              'This consent record was changed by someone else since you last loaded it. ' +
              'Reload and try again.',
          },
        });
      }
      await appendAuditEvent(tx, 'participant_consent_record', active.id, outcome.event, now);
      await this.refreshParticipantSummary(tx, participantId, sessionId, now);
    });

    const requiredCategories = await this.currentRequiredCategories(sessionId);
    const includeRestricted = await this.canSeeRestricted(principal, workspaceId);
    return toDetail(outcome.record, requiredCategories, now, includeRestricted);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Recomputes and writes `SessionParticipant.consentStatusSummary` — a
   * cached projection for list-view display, not itself an audited fact
   * (the capture/amend/withdraw event just appended is the audit record).
   * Runs inside the same transaction as the write that changed it, so the
   * cached column and the record it summarises never diverge.
   */
  private async refreshParticipantSummary(
    tx: PrismaTransaction,
    participantId: string,
    sessionId: string,
    now: Date,
  ): Promise<void> {
    const [configuration, rows] = await Promise.all([
      tx.sessionConsentConfiguration.findUnique({ where: { sessionId } }),
      tx.participantConsentRecord.findMany({ where: { sessionId, participantId } }),
    ]);

    const summary = statusSummary(
      rows.map(toDomainRecord),
      configuration?.requiredCategories ?? null,
      now,
    );

    await tx.sessionParticipant.update({
      where: { id: participantId },
      data: { consentStatusSummary: summary },
    });
  }

  private async canSeeRestricted(principal: Principal, workspaceId: string): Promise<boolean> {
    const decision = await this.policyEnforcement.decide(
      principal,
      'participant_consent:manage_restricted',
      { type: 'workspace', workspaceId },
    );
    return decision.allowed;
  }

  /**
   * A record's status is computed against the session's *current* required
   * categories, not whatever was required when the record was captured
   * (`participant-consent-record.ts`'s `participantConsentRecordStatus`
   * takes `requiredCategories` as a parameter for exactly this reason) — an
   * unconfigured session (or one no longer configured) has no required
   * categories to check against.
   */
  private async currentRequiredCategories(sessionId: string): Promise<readonly string[]> {
    const configuration = await this.prisma.sessionConsentConfiguration.findUnique({
      where: { sessionId },
      select: { requiredCategories: true },
    });
    return configuration?.requiredCategories ?? [];
  }

  private async requireSessionRow(
    workspaceId: string,
    sessionId: string,
  ): Promise<{ id: string; organisationId: string; workspaceId: string }> {
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

  private async requireParticipantRow(
    workspaceId: string,
    sessionId: string,
    participantId: string,
  ): Promise<void> {
    const row = await this.prisma.sessionParticipant.findUnique({ where: { id: participantId } });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'PARTICIPANT_NOT_FOUND',
          message: `No participant '${participantId}' in session '${sessionId}'.`,
        },
      });
    }
  }

  private async requireConfigurationRow(sessionId: string): Promise<ConfigurationRow> {
    const row = await this.prisma.sessionConsentConfiguration.findUnique({ where: { sessionId } });

    if (row === null) {
      throw new BadRequestException({
        error: {
          code: 'SESSION_CONSENT_NOT_CONFIGURED',
          message: `Session '${sessionId}' has no consent configuration yet — configure it before capturing participant consent.`,
        },
      });
    }

    return row;
  }
}

type PrismaTransaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type ConfigurationRow = Awaited<
  ReturnType<PrismaService['sessionConsentConfiguration']['findFirstOrThrow']>
>;

/**
 * A participant's consent status at a glance — resolves the two states that
 * describe the *absence* of a record (`not_configured`/`not_requested`)
 * before falling back to the active record's own computed status, or
 * (defensively — see below) the most recent inactive record's status.
 */
function statusSummary(
  records: readonly ParticipantConsentRecord[],
  requiredCategories: readonly string[] | null,
  now: Date,
): ParticipantConsentStatusSummary {
  if (requiredCategories === null) return 'not_configured';

  const active = resolveActiveConsentRecord(records, now);
  if (active !== null) {
    return participantConsentRecordStatus(
      active,
      requiredCategories,
      now,
    ) as ParticipantConsentStatusSummary;
  }

  if (records.length === 0) return 'not_requested';

  const mostRecent = [...records].sort(
    (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime(),
  )[0]!;
  const status: ParticipantConsentRecordStatus = participantConsentRecordStatus(
    mostRecent,
    requiredCategories,
    now,
  );
  // The most-recently-captured record should never itself be 'superseded' —
  // a superseding record is by definition captured later. Falling back to
  // 'not_requested' here is a defensive guard against that invariant being
  // violated elsewhere, not an expected path.
  return status === 'superseded' ? 'not_requested' : status;
}

function toCreateRow(record: ParticipantConsentRecord) {
  return {
    id: record.id,
    organisationId: record.organisationId,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    participantId: record.participantId,
    ...toUpdateRow(record),
    createdAt: record.createdAt,
  };
}

/** Every column a mutation might change — every write uses the full set, never a partial patch. */
function toUpdateRow(record: ParticipantConsentRecord) {
  return {
    consentTemplateId: record.consentTemplateId,
    templateVersion: record.templateVersion,
    categoryDecisions: record.categoryDecisions as unknown as object,
    captureMethod: record.captureMethod,
    language: record.language,
    capturedAt: record.capturedAt,
    expiresAt: record.expiresAt,
    amendsRecordId: record.amendsRecordId,
    supersededByRecordId: record.supersededByRecordId,
    withdrawnAt: record.withdrawnAt,
    withdrawalReason: record.withdrawalReason,
    acknowledgementReference: record.acknowledgementReference,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

function toDetail(
  record: ParticipantConsentRecord,
  requiredCategories: readonly string[],
  now: Date,
  includeRestricted: boolean,
): ParticipantConsentRecordDetail {
  return {
    id: record.id,
    sessionId: record.sessionId,
    participantId: record.participantId,
    consentTemplateId: record.consentTemplateId,
    templateVersion: record.templateVersion,
    status: participantConsentRecordStatus(record, requiredCategories, now),
    capturedAt: record.capturedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    organisationId: record.organisationId,
    workspaceId: record.workspaceId,
    captureMethod: record.captureMethod,
    language: record.language,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    amendsRecordId: record.amendsRecordId,
    supersededByRecordId: record.supersededByRecordId,
    withdrawnAt: record.withdrawnAt?.toISOString() ?? null,
    acknowledgementReference: record.acknowledgementReference,
    version: record.version,
    ...(includeRestricted
      ? {
          categoryDecisions: record.categoryDecisions as { category: string; granted: boolean }[],
          withdrawalReason: record.withdrawalReason,
        }
      : {}),
  };
}

function toConfigurationView(row: ConfigurationRow) {
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
    status: row.status as 'draft' | 'active' | 'retired',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}
