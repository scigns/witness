/**
 * Application layer for session reporting and export (BUILD_ROADMAP.md
 * Milestone 8).
 *
 * Same shape as the services before it: load the row, reconstruct the domain
 * aggregate, call into `@witness/domain` for the rule, write the result and
 * its audit event inside a transaction using `expectedVersion`.
 *
 * The part that is specific to this milestone is `render`. A report stores
 * its own narrative and *references* to the records it draws on; it stores no
 * copy of participant-derived content. Rendering therefore reads those
 * records live, asks `ConsentPolicyService` what each participant agreed to,
 * and passes both to `projectEvidenceForReport` — the pure rule in
 * `packages/domain/src/report-composition.ts`. Every format goes through that
 * one call, so HTML, Markdown, JSON and CSV cannot disagree about what a
 * participant agreed to, and the client never receives content it was not
 * supposed to see and then hides it.
 *
 * Consent is evaluated at render time, not at inclusion time, and that is
 * deliberate. A participant who withdraws after a report is approved must
 * disappear from the next copy of it — a redaction rule frozen at approval
 * would keep publishing them.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  approveReport,
  canEditReport,
  canExportReport,
  consentCategoryForAudience,
  createReport,
  excludeReportSource,
  hasSourceDrifted,
  includeReportSource,
  projectEvidenceForReport,
  publishReportInternally,
  recordReportExport,
  requestReportChanges,
  reviseApprovedReport,
  submitReportForReview,
  summariseParticipants,
  toActorId,
  toCoDesignSessionId,
  toOrganisationId,
  toReportId,
  toReportSourceId,
  toWorkspaceId,
  updateReport,
  type Actor,
  type CandidateSource,
  type EvidenceAttributionMode,
  type Report,
  type ReportAudience,
  type ReportOutcome,
  type ReportSourceType,
  type ReportStatus,
  type SessionStatus,
  type SourceConsentAnswers,
} from '@witness/domain';
import type {
  ActorView,
  CreateReportRequest,
  IncludeReportSourceRequest,
  RenderedEvidence,
  RenderedReport,
  ReportDetail,
  ReportExportFormat,
  ReportSourceView,
  ReportSummary,
  ReportTransitionRequest,
  UpdateReportRequest,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import type { Principal } from '../authz/authorization.port.js';

type PrismaTransaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type ActorRow = { id: string; kind: string; displayName: string };

type ReportRow = Awaited<ReturnType<PrismaService['report']['findUniqueOrThrow']>> & {
  createdBy?: ActorRow | null;
  submittedBy?: ActorRow | null;
  approvedBy?: ActorRow | null;
};

type ReportSourceRow = Awaited<ReturnType<PrismaService['reportSource']['findUniqueOrThrow']>> & {
  includedBy?: ActorRow | null;
};

const STALE_VERSION = {
  error: {
    code: 'STALE_VERSION',
    message:
      'This report was changed by someone else since you last loaded it. Reload and try again.',
  },
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentPolicy: ConsentPolicyService,
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async list(workspaceId: string, sessionId: string): Promise<ReportSummary[]> {
    await this.requireSessionRow(workspaceId, sessionId);
    const rows = await this.prisma.report.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const counts = await this.sourceCounts(sessionId);
    return rows.map((row) => toSummary(row, counts.get(row.id) ?? 0));
  }

  async get(workspaceId: string, sessionId: string, reportId: string): Promise<ReportDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireReportRow(workspaceId, sessionId, reportId);
    const sources = await this.sourceViews(reportId);
    return toDetail(row, session.status as SessionStatus, sources);
  }

  async history(workspaceId: string, sessionId: string, reportId: string) {
    await this.requireReportRow(workspaceId, sessionId, reportId);
    const events = await this.prisma.auditEvent.findMany({
      where: { subjectType: 'report', subjectId: reportId },
      orderBy: { occurredAt: 'asc' },
    });
    return events.map((event) => ({
      id: event.id,
      action: event.action,
      occurredAt: event.occurredAt.toISOString(),
      metadata: (event.metadata ?? {}) as Record<string, string>,
    }));
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    sessionId: string,
    request: CreateReportRequest,
    principal: Principal,
  ): Promise<ReportDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = createReport(session.status as SessionStatus, {
      id: toReportId(randomUUID()),
      organisationId: toOrganisationId(session.organisationId),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: toCoDesignSessionId(sessionId),
      title: request.title,
      purpose: request.purpose,
      audience: request.audience as ReportAudience | undefined,
      createdBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.report.create({ data: toCreateRow(outcome.report) });
      await appendAuditEvent(tx, 'report', outcome.report.id, outcome.event, now);

      if (request.includeEligibleSources !== false) {
        await this.drawInEligibleSources(tx, outcome.report, actor, now);
      }
    });

    return this.get(workspaceId, sessionId, outcome.report.id);
  }

  async update(
    workspaceId: string,
    sessionId: string,
    reportId: string,
    request: UpdateReportRequest,
    principal: Principal,
  ): Promise<ReportDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireReportRow(workspaceId, sessionId, reportId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = updateReport(
      toDomainReport(row),
      session.status as SessionStatus,
      actor,
      {
        title: request.title,
        purpose: request.purpose,
        audience: request.audience as ReportAudience | undefined,
        facilitatorSynthesis: request.facilitatorSynthesis,
        unresolvedQuestions: request.unresolvedQuestions,
        recommendations: request.recommendations,
      },
      now,
    );

    await this.applyReport(reportId, request.expectedVersion, outcome, now);
    return this.get(workspaceId, sessionId, reportId);
  }

  async transition(
    workspaceId: string,
    sessionId: string,
    reportId: string,
    request: ReportTransitionRequest,
    principal: Principal,
  ): Promise<ReportDetail> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireReportRow(workspaceId, sessionId, reportId);
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const status = session.status as SessionStatus;
    const report = toDomainReport(row);

    if (request.action === 'revise') {
      return this.revise(workspaceId, sessionId, report, status, request, actor, now);
    }

    const outcome = ((): ReportOutcome => {
      switch (request.action) {
        case 'submit':
          return submitReportForReview(report, status, actor, now);
        case 'request_changes':
          return requestReportChanges(report, status, actor, request.reason, now);
        case 'approve':
          return approveReport(report, status, actor, now);
        case 'publish':
          return publishReportInternally(report, status, actor, now);
      }
    })();

    await this.applyReport(reportId, request.expectedVersion, outcome, now);
    return this.get(workspaceId, sessionId, reportId);
  }

  /**
   * Produce the next revision.
   *
   * The new report is written and its sources are copied across in one
   * transaction: a revision that arrived with no sources would look like a
   * report resting on nothing, and an author would have to reconstruct the
   * citation list by hand. The copies keep the *original* frozen versions, so
   * revision 2 still says what revision 1 relied on until the author
   * deliberately re-includes a record at its current version.
   */
  private async revise(
    workspaceId: string,
    sessionId: string,
    report: Report,
    sessionStatus: SessionStatus,
    request: Extract<ReportTransitionRequest, { action: 'revise' }>,
    actor: Actor,
    now: Date,
  ): Promise<ReportDetail> {
    const outcome = reviseApprovedReport(report, sessionStatus, {
      id: toReportId(randomUUID()),
      reason: request.reason,
      revisedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      // The predecessor must not have moved since the caller read it.
      const claimed = await tx.report.updateMany({
        where: { id: report.id, version: request.expectedVersion },
        data: { updatedAt: now, version: request.expectedVersion + 1 },
      });
      if (claimed.count === 0) throw new ConflictException(STALE_VERSION);

      await tx.report.create({ data: toCreateRow(outcome.report) });
      await appendAuditEvent(tx, 'report', outcome.report.id, outcome.event, now);

      const carried = await tx.reportSource.findMany({ where: { reportId: report.id } });
      for (const source of carried) {
        await tx.reportSource.create({
          data: {
            id: randomUUID(),
            organisationId: source.organisationId,
            workspaceId: source.workspaceId,
            sessionId: source.sessionId,
            reportId: outcome.report.id,
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            sourceVersion: source.sourceVersion,
            sourceStatus: source.sourceStatus,
            includedById: source.includedById,
            includedAt: source.includedAt,
          },
        });
      }
    });

    return this.get(workspaceId, sessionId, outcome.report.id);
  }

  // ─── Sources ──────────────────────────────────────────────────────────────

  async includeSource(
    workspaceId: string,
    sessionId: string,
    reportId: string,
    request: IncludeReportSourceRequest,
    principal: Principal,
  ): Promise<ReportSourceView> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireReportRow(workspaceId, sessionId, reportId);
    this.assertSourcesEditable(row);

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const sourceId = toReportSourceId(randomUUID());

    await this.prisma.$transaction(async (tx) => {
      // Resolved inside the transaction, so the version frozen into the
      // citation is the one the record held when the row landed.
      const candidate = await this.requireCandidate(
        tx,
        workspaceId,
        sessionId,
        request.sourceType as ReportSourceType,
        request.sourceId,
      );

      const outcome = includeReportSource({
        id: sourceId,
        reportId: toReportId(reportId),
        scope: {
          organisationId: toOrganisationId(session.organisationId),
          workspaceId: toWorkspaceId(workspaceId),
          sessionId: toCoDesignSessionId(sessionId),
        },
        candidate,
        includedBy: actor,
        at: now,
      });

      await tx.reportSource.create({
        data: {
          id: outcome.source.id,
          organisationId: outcome.source.organisationId,
          workspaceId: outcome.source.workspaceId,
          sessionId: outcome.source.sessionId,
          reportId: outcome.source.reportId,
          sourceType: outcome.source.sourceType,
          sourceId: outcome.source.sourceId,
          sourceVersion: outcome.source.sourceVersion,
          sourceStatus: outcome.source.sourceStatus,
          includedById: outcome.source.includedBy.id,
          includedAt: outcome.source.includedAt,
        },
      });
      await appendAuditEvent(tx, 'report_source', outcome.source.id, outcome.event, now);
    });

    const views = await this.sourceViews(reportId);
    const view = views.find((candidate) => candidate.id === sourceId);
    if (view === undefined) {
      throw new NotFoundException({
        error: { code: 'REPORT_SOURCE_NOT_FOUND', message: 'The citation could not be read back.' },
      });
    }
    return view;
  }

  async excludeSource(
    workspaceId: string,
    sessionId: string,
    reportId: string,
    sourceId: string,
    principal: Principal,
  ): Promise<void> {
    const row = await this.requireReportRow(workspaceId, sessionId, reportId);
    this.assertSourcesEditable(row);

    const source = await this.prisma.reportSource.findUnique({ where: { id: sourceId } });
    if (source === null || source.reportId !== reportId) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_SOURCE_NOT_FOUND',
          message: `No citation '${sourceId}' on this report.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const event = excludeReportSource(
      {
        id: toReportSourceId(source.id),
        organisationId: toOrganisationId(source.organisationId),
        workspaceId: toWorkspaceId(source.workspaceId),
        sessionId: toCoDesignSessionId(source.sessionId),
        reportId: toReportId(source.reportId),
        sourceType: source.sourceType as ReportSourceType,
        sourceId: source.sourceId,
        sourceVersion: source.sourceVersion,
        sourceStatus: source.sourceStatus,
        includedBy: { id: toActorId(source.includedById), kind: 'human', displayName: '' },
        includedAt: source.includedAt,
      },
      actor,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.reportSource.delete({ where: { id: sourceId } });
      await appendAuditEvent(tx, 'report_source', sourceId, event, now);
    });
  }

  // ─── Rendering and export ─────────────────────────────────────────────────

  /**
   * Compose the report for reading or export, with every consent decision
   * applied here rather than by whatever renders the result.
   */
  async render(workspaceId: string, sessionId: string, reportId: string): Promise<RenderedReport> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireReportRow(workspaceId, sessionId, reportId);
    const sources = await this.sourceViews(reportId);
    const detail = toDetail(row, session.status as SessionStatus, sources);
    const now = new Date();

    const sourceIds = (type: ReportSourceType): string[] =>
      sources.filter((source) => source.sourceType === type).map((source) => source.sourceId);

    const [evidenceRows, decisionRows, commitmentRows, actionRows, participantRows] =
      await Promise.all([
        this.prisma.evidence.findMany({ where: { id: { in: sourceIds('evidence') } } }),
        this.prisma.decision.findMany({ where: { id: { in: sourceIds('decision') } } }),
        this.prisma.commitment.findMany({ where: { id: { in: sourceIds('commitment') } } }),
        this.prisma.actionItem.findMany({ where: { id: { in: sourceIds('action_item') } } }),
        this.prisma.sessionParticipant.findMany({ where: { sessionId } }),
      ]);

    const category = consentCategoryForAudience(row.audience as 'internal' | 'external' | 'public');

    const evidence: RenderedEvidence[] = [];
    let redactedCount = 0;

    for (const item of evidenceRows) {
      const consent = await this.resolveConsent(sessionId, item.sourceParticipantId, category, now);
      const pseudonym =
        item.sourceParticipantId === null
          ? null
          : (participantRows.find((p) => p.id === item.sourceParticipantId)?.displayName ?? null);

      const projected = projectEvidenceForReport(
        {
          id: item.id,
          title: item.title,
          content: item.content,
          evidenceType: item.evidenceType,
          attributionMode: item.attributionMode as EvidenceAttributionMode,
          hasParticipantSource: item.sourceParticipantId !== null,
          pseudonym,
        },
        consent,
      );

      if (projected === null) {
        redactedCount += 1;
        continue;
      }
      evidence.push(projected);
    }

    const participants = summariseParticipants(
      participantRows.map((participant) => ({
        identityMode: participant.identityMode as 'named' | 'pseudonymous' | 'anonymous',
        participationMode: participant.participationMode,
        withdrawn: participant.withdrawnAt !== null,
        attended: participant.attendanceStatus === 'attended',
      })),
    );

    return {
      report: detail,
      session: {
        title: session.title,
        sessionType: session.sessionType,
        purpose: session.purpose,
        scheduledStart: session.startAt?.toISOString() ?? null,
        location: session.location,
      },
      participants: {
        total: participants.total,
        named: participants.counts.named,
        pseudonymous: participants.counts.pseudonymous,
        anonymous: participants.counts.anonymous,
        withdrawn: participants.withdrawn,
        attendedInPerson: participants.attendedInPerson,
        attendedOnline: participants.attendedOnline,
      },
      evidence,
      decisions: decisionRows.map((decision) => ({
        id: decision.id,
        title: decision.title,
        status: decision.status,
        detail: decision.statement,
      })),
      commitments: commitmentRows.map((commitment) => ({
        id: commitment.id,
        title: commitment.title,
        status: commitment.status,
        detail: commitment.description,
        owner: commitment.ownerDescription,
        ...(commitment.dueDate !== null ? { dueDate: commitment.dueDate.toISOString() } : {}),
      })),
      actions: actionRows.map((action) => ({
        id: action.id,
        title: action.title,
        status: action.status,
        detail: action.description,
        owner: action.ownerDescription,
        ...(action.dueDate !== null ? { dueDate: action.dueDate.toISOString() } : {}),
      })),
      redactedCount,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Render and record that a copy has left the system.
   *
   * The audit event is written before the bytes are handed over, so a
   * successful download always has a corresponding record. The alternative —
   * record afterwards — loses the export whenever the write fails, which is
   * exactly the case where knowing would matter.
   */
  async export(
    workspaceId: string,
    sessionId: string,
    reportId: string,
    format: ReportExportFormat,
    principal: Principal,
  ): Promise<RenderedReport> {
    const session = await this.requireSessionRow(workspaceId, sessionId);
    const row = await this.requireReportRow(workspaceId, sessionId, reportId);
    const report = toDomainReport(row);

    if (!canExportReport(report)) {
      throw new ConflictException({
        error: {
          code: 'REPORT_NOT_EXPORTABLE',
          message: `Only a published report can be exported — this report is '${report.status}'.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = recordReportExport(report, session.status as SessionStatus, actor, format, now);

    await this.applyReport(reportId, report.version, outcome, now);
    return this.render(workspaceId, sessionId, reportId);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Ask what the participant behind a piece of evidence agreed to.
   *
   * `null` for evidence with no participant source. A refusal anywhere is a
   * `false`, never an omission — the domain rule fails closed on a missing
   * answer, and this method must not turn a failure into a permissive one.
   */
  private async resolveConsent(
    sessionId: string,
    participantId: string | null,
    category: 'internal_use' | 'external_reporting' | 'publication',
    at: Date,
  ): Promise<SourceConsentAnswers | null> {
    if (participantId === null) return null;

    const participant = await this.prisma.sessionParticipant.findUnique({
      where: { id: participantId },
    });
    if (participant === null) {
      // The participant row is gone but the evidence still points at it. Fail
      // closed: an unanswerable consent question is not a yes.
      return {
        withdrawn: true,
        mayUseForAudience: false,
        mayQuoteAttributed: false,
        mayQuoteAnonymously: false,
      };
    }

    const [audience, attributed, anonymous] = await Promise.all([
      this.consentPolicy.mayUseCategory(sessionId, participantId, category, at),
      this.consentPolicy.mayAttributeQuotation(sessionId, participantId, at),
      this.consentPolicy.mayQuoteAnonymously(sessionId, participantId, at),
    ]);

    return {
      withdrawn: participant.withdrawnAt !== null,
      mayUseForAudience: audience.allowed,
      mayQuoteAttributed: attributed.allowed,
      mayQuoteAnonymously: anonymous.allowed,
    };
  }

  /**
   * Draw in everything the session has that a report may cite.
   *
   * Eligibility is the domain's rule, not a query filter duplicating it: each
   * candidate goes through `includeReportSource`, which refuses anything
   * inadmissible. Records that do not qualify are skipped rather than failing
   * the whole creation — a session with one rejected piece of evidence should
   * still produce a report.
   */
  private async drawInEligibleSources(
    tx: PrismaTransaction,
    report: Report,
    actor: Actor,
    now: Date,
  ): Promise<void> {
    const scope = {
      organisationId: report.organisationId,
      workspaceId: report.workspaceId,
      sessionId: report.sessionId,
    };

    const [evidence, decisions, commitments, actions] = await Promise.all([
      tx.evidence.findMany({
        where: { sessionId: report.sessionId, reviewStatus: 'validated' },
        select: { id: true, version: true, reviewStatus: true },
      }),
      tx.decision.findMany({
        where: { sessionId: report.sessionId, status: { in: ['confirmed', 'superseded'] } },
        select: { id: true, version: true, status: true },
      }),
      tx.commitment.findMany({
        where: { sessionId: report.sessionId, status: { in: ['active', 'fulfilled'] } },
        select: { id: true, version: true, status: true },
      }),
      tx.actionItem.findMany({
        where: { sessionId: report.sessionId },
        select: { id: true, version: true, status: true },
      }),
    ]);

    const candidates: CandidateSource[] = [
      ...evidence.map((row) => ({
        ...scope,
        id: row.id,
        type: 'evidence' as const,
        version: row.version,
        status: row.reviewStatus,
      })),
      ...decisions.map((row) => ({
        ...scope,
        id: row.id,
        type: 'decision' as const,
        version: row.version,
        status: row.status,
      })),
      ...commitments.map((row) => ({
        ...scope,
        id: row.id,
        type: 'commitment' as const,
        version: row.version,
        status: row.status,
      })),
      ...actions.map((row) => ({
        ...scope,
        id: row.id,
        type: 'action_item' as const,
        version: row.version,
        status: row.status,
      })),
    ];

    for (const candidate of candidates) {
      const outcome = includeReportSource({
        id: toReportSourceId(randomUUID()),
        reportId: report.id,
        scope,
        candidate,
        includedBy: actor,
        at: now,
      });

      await tx.reportSource.create({
        data: {
          id: outcome.source.id,
          organisationId: outcome.source.organisationId,
          workspaceId: outcome.source.workspaceId,
          sessionId: outcome.source.sessionId,
          reportId: outcome.source.reportId,
          sourceType: outcome.source.sourceType,
          sourceId: outcome.source.sourceId,
          sourceVersion: outcome.source.sourceVersion,
          sourceStatus: outcome.source.sourceStatus,
          includedById: outcome.source.includedBy.id,
          includedAt: outcome.source.includedAt,
        },
      });
      await appendAuditEvent(tx, 'report_source', outcome.source.id, outcome.event, now);
    }
  }

  /** Resolve a record a caller wants to cite, refusing anything out of scope. */
  private async requireCandidate(
    tx: PrismaTransaction,
    workspaceId: string,
    sessionId: string,
    sourceType: ReportSourceType,
    sourceId: string,
  ): Promise<CandidateSource> {
    const row = await (async () => {
      switch (sourceType) {
        case 'evidence': {
          const found = await tx.evidence.findUnique({ where: { id: sourceId } });
          return found === null ? null : { ...found, status: found.reviewStatus };
        }
        case 'decision':
          return tx.decision.findUnique({ where: { id: sourceId } });
        case 'commitment':
          return tx.commitment.findUnique({ where: { id: sourceId } });
        case 'action_item':
          return tx.actionItem.findUnique({ where: { id: sourceId } });
      }
    })();

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_SOURCE_RECORD_NOT_FOUND',
          message: `No ${sourceType} '${sourceId}' in session '${sessionId}'.`,
        },
      });
    }

    return {
      id: row.id,
      type: sourceType,
      organisationId: toOrganisationId(row.organisationId),
      workspaceId: toWorkspaceId(row.workspaceId),
      sessionId: toCoDesignSessionId(row.sessionId),
      version: row.version,
      status: row.status,
    };
  }

  /**
   * Citations may only change while the report can. An approved report's
   * citation list is part of what was approved.
   */
  private assertSourcesEditable(row: ReportRow): void {
    if (row.status !== 'draft') {
      throw new ConflictException({
        error: {
          code: 'REPORT_NOT_EDITABLE',
          message: `A report's citations can only change while it is a draft — this report is '${row.status}'.`,
        },
      });
    }
  }

  private async applyReport(
    reportId: string,
    expectedVersion: number,
    outcome: ReportOutcome,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.report.updateMany({
        where: { id: reportId, version: expectedVersion },
        data: {
          title: outcome.report.title,
          purpose: outcome.report.purpose,
          audience: outcome.report.audience,
          status: outcome.report.status,
          facilitatorSynthesis: outcome.report.facilitatorSynthesis,
          unresolvedQuestions: outcome.report.unresolvedQuestions,
          recommendations: outcome.report.recommendations,
          submittedById: outcome.report.submittedBy?.id ?? null,
          submittedAt: outcome.report.submittedAt,
          approvedById: outcome.report.approvedBy?.id ?? null,
          approvedAt: outcome.report.approvedAt,
          changesRequestedReason: outcome.report.changesRequestedReason,
          publishedAt: outcome.report.publishedAt,
          firstExportedAt: outcome.report.firstExportedAt,
          updatedAt: outcome.report.updatedAt,
          version: outcome.report.version,
        },
      });

      if (result.count === 0) throw new ConflictException(STALE_VERSION);

      await appendAuditEvent(tx, 'report', reportId, outcome.event, at);
    });
  }

  private async sourceCounts(sessionId: string): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.reportSource.findMany({
      where: { sessionId },
      select: { reportId: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.reportId, (counts.get(row.reportId) ?? 0) + 1);
    return counts;
  }

  /**
   * Citations, with the current version of each cited record resolved so a
   * reader can be told when one has moved since the report cited it.
   */
  private async sourceViews(reportId: string): Promise<ReportSourceView[]> {
    const rows = await this.prisma.reportSource.findMany({
      where: { reportId },
      orderBy: { includedAt: 'asc' },
      include: { includedBy: true },
    });

    const byType = (type: ReportSourceType): string[] =>
      rows.filter((row) => row.sourceType === type).map((row) => row.sourceId);

    const [evidence, decisions, commitments, actions] = await Promise.all([
      this.prisma.evidence.findMany({
        where: { id: { in: byType('evidence') } },
        select: { id: true, title: true, version: true },
      }),
      this.prisma.decision.findMany({
        where: { id: { in: byType('decision') } },
        select: { id: true, title: true, version: true },
      }),
      this.prisma.commitment.findMany({
        where: { id: { in: byType('commitment') } },
        select: { id: true, title: true, version: true },
      }),
      this.prisma.actionItem.findMany({
        where: { id: { in: byType('action_item') } },
        select: { id: true, title: true, version: true },
      }),
    ]);

    const current = new Map<string, { title: string; version: number }>();
    for (const row of [...evidence, ...decisions, ...commitments, ...actions]) {
      current.set(row.id, { title: row.title, version: row.version });
    }

    return rows.map((row: ReportSourceRow) => {
      const live = current.get(row.sourceId);
      return {
        id: row.id,
        sourceType: row.sourceType as ReportSourceType,
        sourceId: row.sourceId,
        sourceVersion: row.sourceVersion,
        sourceStatus: row.sourceStatus,
        ...(live !== undefined ? { sourceTitle: live.title } : {}),
        drifted:
          live !== undefined &&
          hasSourceDrifted(
            {
              id: toReportSourceId(row.id),
              organisationId: toOrganisationId(row.organisationId),
              workspaceId: toWorkspaceId(row.workspaceId),
              sessionId: toCoDesignSessionId(row.sessionId),
              reportId: toReportId(row.reportId),
              sourceType: row.sourceType as ReportSourceType,
              sourceId: row.sourceId,
              sourceVersion: row.sourceVersion,
              sourceStatus: row.sourceStatus,
              includedBy: { id: toActorId(row.includedById), kind: 'human', displayName: '' },
              includedAt: row.includedAt,
            },
            live.version,
          ),
        includedBy: actorView(row.includedById, row.includedBy),
        includedAt: row.includedAt.toISOString(),
      };
    });
  }

  private async requireSessionRow(workspaceId: string, sessionId: string) {
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

  private async requireReportRow(
    workspaceId: string,
    sessionId: string,
    reportId: string,
  ): Promise<ReportRow> {
    const row = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { createdBy: true, submittedBy: true, approvedBy: true },
    });

    if (row === null || row.workspaceId !== workspaceId || row.sessionId !== sessionId) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_NOT_FOUND',
          message: `No report '${reportId}' in session '${sessionId}'.`,
        },
      });
    }

    return row;
  }
}

function actorView(actorId: string, row: ActorRow | null | undefined): ActorView {
  return {
    id: actorId,
    kind: (row?.kind ?? 'human') as ActorView['kind'],
    displayName: row?.displayName ?? '',
  };
}

function bareActor(id: string): Actor {
  return { id: toActorId(id), kind: 'human', displayName: '' };
}

export function toDomainReport(row: ReportRow): Report {
  return {
    id: toReportId(row.id),
    organisationId: toOrganisationId(row.organisationId),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: toCoDesignSessionId(row.sessionId),
    title: row.title,
    purpose: row.purpose,
    audience: row.audience as ReportAudience,
    status: row.status as ReportStatus,
    revision: row.revision,
    supersedesReportId: row.supersedesReportId === null ? null : toReportId(row.supersedesReportId),
    facilitatorSynthesis: row.facilitatorSynthesis,
    unresolvedQuestions: row.unresolvedQuestions,
    recommendations: row.recommendations,
    createdBy: bareActor(row.createdById),
    submittedBy: row.submittedById === null ? null : bareActor(row.submittedById),
    submittedAt: row.submittedAt,
    approvedBy: row.approvedById === null ? null : bareActor(row.approvedById),
    approvedAt: row.approvedAt,
    changesRequestedReason: row.changesRequestedReason,
    publishedAt: row.publishedAt,
    firstExportedAt: row.firstExportedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toCreateRow(report: Report) {
  return {
    id: report.id,
    organisationId: report.organisationId,
    workspaceId: report.workspaceId,
    sessionId: report.sessionId,
    title: report.title,
    purpose: report.purpose,
    audience: report.audience,
    status: report.status,
    revision: report.revision,
    supersedesReportId: report.supersedesReportId,
    facilitatorSynthesis: report.facilitatorSynthesis,
    unresolvedQuestions: report.unresolvedQuestions,
    recommendations: report.recommendations,
    createdById: report.createdBy.id,
    submittedById: report.submittedBy?.id ?? null,
    submittedAt: report.submittedAt,
    approvedById: report.approvedBy?.id ?? null,
    approvedAt: report.approvedAt,
    changesRequestedReason: report.changesRequestedReason,
    publishedAt: report.publishedAt,
    firstExportedAt: report.firstExportedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    version: report.version,
  };
}

function permittedActions(
  row: ReportRow,
  sessionStatus: SessionStatus,
): ReportTransitionRequest['action'][] {
  if (sessionStatus === 'archived') return [];
  switch (row.status as ReportStatus) {
    case 'draft':
      return ['submit'];
    case 'under_review':
      return ['request_changes', 'approve'];
    case 'approved':
      return ['publish', 'revise'];
    case 'published_internally':
    case 'exported':
      return ['revise'];
  }
}

export function toSummary(row: ReportRow, sourceCount: number): ReportSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    title: row.title,
    audience: row.audience as ReportAudience,
    status: row.status as ReportStatus,
    revision: row.revision,
    supersedesReportId: row.supersedesReportId,
    sourceCount,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDetail(
  row: ReportRow,
  sessionStatus: SessionStatus,
  sources: ReportSourceView[],
): ReportDetail {
  return {
    ...toSummary(row, sources.length),
    organisationId: row.organisationId,
    workspaceId: row.workspaceId,
    purpose: row.purpose,
    facilitatorSynthesis: row.facilitatorSynthesis,
    unresolvedQuestions: row.unresolvedQuestions,
    recommendations: row.recommendations,
    createdBy: actorView(row.createdById, row.createdBy),
    submittedBy: row.submittedById === null ? null : actorView(row.submittedById, row.submittedBy),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvedBy: row.approvedById === null ? null : actorView(row.approvedById, row.approvedBy),
    changesRequestedReason: row.changesRequestedReason,
    firstExportedAt: row.firstExportedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
    permittedActions: permittedActions(row, sessionStatus),
    canEdit: canEditReport(toDomainReport(row), sessionStatus),
    canExport: canExportReport(toDomainReport(row)),
    sources,
  };
}
