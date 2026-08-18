/**
 * The consent decision boundary (BUILD_ROADMAP.md Milestone 4) — the one
 * place that answers "is X permitted for this participant right now".
 *
 * Pure domain logic (ADR-0003): given the participant's consent records,
 * the session's required categories, and the current time, these functions
 * answer fail-closed. `services/api-gateway/src/consent/consent-policy.service.ts`
 * is the injectable NestJS wrapper Milestone 5+ actually calls — it loads
 * records from Prisma and delegates every real decision to this module, so
 * the fail-closed rule lives in exactly one place rather than being
 * reimplemented per feature.
 *
 * Every question below except `mayParticipate` itself first checks
 * `mayParticipate` and refuses immediately if that is not granted —
 * consenting to be recorded is meaningless if the participant never
 * consented to participate at all. `participation` therefore acts as a
 * gate every other category decision is conditioned on, not just one
 * category among fifteen.
 *
 * What this module deliberately does NOT do: check that a category
 * decision is consistent with the participant's `identityMode`
 * (`session-participant.ts`) — e.g. that `attributed_quotation` was never
 * even offered to an anonymous participant. That consistency is
 * `SessionConsentConfiguration`/capture-time UI's job to prevent in the
 * first place; this module only answers "was this category granted",
 * which is well-defined regardless of why a category was or wasn't on
 * offer.
 */

import type { ConsentCategory } from './consent-template.js';
import type { ParticipantConsentRecord } from './participant-consent-record.js';

export interface ConsentDecisionContext {
  /** Every consent record captured for this participant in this session, any status, any age. */
  readonly records: readonly ParticipantConsentRecord[];
  readonly requiredCategories: readonly string[];
  readonly now: Date;
}

export interface ConsentAnswer {
  readonly allowed: boolean;
  /** Human-readable — safe to surface in an error message or audit metadata, contains no participant content. */
  readonly reason: string;
}

function isRecordActive(record: ParticipantConsentRecord, now: Date): boolean {
  if (record.withdrawnAt !== null) return false;
  if (record.supersededByRecordId !== null) return false;
  if (record.expiresAt !== null && record.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * The one record, if any, that currently represents the participant's
 * position — not withdrawn, not superseded, not expired. Amendment
 * (`supersedeConsentRecord` + a fresh `captureParticipantConsent`) keeps
 * this to at most one at any given time; if more than one is somehow
 * active at once (a service-layer bug elsewhere), the most recently
 * captured wins rather than the decision throwing, because a decision
 * function failing open by throwing past a caller's `try/catch` is worse
 * than it failing closed by picking conservatively.
 */
export function resolveActiveConsentRecord(
  records: readonly ParticipantConsentRecord[],
  now: Date,
): ParticipantConsentRecord | null {
  const active = records.filter((r) => isRecordActive(r, now));
  if (active.length === 0) return null;
  return active.reduce((latest, r) =>
    r.capturedAt.getTime() > latest.capturedAt.getTime() ? r : latest,
  );
}

function categoryDecision(context: ConsentDecisionContext, category: string): ConsentAnswer {
  const record = resolveActiveConsentRecord(context.records, context.now);
  if (record === null) {
    return {
      allowed: false,
      reason: `No active consent record exists for this participant — '${category}' fails closed.`,
    };
  }

  const decision = record.categoryDecisions.find((d) => d.category === category);
  if (decision === undefined) {
    return {
      allowed: false,
      reason: `Category '${category}' was never decided in the active consent record — fails closed.`,
    };
  }

  return decision.granted
    ? { allowed: true, reason: `Category '${category}' was granted.` }
    : { allowed: false, reason: `Category '${category}' was refused.` };
}

/** The one category every other question is conditioned on. */
export function mayParticipate(context: ConsentDecisionContext): ConsentAnswer {
  return categoryDecision(context, 'participation' satisfies ConsentCategory);
}

function dependentOnParticipation(
  context: ConsentDecisionContext,
  category: string,
): ConsentAnswer {
  const participation = mayParticipate(context);
  if (!participation.allowed) {
    return {
      allowed: false,
      reason: `Participation is not consented to (${participation.reason}), so '${category}' cannot be allowed either.`,
    };
  }
  return categoryDecision(context, category);
}

export function mayRecordAudio(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'audio_recording' satisfies ConsentCategory);
}

export function mayRecordVideo(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'video_recording' satisfies ConsentCategory);
}

export function mayPhotograph(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'photography' satisfies ConsentCategory);
}

/**
 * A participant's own document, image, or other supported non-recording
 * artefact, submitted as evidence. Deliberately a distinct category from
 * `photography` (permission for Witness/the operator to photograph a
 * person or scene) and from `ai_processing`/`transcription`/`publication`/
 * etc. (what may be done with the artefact afterwards) — this category
 * answers only "did the submitter agree to hand this artefact to Witness as
 * evidence", nothing else, and does not establish permission on behalf of
 * any third party the artefact's content may identify.
 */
export function maySubmitEvidence(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'evidence_submission' satisfies ConsentCategory);
}

export function mayTranscribe(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'transcription' satisfies ConsentCategory);
}

export function mayProcessWithAi(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'ai_processing' satisfies ConsentCategory);
}

export function mayAttributeQuotation(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'attributed_quotation' satisfies ConsentCategory);
}

export function mayQuoteAnonymously(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'anonymous_quotation' satisfies ConsentCategory);
}

export function mayUseInternally(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'internal_use' satisfies ConsentCategory);
}

export function mayReportExternally(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'external_reporting' satisfies ConsentCategory);
}

export function mayPublish(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'publication' satisfies ConsentCategory);
}

export function mayUseForResearch(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'research_use' satisfies ConsentCategory);
}

export function mayReuseInFuture(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'future_reuse' satisfies ConsentCategory);
}

export function mayIncludeInKnowledgeGraph(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'knowledge_graph_inclusion' satisfies ConsentCategory);
}

export function mayFollowUp(context: ConsentDecisionContext): ConsentAnswer {
  return dependentOnParticipation(context, 'follow_up_contact' satisfies ConsentCategory);
}

/**
 * Generic form for an organisation-defined category beyond the well-known
 * fifteen (`consent-template.ts`'s file header) — same participation-gated,
 * fail-closed rule, just not exposed as its own named function since the
 * category name is not known in advance.
 */
export function mayUseCategory(context: ConsentDecisionContext, category: string): ConsentAnswer {
  return dependentOnParticipation(context, category);
}
