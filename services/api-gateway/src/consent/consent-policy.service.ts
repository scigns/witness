/**
 * `ConsentPolicyService` — the one place a feature outside consent
 * management itself asks "is X permitted for this participant right now"
 * (BUILD_ROADMAP.md Milestone 4, Consent Management). Loads a participant's
 * `ParticipantConsentRecord` rows and their session's required categories
 * from Prisma, then delegates every real decision to the pure functions in
 * `@witness/domain`'s `consent-decision.ts` — the fail-closed rule lives in
 * exactly one place (that module's own header comment), and this service's
 * only job is loading the context that module needs.
 *
 * Every method is a thin, named wrapper around one domain question function,
 * deliberately not a single generic `ask(question, ...)` dispatcher — the
 * domain module itself enumerates fifteen named questions rather than one
 * generic one (`mayUseCategory` is the sole exception, for organisation-
 * defined categories), and this service mirrors that shape so a future
 * caller (Milestone 5, Structured Evidence Capture) reads a call like
 * `consentPolicy.mayRecordAudio(sessionId, participantId)` rather than a
 * stringly-typed question name.
 */

import { Injectable } from '@nestjs/common';

import {
  mayAttributeQuotation as domainMayAttributeQuotation,
  mayFollowUp as domainMayFollowUp,
  mayIncludeInKnowledgeGraph as domainMayIncludeInKnowledgeGraph,
  mayParticipate as domainMayParticipate,
  mayPhotograph as domainMayPhotograph,
  mayProcessWithAi as domainMayProcessWithAi,
  mayPublish as domainMayPublish,
  mayQuoteAnonymously as domainMayQuoteAnonymously,
  mayRecordAudio as domainMayRecordAudio,
  mayRecordVideo as domainMayRecordVideo,
  mayReportExternally as domainMayReportExternally,
  mayReuseInFuture as domainMayReuseInFuture,
  mayTranscribe as domainMayTranscribe,
  mayUseCategory as domainMayUseCategory,
  mayUseForResearch as domainMayUseForResearch,
  mayUseInternally as domainMayUseInternally,
  type ConsentAnswer,
  type ConsentCategoryDecision,
  type ConsentDecisionContext,
  type ParticipantConsentRecord,
} from '@witness/domain';
import {
  toConsentTemplateId,
  toCoDesignSessionId,
  toOrganisationId,
  toParticipantConsentRecordId,
  toSessionParticipantId,
  toWorkspaceId,
} from '@witness/domain';

import { PrismaService } from '../infrastructure/prisma.service.js';

@Injectable()
export class ConsentPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async mayParticipate(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayParticipate(await this.context(sessionId, participantId, now));
  }

  async mayRecordAudio(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayRecordAudio(await this.context(sessionId, participantId, now));
  }

  async mayRecordVideo(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayRecordVideo(await this.context(sessionId, participantId, now));
  }

  async mayPhotograph(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayPhotograph(await this.context(sessionId, participantId, now));
  }

  async mayTranscribe(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayTranscribe(await this.context(sessionId, participantId, now));
  }

  async mayProcessWithAi(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayProcessWithAi(await this.context(sessionId, participantId, now));
  }

  async mayAttributeQuotation(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayAttributeQuotation(await this.context(sessionId, participantId, now));
  }

  async mayQuoteAnonymously(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayQuoteAnonymously(await this.context(sessionId, participantId, now));
  }

  async mayUseInternally(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayUseInternally(await this.context(sessionId, participantId, now));
  }

  async mayReportExternally(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayReportExternally(await this.context(sessionId, participantId, now));
  }

  async mayPublish(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayPublish(await this.context(sessionId, participantId, now));
  }

  async mayUseForResearch(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayUseForResearch(await this.context(sessionId, participantId, now));
  }

  async mayReuseInFuture(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayReuseInFuture(await this.context(sessionId, participantId, now));
  }

  async mayIncludeInKnowledgeGraph(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayIncludeInKnowledgeGraph(await this.context(sessionId, participantId, now));
  }

  async mayFollowUp(
    sessionId: string,
    participantId: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayFollowUp(await this.context(sessionId, participantId, now));
  }

  /** Generic form for an organisation-defined category beyond the well-known fifteen. */
  async mayUseCategory(
    sessionId: string,
    participantId: string,
    category: string,
    now: Date = new Date(),
  ): Promise<ConsentAnswer> {
    return domainMayUseCategory(await this.context(sessionId, participantId, now), category);
  }

  /**
   * The decision context a `consent-decision.ts` question needs: every
   * record ever captured for this participant in this session (any status,
   * any age — `resolveActiveConsentRecord` inside the domain module is what
   * narrows this to the one currently-active record), and the session's
   * required categories. A session with no consent configuration at all has
   * an empty required-categories list — `mayParticipate` then fails closed
   * for lack of any active record, the same outcome as a configured session
   * nobody has captured consent in yet.
   */
  private async context(
    sessionId: string,
    participantId: string,
    now: Date,
  ): Promise<ConsentDecisionContext> {
    const [configuration, rows] = await Promise.all([
      this.prisma.sessionConsentConfiguration.findUnique({ where: { sessionId } }),
      this.prisma.participantConsentRecord.findMany({ where: { sessionId, participantId } }),
    ]);

    return {
      records: rows.map(toDomainRecord),
      requiredCategories: configuration?.requiredCategories ?? [],
      now,
    };
  }
}

type ConsentRecordRow = Awaited<
  ReturnType<PrismaService['participantConsentRecord']['findFirstOrThrow']>
>;

export function toDomainRecord(row: ConsentRecordRow): ParticipantConsentRecord {
  return {
    id: toParticipantConsentRecordId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    participantId: toSessionParticipantId(row.participantId),
    consentTemplateId: toConsentTemplateId(row.consentTemplateId),
    templateVersion: row.templateVersion,
    categoryDecisions: row.categoryDecisions as unknown as readonly ConsentCategoryDecision[],
    captureMethod: row.captureMethod,
    language: row.language,
    capturedAt: row.capturedAt,
    expiresAt: row.expiresAt,
    amendsRecordId:
      row.amendsRecordId !== null ? toParticipantConsentRecordId(row.amendsRecordId) : null,
    supersededByRecordId:
      row.supersededByRecordId !== null
        ? toParticipantConsentRecordId(row.supersededByRecordId)
        : null,
    withdrawnAt: row.withdrawnAt,
    withdrawalReason: row.withdrawalReason,
    acknowledgementReference: row.acknowledgementReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
