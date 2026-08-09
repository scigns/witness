/**
 * Session report (BUILD_ROADMAP.md Milestone 8, Session Summary, Reporting
 * and Export) — what an institution says publicly about what a session
 * produced, and the review that stands behind it.
 *
 * Lifecycle: `draft → under_review → approved → published_internally`, with
 * `exported` recording that a copy has left the system. Review can send a
 * report back: `under_review → draft` with a stated reason, because "changes
 * requested" is a normal outcome of review and forcing an approve/reject
 * binary would push reviewers into approving things they have doubts about.
 *
 * An approved report is never edited. `reviseApprovedReport` produces a new
 * report at the next revision, in `draft`, pointing back at the one it
 * supersedes — the same non-destructive shape `Decision` uses for
 * supersession, and for the same reason: an institution that quietly rewrites
 * what it approved cannot be held to any of it.
 *
 * What the report *contains* is deliberately not stored here. The narrative
 * sections (synthesis, unresolved questions, recommendations) are the
 * author's own words and live on this aggregate; everything else — the
 * evidence, the decisions, the commitments, the actions — is referenced by
 * `ReportSource` and composed at render time. That is a privacy decision
 * before it is an architectural one: copying participant-derived content into
 * a report record would create a second copy outside the consent and
 * redaction boundaries that Milestones 4 and 5 built, and a withdrawal of
 * consent would then have to chase it. Referencing means there is only ever
 * one copy to redact.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { SessionStatus } from './co-design-session.js';
import type { CoDesignSessionId, OrganisationId, ReportId, WorkspaceId } from './ids.js';

const TITLE_MAX = 300;
const NARRATIVE_MAX = 20000;
const REASON_MAX = 2000;

export const REPORT_STATUSES = [
  'draft',
  'under_review',
  'approved',
  'published_internally',
  'exported',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Which audience a report is written for. This is not decoration: it selects
 * which consent categories the export has to satisfy, so a report written for
 * internal use and one written for external publication are different
 * documents even when their narrative is identical.
 */
export const REPORT_AUDIENCES = ['internal', 'external', 'public'] as const;
export type ReportAudience = (typeof REPORT_AUDIENCES)[number];

/** Statuses in which a report's own text may still be edited. */
const EDITABLE: ReadonlySet<ReportStatus> = new Set<ReportStatus>(['draft']);

export interface Report {
  readonly id: ReportId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly title: string;
  /** Why this report exists and who asked for it. */
  readonly purpose: string | null;
  readonly audience: ReportAudience;
  readonly status: ReportStatus;
  /** 1 for the first report of a session; incremented by each revision. */
  readonly revision: number;
  /** The approved report this one replaces, when created by revision. */
  readonly supersedesReportId: ReportId | null;

  /**
   * The facilitator's own reading of the session. Always presented as
   * synthesis, never as testimony — see `report-composition.ts`.
   */
  readonly facilitatorSynthesis: string | null;
  /** What the session did not settle. Absence of this section is itself a claim. */
  readonly unresolvedQuestions: string | null;
  readonly recommendations: string | null;

  readonly createdBy: Actor;
  readonly submittedBy: Actor | null;
  readonly submittedAt: Date | null;
  readonly approvedBy: Actor | null;
  readonly approvedAt: Date | null;
  /** Why a reviewer sent this back. Cleared when it is resubmitted. */
  readonly changesRequestedReason: string | null;
  readonly publishedAt: Date | null;
  /** When a copy first left the system. Later exports do not move it. */
  readonly firstExportedAt: Date | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface ReportOutcome {
  readonly report: Report;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(`A report must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `A report ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

function assertOptionalText(
  value: string | null | undefined,
  max: number,
  code: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `This field must be ${max} characters or fewer, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

/**
 * A report is written up after the room empties, so `closed` is the normal
 * case and `open` is allowed for a facilitator drafting as they go. Archived
 * sessions are read-only, as everywhere else.
 */
function assertMutable(sessionStatus: SessionStatus): void {
  if (sessionStatus === 'archived') {
    throw new InvariantViolation('An archived session is read-only.', 'SESSION_ARCHIVED');
  }
  if (sessionStatus === 'draft' || sessionStatus === 'scheduled') {
    throw new InvariantViolation(
      `A session cannot be reported on before it has opened — this session is '${sessionStatus}'.`,
      'SESSION_NOT_STARTED',
    );
  }
}

export interface CreateReportInput {
  id: ReportId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  title: string;
  purpose?: string | null | undefined;
  audience?: ReportAudience | undefined;
  createdBy: Actor;
  at: Date;
}

/** Start a report. Always `draft`, always revision 1. */
export function createReport(
  sessionStatus: SessionStatus,
  input: CreateReportInput,
): ReportOutcome {
  assertMutable(sessionStatus);

  const report: Report = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    title: assertNonEmpty(input.title, 'title', TITLE_MAX, 'TITLE_REQUIRED'),
    purpose: assertOptionalText(input.purpose, NARRATIVE_MAX, 'PURPOSE'),
    audience: input.audience ?? 'internal',
    status: 'draft',
    revision: 1,
    supersedesReportId: null,
    facilitatorSynthesis: null,
    unresolvedQuestions: null,
    recommendations: null,
    createdBy: input.createdBy,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    changesRequestedReason: null,
    publishedAt: null,
    firstExportedAt: null,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    report,
    event: {
      action: 'report.created',
      actor: input.createdBy,
      metadata: { sessionId: report.sessionId, audience: report.audience },
    },
  };
}

export interface UpdateReportInput {
  title?: string | undefined;
  purpose?: string | null | undefined;
  audience?: ReportAudience | undefined;
  facilitatorSynthesis?: string | null | undefined;
  unresolvedQuestions?: string | null | undefined;
  recommendations?: string | null | undefined;
}

/**
 * Edit a report's own text. `draft` only. A report under review is being
 * read by somebody; a report that has been approved is what the institution
 * signed off, and changing either underneath its reader is the failure this
 * lifecycle exists to prevent.
 */
export function updateReport(
  report: Report,
  sessionStatus: SessionStatus,
  actor: Actor,
  patch: UpdateReportInput,
  at: Date,
): ReportOutcome {
  assertMutable(sessionStatus);

  if (!EDITABLE.has(report.status)) {
    throw new InvariantViolation(
      `Only a draft report can be edited — this report is '${report.status}'. Revise it instead.`,
      'REPORT_NOT_EDITABLE',
    );
  }

  const changedFields = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (changedFields.length === 0) {
    throw new InvariantViolation('An update must change at least one field.', 'NO_CHANGES');
  }

  const next: Report = {
    ...report,
    title:
      patch.title !== undefined
        ? assertNonEmpty(patch.title, 'title', TITLE_MAX, 'TITLE_REQUIRED')
        : report.title,
    purpose:
      patch.purpose !== undefined
        ? assertOptionalText(patch.purpose, NARRATIVE_MAX, 'PURPOSE')
        : report.purpose,
    audience: patch.audience ?? report.audience,
    facilitatorSynthesis:
      patch.facilitatorSynthesis !== undefined
        ? assertOptionalText(patch.facilitatorSynthesis, NARRATIVE_MAX, 'SYNTHESIS')
        : report.facilitatorSynthesis,
    unresolvedQuestions:
      patch.unresolvedQuestions !== undefined
        ? assertOptionalText(patch.unresolvedQuestions, NARRATIVE_MAX, 'UNRESOLVED_QUESTIONS')
        : report.unresolvedQuestions,
    recommendations:
      patch.recommendations !== undefined
        ? assertOptionalText(patch.recommendations, NARRATIVE_MAX, 'RECOMMENDATIONS')
        : report.recommendations,
    updatedAt: at,
    version: report.version + 1,
  };

  return {
    report: next,
    event: {
      action: 'report.updated',
      actor,
      metadata: { changedFields: changedFields.join(',') },
    },
  };
}

/**
 * Submit a draft for review. Resubmission after changes were requested clears
 * the reason — it has been addressed, and leaving it would make the next
 * reviewer think the request is still outstanding.
 */
export function submitReportForReview(
  report: Report,
  sessionStatus: SessionStatus,
  actor: Actor,
  at: Date,
): ReportOutcome {
  assertMutable(sessionStatus);

  if (report.status !== 'draft') {
    throw new InvariantViolation(
      `Only a draft report can be submitted for review — this report is '${report.status}'.`,
      'INVALID_REPORT_TRANSITION',
    );
  }

  const next: Report = {
    ...report,
    status: 'under_review',
    submittedBy: actor,
    submittedAt: at,
    changesRequestedReason: null,
    updatedAt: at,
    version: report.version + 1,
  };

  return {
    report: next,
    event: { action: 'report.submitted', actor, metadata: { revision: String(report.revision) } },
  };
}

/**
 * Send a report back to its author. The reason is required: "changes
 * requested" with no statement of what changes is not review, it is delay.
 */
export function requestReportChanges(
  report: Report,
  sessionStatus: SessionStatus,
  actor: Actor,
  reason: string,
  at: Date,
): ReportOutcome {
  assertMutable(sessionStatus);

  if (report.status !== 'under_review') {
    throw new InvariantViolation(
      `Only a report under review can be sent back — this report is '${report.status}'.`,
      'INVALID_REPORT_TRANSITION',
    );
  }

  const next: Report = {
    ...report,
    status: 'draft',
    changesRequestedReason: assertNonEmpty(
      reason,
      'reason for requesting changes',
      REASON_MAX,
      'CHANGES_REASON_REQUIRED',
    ),
    updatedAt: at,
    version: report.version + 1,
  };

  return {
    report: next,
    event: {
      action: 'report.changes_requested',
      actor,
      metadata: { reason: next.changesRequestedReason ?? '' },
    },
  };
}

/**
 * Approve a report. This is the moment its content becomes what the
 * institution says, so it is also the moment the text stops being editable.
 */
export function approveReport(
  report: Report,
  sessionStatus: SessionStatus,
  actor: Actor,
  at: Date,
): ReportOutcome {
  assertMutable(sessionStatus);

  if (report.status !== 'under_review') {
    throw new InvariantViolation(
      `Only a report under review can be approved — this report is '${report.status}'.`,
      'INVALID_REPORT_TRANSITION',
    );
  }

  const next: Report = {
    ...report,
    status: 'approved',
    approvedBy: actor,
    approvedAt: at,
    changesRequestedReason: null,
    updatedAt: at,
    version: report.version + 1,
  };

  return {
    report: next,
    event: { action: 'report.approved', actor, metadata: { revision: String(report.revision) } },
  };
}

/** Publish an approved report to readers inside the organisation. */
export function publishReportInternally(
  report: Report,
  sessionStatus: SessionStatus,
  actor: Actor,
  at: Date,
): ReportOutcome {
  assertMutable(sessionStatus);

  if (report.status !== 'approved') {
    throw new InvariantViolation(
      `Only an approved report can be published — this report is '${report.status}'.`,
      'INVALID_REPORT_TRANSITION',
    );
  }

  const next: Report = {
    ...report,
    status: 'published_internally',
    publishedAt: at,
    updatedAt: at,
    version: report.version + 1,
  };

  return {
    report: next,
    event: { action: 'report.published', actor, metadata: { audience: report.audience } },
  };
}

/**
 * Record that a copy of this report has left the system.
 *
 * The state moves only on the first export, and `firstExportedAt` is set only
 * once: a report is not "more exported" the fifth time, and re-stamping it
 * would lose the date that actually matters — when the content first escaped
 * the boundary within which it could still be corrected. Every individual
 * export is in the audit trail with its format and its actor.
 */
export function recordReportExport(
  report: Report,
  sessionStatus: SessionStatus,
  actor: Actor,
  format: string,
  at: Date,
): ReportOutcome {
  assertMutable(sessionStatus);

  if (report.status !== 'published_internally' && report.status !== 'exported') {
    throw new InvariantViolation(
      `Only a published report can be exported — this report is '${report.status}'.`,
      'INVALID_REPORT_TRANSITION',
    );
  }

  const next: Report = {
    ...report,
    status: 'exported',
    firstExportedAt: report.firstExportedAt ?? at,
    updatedAt: at,
    version: report.version + 1,
  };

  return {
    report: next,
    event: {
      action: 'report.exported',
      actor,
      metadata: { format, audience: report.audience, revision: String(report.revision) },
    },
  };
}

export interface ReviseReportInput {
  id: ReportId;
  reason: string;
  revisedBy: Actor;
  at: Date;
}

/**
 * Produce the next revision of a report that has already been approved.
 *
 * A new aggregate rather than a mutation: the approved revision keeps its
 * status, its approver and its date, and the new one starts as a draft that
 * has to earn its own approval. A reader who saw revision 1 can still find
 * exactly what they saw.
 */
export function reviseApprovedReport(
  report: Report,
  sessionStatus: SessionStatus,
  input: ReviseReportInput,
): ReportOutcome {
  assertMutable(sessionStatus);

  if (
    report.status !== 'approved' &&
    report.status !== 'published_internally' &&
    report.status !== 'exported'
  ) {
    throw new InvariantViolation(
      `Only an approved report needs revising — this report is '${report.status}' and can be edited directly.`,
      'REPORT_NOT_REVISABLE',
    );
  }

  const reason = assertNonEmpty(
    input.reason,
    'revision reason',
    REASON_MAX,
    'REVISION_REASON_REQUIRED',
  );

  const next: Report = {
    ...report,
    id: input.id,
    status: 'draft',
    revision: report.revision + 1,
    supersedesReportId: report.id,
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    changesRequestedReason: reason,
    publishedAt: null,
    firstExportedAt: null,
    createdBy: input.revisedBy,
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    report: next,
    event: {
      action: 'report.revised',
      actor: input.revisedBy,
      metadata: { supersedes: report.id, revision: String(next.revision), reason },
    },
  };
}

/** Whether this report's own text can still be edited. */
export function canEditReport(report: Report, sessionStatus: SessionStatus): boolean {
  return sessionStatus !== 'archived' && EDITABLE.has(report.status);
}

/** Whether this report has been approved, in any of the states that follow approval. */
export function isApprovedReport(report: Report): boolean {
  return (
    report.status === 'approved' ||
    report.status === 'published_internally' ||
    report.status === 'exported'
  );
}

/** Whether a copy of this report may be produced. Approval alone is not enough. */
export function canExportReport(report: Report): boolean {
  return report.status === 'published_internally' || report.status === 'exported';
}
