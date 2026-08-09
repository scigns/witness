/**
 * What a report is built from (BUILD_ROADMAP.md Milestone 8).
 *
 * Every material claim in a report has to be traceable to something the
 * institution can stand behind. `ReportSource` is that trace: one row per
 * record the report draws on, carrying the record's id and the *version* it
 * carried when it was included — the same freeze `OutcomeSupport` performs,
 * for the same reason. A reader of revision 2 can tell that the evidence
 * behind a paragraph has been corrected since revision 1 said it.
 *
 * Only four kinds of record are admissible, and the gate below refuses
 * everything else by name:
 *
 * - **validated evidence** — reviewed and validated in Milestone 6. Draft,
 *   submitted, under-review, needs-clarification, rejected and withdrawn
 *   evidence are all refused: presenting any of them in a report would
 *   present as established fact something nobody has established.
 * - **confirmed decisions** — a proposed decision is a suggestion, and a
 *   reversed one is a mistake the institution has already disowned.
 * - **active or fulfilled commitments** — a proposal nobody activated is not
 *   an undertaking; a withdrawn one is the opposite of one.
 * - **actions** in any state, because an action that was cancelled is part of
 *   an honest account of what happened.
 *
 * The facilitator's own synthesis is *not* a source. It lives on the report
 * itself (`report.ts`) precisely so that it can never be rendered as though a
 * participant said it — see `report-composition.ts`.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { EvidenceReviewStatus } from './evidence.js';
import type { DecisionStatus } from './decision.js';
import type { CommitmentStatus } from './commitment.js';
import type {
  CoDesignSessionId,
  OrganisationId,
  ReportId,
  ReportSourceId,
  WorkspaceId,
} from './ids.js';

export const REPORT_SOURCE_TYPES = ['evidence', 'decision', 'commitment', 'action_item'] as const;
export type ReportSourceType = (typeof REPORT_SOURCE_TYPES)[number];

/**
 * The facts about a candidate record that decide admissibility. Supplied by
 * the service from a row it has already scoped — the domain never reads them
 * itself (ADR-0003).
 */
export interface CandidateSource {
  readonly id: string;
  readonly type: ReportSourceType;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly version: number;
  /** The record's own lifecycle status; interpreted per `type`. */
  readonly status: string;
}

export interface ReportScope {
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
}

/** Statuses that make each kind of record safe to present as settled. */
const ADMISSIBLE_EVIDENCE: ReadonlySet<EvidenceReviewStatus> = new Set<EvidenceReviewStatus>([
  'validated',
]);
const ADMISSIBLE_DECISION: ReadonlySet<DecisionStatus> = new Set<DecisionStatus>([
  'confirmed',
  'superseded',
]);
const ADMISSIBLE_COMMITMENT: ReadonlySet<CommitmentStatus> = new Set<CommitmentStatus>([
  'active',
  'fulfilled',
]);

/**
 * The single gate on what a report may draw on.
 *
 * Cross-session as well as cross-workspace and cross-organisation records are
 * refused: a session report that silently included another session's evidence
 * would misattribute it, and a reader has no way to tell.
 */
export function assertSourceAdmissible(candidate: CandidateSource, report: ReportScope): void {
  if (candidate.organisationId !== report.organisationId) {
    throw new InvariantViolation(
      'A report cannot draw on a record from another organisation.',
      'SOURCE_CROSS_ORGANISATION',
    );
  }

  if (candidate.workspaceId !== report.workspaceId) {
    throw new InvariantViolation(
      'A report cannot draw on a record from another workspace.',
      'SOURCE_CROSS_WORKSPACE',
    );
  }

  if (candidate.sessionId !== report.sessionId) {
    throw new InvariantViolation(
      'A session report can only draw on records from its own session.',
      'SOURCE_CROSS_SESSION',
    );
  }

  switch (candidate.type) {
    case 'evidence':
      if (!ADMISSIBLE_EVIDENCE.has(candidate.status as EvidenceReviewStatus)) {
        throw new InvariantViolation(
          `Only validated evidence can appear in a report — this evidence is '${candidate.status}'.`,
          'SOURCE_EVIDENCE_NOT_VALIDATED',
        );
      }
      return;
    case 'decision':
      if (!ADMISSIBLE_DECISION.has(candidate.status as DecisionStatus)) {
        throw new InvariantViolation(
          `Only a confirmed decision can appear in a report — this decision is '${candidate.status}'.`,
          'SOURCE_DECISION_NOT_CONFIRMED',
        );
      }
      return;
    case 'commitment':
      if (!ADMISSIBLE_COMMITMENT.has(candidate.status as CommitmentStatus)) {
        throw new InvariantViolation(
          `Only an active or fulfilled commitment can appear in a report — this commitment is '${candidate.status}'.`,
          'SOURCE_COMMITMENT_NOT_ACTIVE',
        );
      }
      return;
    case 'action_item':
      // Every state of an action is reportable, including cancelled: an
      // honest account of what an institution did includes what it stopped.
      return;
  }
}

export interface ReportSource {
  readonly id: ReportSourceId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly reportId: ReportId;
  readonly sourceType: ReportSourceType;
  readonly sourceId: string;
  /**
   * The version the record carried when it was included. Frozen: a later
   * correction moves the record's own version and leaves this one alone, so
   * a reader can see that what the report drew on has since changed.
   */
  readonly sourceVersion: number;
  /** The record's status at inclusion, frozen for the same reason. */
  readonly sourceStatus: string;
  readonly includedBy: Actor;
  readonly includedAt: Date;
}

export interface ReportSourceOutcome {
  readonly source: ReportSource;
  readonly event: PendingAuditEvent;
}

export interface IncludeReportSourceInput {
  id: ReportSourceId;
  reportId: ReportId;
  scope: ReportScope;
  candidate: CandidateSource;
  includedBy: Actor;
  at: Date;
}

/** Draw a record into a report, freezing what it looked like at that moment. */
export function includeReportSource(input: IncludeReportSourceInput): ReportSourceOutcome {
  assertSourceAdmissible(input.candidate, input.scope);

  const source: ReportSource = {
    id: input.id,
    organisationId: input.scope.organisationId,
    workspaceId: input.scope.workspaceId,
    sessionId: input.scope.sessionId,
    reportId: input.reportId,
    sourceType: input.candidate.type,
    sourceId: input.candidate.id,
    sourceVersion: input.candidate.version,
    sourceStatus: input.candidate.status,
    includedBy: input.includedBy,
    includedAt: input.at,
  };

  return {
    source,
    event: {
      action: 'report_source.included',
      actor: input.includedBy,
      metadata: {
        reportId: source.reportId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        sourceVersion: String(source.sourceVersion),
      },
    },
  };
}

/** Drop a record from a report. Emits the audit event; the caller deletes the row. */
export function excludeReportSource(source: ReportSource, actor: Actor): PendingAuditEvent {
  return {
    action: 'report_source.excluded',
    actor,
    metadata: {
      reportId: source.reportId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    },
  };
}

/**
 * Whether a record the report drew on has moved since it was included.
 *
 * Not an error — evidence is corrected, commitments are fulfilled, and a
 * report written last month describing last month's state is doing its job.
 * It is something a reader is entitled to be told, which is why the frozen
 * version is kept rather than the current one being silently substituted.
 */
export function hasSourceDrifted(source: ReportSource, currentVersion: number): boolean {
  return currentVersion !== source.sourceVersion;
}
