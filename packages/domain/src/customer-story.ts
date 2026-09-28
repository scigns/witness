/**
 * CustomerStory — a governed testimonial candidate derived from positive
 * `ProductFeedback` (Phase 6, Track B).
 *
 * The lifecycle is deliberately: private feedback -> candidate story ->
 * permission confirmed (captured once, at proposal time, one-way revocable)
 * -> moderation (pending -> approved/rejected) -> publish -> unpublish, with
 * moderation and publication gated by two genuinely different capabilities
 * (`customer_story:moderate` vs `customer_story:publish` — see
 * services/api-gateway's policy). An organisation's own moderator can curate
 * and approve a story; only someone separately authorised at the platform
 * scope can make it public. That separation is an authorisation concern
 * enforced at the API layer — this file enforces the data-level half of it:
 * `publishCustomerStory` refuses to run at all unless the story is approved
 * and its consent has not been withdrawn, independent of who is asking.
 *
 * Modelled on `candidate-assertion.ts`'s human-gated, one-way lifecycle, and
 * on `agreement.ts`'s "don't store what can be computed" philosophy:
 * `isPubliclyVisible` is derived at read time from `moderationStatus`,
 * `publishedAt` and `consentWithdrawnAt` rather than a fourth status field
 * that could drift out of sync with the other three.
 *
 * `quote`/`context`/`organisationLabel` are moderator-curated public wording,
 * always stored separately from `rawQuote` (an immutable snapshot of the
 * originating feedback comment) and from the `ProductFeedback` row itself —
 * nothing in this file, or in the service layer that calls it, ever writes
 * back to `ProductFeedback`.
 */

import { InvariantViolation } from './errors.js';
import { isHuman } from './actor.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { FeedbackMoment, ProductFeedback } from './product-feedback.js';
import { isPositiveFeedback } from './product-feedback.js';
import type { CustomerStoryId, OrganisationId, ProductFeedbackId, WorkspaceId } from './ids.js';

export const CUSTOMER_STORY_CONSENT_CHOICES = ['declined', 'named', 'anonymous'] as const;
export type CustomerStoryConsentChoice = (typeof CUSTOMER_STORY_CONSENT_CHOICES)[number];

export const CUSTOMER_STORY_MODERATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type CustomerStoryModerationStatus = (typeof CUSTOMER_STORY_MODERATION_STATUSES)[number];

/** Derived from the triggering feedback's moment, never asked of the person. */
const MOMENT_ROLE_LABEL: Readonly<Record<FeedbackMoment, string>> = {
  participant_capture_success: 'Participant',
  facilitator_recap: 'Facilitator',
  reviewer_queue_cleared: 'Reviewer',
  report_export_success: 'Report author',
};

export interface CustomerStory {
  readonly id: CustomerStoryId;
  readonly productFeedbackId: ProductFeedbackId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;

  readonly consentChoice: 'named' | 'anonymous';
  readonly organisationAttributionConsent: boolean;
  readonly attributedName: string | null;
  readonly consentGivenAt: Date;
  readonly consentWithdrawnAt: Date | null;

  readonly roleLabel: string;
  readonly rawQuote: string | null;

  readonly quote: string | null;
  readonly context: string | null;
  readonly organisationLabel: string | null;

  readonly moderationStatus: CustomerStoryModerationStatus;
  readonly moderationReason: string | null;
  readonly moderatedBy: Actor | null;
  readonly moderatedAt: Date | null;

  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly version: number;
}

export interface CustomerStoryOutcome {
  readonly story: CustomerStory;
  readonly event: PendingAuditEvent;
}

/** Whether this feedback is positive enough to offer a testimonial follow-up at all. */
export function mayOfferTestimonial(feedback: ProductFeedback): boolean {
  return isPositiveFeedback(feedback);
}

function assertConsentChoice(value: string): CustomerStoryConsentChoice {
  if (!(CUSTOMER_STORY_CONSENT_CHOICES as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised consent choice.`,
      'INVALID_CONSENT_CHOICE',
    );
  }
  return value as CustomerStoryConsentChoice;
}

function assertSafeText(value: string, field: string, code: string, maxLength: number): string {
  const trimmed = value.trim();
  const hasControlCharacter = Array.from(trimmed).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (codePoint < 32 && codePoint !== 10) || codePoint === 127;
  });
  if (trimmed.length === 0 || trimmed.length > maxLength || hasControlCharacter) {
    throw new InvariantViolation(
      `${field} must be non-empty, at most ${maxLength} characters, and contain no control characters other than newlines.`,
      code,
    );
  }
  return trimmed;
}

export interface ProposeCustomerStoryInput {
  id: CustomerStoryId;
  feedback: ProductFeedback;
  consentChoice: string;
  organisationAttributionConsent: boolean;
  attributedName?: string | null | undefined;
  at: Date;
}

/**
 * Proposes a candidate story from a feedback response's consent choice.
 * Returns `null` (no row should be created) when the person declined.
 * Throws if the underlying feedback was not positive — even if a client
 * forges the call directly, this cannot be bypassed by skipping the UI.
 */
export function proposeCustomerStory(
  input: ProposeCustomerStoryInput,
): CustomerStoryOutcome | null {
  const consentChoice = assertConsentChoice(input.consentChoice);
  if (consentChoice === 'declined') return null;

  if (!mayOfferTestimonial(input.feedback)) {
    throw new InvariantViolation(
      'A testimonial candidate can only be proposed from positive feedback.',
      'CUSTOMER_STORY_REQUIRES_POSITIVE_FEEDBACK',
    );
  }

  const attributedName =
    consentChoice === 'named'
      ? input.attributedName != null && input.attributedName.trim().length > 0
        ? assertSafeText(input.attributedName, 'Attributed name', 'ATTRIBUTED_NAME_INVALID', 200)
        : null
      : null;
  if (
    consentChoice === 'anonymous' &&
    input.attributedName != null &&
    input.attributedName.trim().length > 0
  ) {
    throw new InvariantViolation(
      'A name cannot be attributed to an anonymous consent choice.',
      'ATTRIBUTED_NAME_NOT_ALLOWED_ANONYMOUS',
    );
  }

  const rawQuote =
    input.feedback.comment != null && input.feedback.comment.trim().length > 0
      ? input.feedback.comment
      : null;

  const story: CustomerStory = Object.freeze({
    id: input.id,
    productFeedbackId: input.feedback.id,
    organisationId: input.feedback.organisationId,
    workspaceId: input.feedback.workspaceId,
    consentChoice,
    organisationAttributionConsent: input.organisationAttributionConsent,
    attributedName,
    consentGivenAt: input.at,
    consentWithdrawnAt: null,
    roleLabel: MOMENT_ROLE_LABEL[input.feedback.moment],
    rawQuote,
    quote: null,
    context: null,
    organisationLabel: null,
    moderationStatus: 'pending',
    moderationReason: null,
    moderatedBy: null,
    moderatedAt: null,
    publishedAt: null,
    createdAt: input.at,
    version: 1,
  });

  return {
    story,
    event: {
      action: 'customer_story.proposed',
      actor: input.feedback.submittedBy,
      metadata: {
        storyId: story.id,
        productFeedbackId: story.productFeedbackId,
        consentChoice: story.consentChoice,
      },
    },
  };
}

function assertNotRejected(story: CustomerStory): void {
  if (story.moderationStatus === 'rejected') {
    throw new InvariantViolation(
      'A rejected story cannot be edited — propose a new candidate instead.',
      'CUSTOMER_STORY_REJECTED',
    );
  }
}

export interface CustomerStoryWording {
  readonly quote: string;
  readonly context: string;
  readonly organisationLabel?: string | null | undefined;
}

/**
 * Edits the public-facing wording. Never touches `rawQuote` or the source
 * `ProductFeedback`. Refuses to set an organisation label unless the person
 * separately consented to organisation attribution — a moderator cannot
 * override that by simply typing a name into the field.
 */
export function editCustomerStoryWording(
  story: CustomerStory,
  moderator: Actor,
  wording: CustomerStoryWording,
  _at: Date,
): CustomerStoryOutcome {
  if (!isHuman(moderator)) {
    throw new InvariantViolation(
      'Only a human may curate testimonial wording.',
      'HUMAN_MODERATOR_REQUIRED',
    );
  }
  assertNotRejected(story);

  const quote = assertSafeText(wording.quote, 'Quote', 'CUSTOMER_STORY_QUOTE_INVALID', 1000);
  const context = assertSafeText(wording.context, 'Context', 'CUSTOMER_STORY_CONTEXT_INVALID', 500);

  const organisationLabelInput = wording.organisationLabel ?? null;
  if (organisationLabelInput !== null && organisationLabelInput.trim().length > 0) {
    if (!story.organisationAttributionConsent) {
      throw new InvariantViolation(
        'Organisation attribution was not consented to — cannot set an organisation label.',
        'ORGANISATION_ATTRIBUTION_NOT_CONSENTED',
      );
    }
  }
  const organisationLabel =
    organisationLabelInput !== null && organisationLabelInput.trim().length > 0
      ? assertSafeText(
          organisationLabelInput,
          'Organisation label',
          'CUSTOMER_STORY_ORG_LABEL_INVALID',
          200,
        )
      : null;

  return {
    story: { ...story, quote, context, organisationLabel, version: story.version + 1 },
    event: {
      action: 'customer_story.wording_edited',
      actor: moderator,
      metadata: { storyId: story.id },
    },
  };
}

function assertPendingModeration(story: CustomerStory): void {
  if (story.moderationStatus !== 'pending') {
    throw new InvariantViolation(
      `Story is '${story.moderationStatus}', not 'pending' — it has already been moderated.`,
      'CUSTOMER_STORY_NOT_PENDING',
    );
  }
}

export function approveCustomerStory(
  story: CustomerStory,
  moderator: Actor,
  at: Date,
): CustomerStoryOutcome {
  if (!isHuman(moderator)) {
    throw new InvariantViolation(
      'Only a human may approve a testimonial candidate.',
      'HUMAN_MODERATOR_REQUIRED',
    );
  }
  assertPendingModeration(story);
  if (story.quote === null || story.context === null) {
    throw new InvariantViolation(
      'A story must have curated quote and context wording before it can be approved.',
      'CUSTOMER_STORY_WORDING_REQUIRED',
    );
  }

  return {
    story: {
      ...story,
      moderationStatus: 'approved',
      moderationReason: null,
      moderatedBy: moderator,
      moderatedAt: at,
      version: story.version + 1,
    },
    event: {
      action: 'customer_story.approved',
      actor: moderator,
      metadata: { storyId: story.id },
    },
  };
}

export function rejectCustomerStory(
  story: CustomerStory,
  moderator: Actor,
  reason: string,
  at: Date,
): CustomerStoryOutcome {
  if (!isHuman(moderator)) {
    throw new InvariantViolation(
      'Only a human may reject a testimonial candidate.',
      'HUMAN_MODERATOR_REQUIRED',
    );
  }
  assertPendingModeration(story);
  const trimmedReason = assertSafeText(
    reason,
    'Rejection reason',
    'REJECT_RATIONALE_REQUIRED',
    500,
  );

  return {
    story: {
      ...story,
      moderationStatus: 'rejected',
      moderationReason: trimmedReason,
      moderatedBy: moderator,
      moderatedAt: at,
      version: story.version + 1,
    },
    event: {
      action: 'customer_story.rejected',
      actor: moderator,
      metadata: { storyId: story.id, reason: trimmedReason },
    },
  };
}

/**
 * Makes an approved, consent-valid story public. Fails closed — refuses to
 * run at all if the story is not approved or if consent has been withdrawn,
 * regardless of who is calling. Who is *allowed* to call this is an
 * authorisation concern enforced separately at the API layer
 * (`customer_story:publish`, platform-scope only).
 */
export function publishCustomerStory(
  story: CustomerStory,
  publisher: Actor,
  at: Date,
): CustomerStoryOutcome {
  if (!isHuman(publisher)) {
    throw new InvariantViolation(
      'Only a human may publish a testimonial.',
      'HUMAN_PUBLISHER_REQUIRED',
    );
  }
  if (story.moderationStatus !== 'approved') {
    throw new InvariantViolation(
      `Story is '${story.moderationStatus}', not 'approved' — it cannot be published.`,
      'CUSTOMER_STORY_NOT_APPROVED',
    );
  }
  if (story.consentWithdrawnAt !== null) {
    throw new InvariantViolation(
      'Consent for this story has been withdrawn — it cannot be published.',
      'CUSTOMER_STORY_CONSENT_WITHDRAWN',
    );
  }

  return {
    story: { ...story, publishedAt: at, version: story.version + 1 },
    event: {
      action: 'customer_story.published',
      actor: publisher,
      metadata: { storyId: story.id },
    },
  };
}

/**
 * Removes public visibility. History is preserved via the audit trail (the
 * `customer_story.published`/`.unpublished` events), not by mutating away
 * the fact that the story was once public — the entity itself only tracks
 * current state, matching `agreement.ts`'s "don't store the derivable" style.
 */
export function unpublishCustomerStory(
  story: CustomerStory,
  publisher: Actor,
  _at: Date,
): CustomerStoryOutcome {
  if (!isHuman(publisher)) {
    throw new InvariantViolation(
      'Only a human may unpublish a testimonial.',
      'HUMAN_PUBLISHER_REQUIRED',
    );
  }
  if (story.publishedAt === null) {
    throw new InvariantViolation(
      'Story is not currently published.',
      'CUSTOMER_STORY_NOT_PUBLISHED',
    );
  }

  return {
    story: { ...story, publishedAt: null, version: story.version + 1 },
    event: {
      action: 'customer_story.unpublished',
      actor: publisher,
      metadata: { storyId: story.id },
    },
  };
}

/** One-way. Idempotent-guarded — withdrawing an already-withdrawn consent is a caller error. */
export function withdrawCustomerStoryConsent(
  story: CustomerStory,
  withdrawnBy: Actor,
  at: Date,
): CustomerStoryOutcome {
  if (story.consentWithdrawnAt !== null) {
    throw new InvariantViolation(
      'Consent has already been withdrawn.',
      'CUSTOMER_STORY_CONSENT_ALREADY_WITHDRAWN',
    );
  }

  return {
    story: { ...story, consentWithdrawnAt: at, version: story.version + 1 },
    event: {
      action: 'customer_story.consent_withdrawn',
      actor: withdrawnBy,
      metadata: { storyId: story.id },
    },
  };
}

/** Computed at read time: approved, currently published, and consent still valid. */
export function isPubliclyVisible(story: CustomerStory, _now: Date): boolean {
  return (
    story.moderationStatus === 'approved' &&
    story.publishedAt !== null &&
    story.consentWithdrawnAt === null
  );
}
