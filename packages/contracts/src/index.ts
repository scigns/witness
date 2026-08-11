/**
 * @witness/contracts — the API surface, as types and runtime schemas.
 *
 * Apache-2.0, deliberately (ADR-0002). An integrator building against Witness
 * compiles this package into their own system; requiring them to adopt copyleft
 * in order to call an API would suppress exactly the ecosystem Witness needs.
 *
 * **This package must not import from any GPL workspace package.** Apache-2.0 code
 * can be consumed by GPL code; the reverse is not true. That is why the review
 * state union below is declared here rather than imported from `@witness/domain`,
 * even though the two must agree — `contracts.test.ts` in the API service asserts
 * they have not drifted, which is the correct place for a check that spans a
 * licence boundary.
 */

import { z } from 'zod';

export const REVIEW_STATES = ['draft', 'in_review', 'confirmed', 'corrected', 'rejected'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const SOURCE_KINDS = ['meeting', 'document', 'correspondence', 'manual_entry'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const ACTOR_KINDS = ['human', 'model', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const ACCOUNT_STATES = ['invited', 'active', 'suspended', 'deactivated'] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export const MEMBERSHIP_STATES = ['invited', 'active', 'suspended', 'revoked'] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

export const WITNESS_ROLES = [
  'admin',
  'facilitator',
  'contributor',
  'reviewer',
  'participant',
  'reader',
] as const;
export type WitnessRole = (typeof WITNESS_ROLES)[number];

// ─── Requests ────────────────────────────────────────────────────────────────

export const createRecordRequestSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(200),
  body: z.string().trim().min(1, 'Content is required'),
  source: z.object({
    kind: z.enum(SOURCE_KINDS),
    label: z.string().trim().min(1, 'A source label is required').max(300),
    occurredAt: z.string().datetime({ offset: true }),
  }),
});
export type CreateRecordRequest = z.infer<typeof createRecordRequestSchema>;

export const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit') }),
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('correct'), body: z.string().trim().min(1) }),
  z.object({ action: z.literal('reject'), reason: z.string().trim().min(1) }),
  z.object({ action: z.literal('reopen'), reason: z.string().trim().min(1) }),
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export const createOrganisationRequestSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(200),
});
export type CreateOrganisationRequest = z.infer<typeof createOrganisationRequestSchema>;

export const createWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(200),
  organisationId: z.string().uuid('A valid organisation id is required'),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

export const createUserRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'An email address is required')
    .max(320)
    .email('A valid email address is required'),
  displayName: z.string().trim().min(1, 'A display name is required').max(200),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const addMembershipRequestSchema = z.object({
  userId: z.string().uuid('A valid user id is required'),
});
export type AddMembershipRequest = z.infer<typeof addMembershipRequestSchema>;

/**
 * Onboard a brand-new person into one organisation in a single call: account,
 * membership and role assignment together. This is the organisation-scoped
 * counterpart to `createUserRequestSchema` — that request has no
 * organisation to scope to and so only ever reaches the `admin` tier through
 * the (deliberately unreachable) global grant resolution; this one is
 * authorised against the organisation itself, which an organisation
 * administrator does hold.
 */
export const inviteOrganisationUserRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'An email address is required')
    .max(320)
    .email('A valid email address is required'),
  displayName: z.string().trim().min(1, 'A display name is required').max(200),
  role: z.enum(WITNESS_ROLES, { message: 'A recognised Witness role is required' }),
});
export type InviteOrganisationUserRequest = z.infer<typeof inviteOrganisationUserRequestSchema>;

/**
 * Mirrors the review-action pattern (`reviewActionSchema` above): a named
 * transition rather than a raw target state, so an invalid transition is a
 * validation error with a clear name rather than an opaque enum value.
 */
export const membershipActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('activate') }),
  z.object({ action: z.literal('suspend') }),
  z.object({ action: z.literal('revoke') }),
]);
export type MembershipAction = z.infer<typeof membershipActionSchema>;

export const assignRoleRequestSchema = z.object({
  role: z.enum(WITNESS_ROLES, { message: 'A recognised Witness role is required' }),
});
export type AssignRoleRequest = z.infer<typeof assignRoleRequestSchema>;

// ─── Co-design sessions (BUILD_ROADMAP.md Milestone 2) ────────────────────────

export const SESSION_STATUSES = ['draft', 'scheduled', 'open', 'closed', 'archived'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_DELIVERY_MODES = [
  'in_person',
  'online',
  'hybrid',
  'asynchronous',
  'other',
] as const;
export type SessionDeliveryMode = (typeof SESSION_DELIVERY_MODES)[number];

export const SESSION_PARTICIPANT_VISIBILITIES = [
  'visible_to_all_participants',
  'facilitators_only',
] as const;
export type SessionParticipantVisibility = (typeof SESSION_PARTICIPANT_VISIBILITIES)[number];

export const SESSION_CONSENT_CONFIGURATION_STATES = ['not_configured', 'configured'] as const;
export type SessionConsentConfigurationState =
  (typeof SESSION_CONSENT_CONFIGURATION_STATES)[number];

/**
 * A suggested starting point for the frontend's session-type picker — NOT a
 * closed enum. The request schema below accepts any non-empty string up to
 * 100 characters: culturally specific practices such as "talanoa" are not
 * decorative labels for a generic workflow, and an organisation must be able
 * to name a protocol this list does not anticipate without engineering
 * involvement.
 */
export const SUGGESTED_SESSION_TYPES = [
  'co_design_workshop',
  'community_consultation',
  'talanoa',
  'policy_meeting',
  'focus_group',
  'interview',
  'training_workshop',
  'internal_planning_session',
  'formal_proceeding',
  'other',
] as const;

const sessionLanguagesSchema = z
  .array(z.string().trim().min(1).max(50))
  .max(20, 'At most 20 supported languages may be listed');

export const createCoDesignSessionRequestSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(200),
  purpose: z.string().trim().min(1, 'A purpose is required').max(2000),
  description: z.string().trim().max(5000).optional(),
  sessionType: z.string().trim().min(1, 'A session type is required').max(100),
  location: z.string().trim().max(300).optional(),
  deliveryMode: z.enum(SESSION_DELIVERY_MODES),
  primaryFacilitatorId: z.string().uuid('A valid facilitator id is required'),
  supportedLanguages: sessionLanguagesSchema.optional(),
  culturalProtocolNotes: z.string().trim().max(5000).optional(),
  participantVisibility: z.enum(SESSION_PARTICIPANT_VISIBILITIES).optional(),
});
export type CreateCoDesignSessionRequest = z.infer<typeof createCoDesignSessionRequestSchema>;

/**
 * `expectedVersion` backs optimistic concurrency (`CoDesignSessionDetail.version`):
 * the client submits the version it last read, and the server rejects the
 * write with `409 STALE_VERSION` rather than silently overwriting a change
 * it never saw. Required, not optional — an update with no version to check
 * against defeats the purpose of asking for one.
 */
export const updateCoDesignSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  purpose: z.string().trim().min(1).max(2000).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  sessionType: z.string().trim().min(1).max(100).optional(),
  location: z.string().trim().max(300).nullable().optional(),
  deliveryMode: z.enum(SESSION_DELIVERY_MODES).optional(),
  supportedLanguages: sessionLanguagesSchema.optional(),
  culturalProtocolNotes: z.string().trim().max(5000).nullable().optional(),
  participantVisibility: z.enum(SESSION_PARTICIPANT_VISIBILITIES).optional(),
  primaryFacilitatorId: z.string().uuid().optional(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateCoDesignSessionRequest = z.infer<typeof updateCoDesignSessionRequestSchema>;

/**
 * Mirrors `reviewActionSchema`: a named transition rather than a raw target
 * state, so an invalid transition is a validation error with a clear name
 * rather than an opaque status string. Every variant carries
 * `expectedVersion` for the same optimistic-concurrency reason as the update
 * schema above.
 */
export const sessionTransitionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('schedule'),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }).optional(),
    timezone: z.string().trim().max(64).optional(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ action: z.literal('unschedule'), expectedVersion: z.number().int().positive() }),
  z.object({ action: z.literal('open'), expectedVersion: z.number().int().positive() }),
  z.object({ action: z.literal('close'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('reopen'),
    reason: z.string().trim().min(1, 'A reason is required').max(2000),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ action: z.literal('archive'), expectedVersion: z.number().int().positive() }),
]);
export type SessionTransitionRequest = z.infer<typeof sessionTransitionRequestSchema>;

// ─── Session participants (BUILD_ROADMAP.md Milestone 3) ──────────────────────

export const PARTICIPANT_IDENTITY_MODES = ['named', 'pseudonymous', 'anonymous'] as const;
export type ParticipantIdentityMode = (typeof PARTICIPANT_IDENTITY_MODES)[number];

export const PARTICIPANT_IDENTITY_VISIBILITIES = [
  'visible_to_all_participants',
  'facilitators_only',
] as const;
export type ParticipantIdentityVisibility = (typeof PARTICIPANT_IDENTITY_VISIBILITIES)[number];

export const PARTICIPATION_MODES = [
  'in_person',
  'online',
  'hybrid',
  'asynchronous',
  'proxy',
  'other',
] as const;
export type ParticipationMode = (typeof PARTICIPATION_MODES)[number];

export const PARTICIPANT_INVITATION_STATUSES = [
  'not_invited',
  'invited',
  'accepted',
  'declined',
  'cancelled',
] as const;
export type ParticipantInvitationStatus = (typeof PARTICIPANT_INVITATION_STATUSES)[number];

export const PARTICIPANT_ATTENDANCE_STATUSES = [
  'expected',
  'present',
  'absent',
  'partially_attended',
  'left_early',
] as const;
export type ParticipantAttendanceStatus = (typeof PARTICIPANT_ATTENDANCE_STATUSES)[number];

/**
 * A participant's consent status at a glance — the states a record can be
 * in (`PARTICIPANT_CONSENT_RECORD_STATUSES` below) plus two states that
 * describe the *absence* of one: `not_configured` (the session has no
 * consent configuration yet) and `not_requested` (configured, but nothing
 * has been captured for this participant). Deliberately excludes
 * `superseded` — a superseded record is never the participant's *current*
 * position, only a step in its history, so it never appears as a summary.
 */
export const PARTICIPANT_CONSENT_STATUS_SUMMARIES = [
  'not_configured',
  'not_requested',
  'granted',
  'partially_granted',
  'refused',
  'withdrawn',
  'expired',
] as const;
export type ParticipantConsentStatusSummary = (typeof PARTICIPANT_CONSENT_STATUS_SUMMARIES)[number];

/**
 * A suggested starting point for the frontend's participant-type picker —
 * NOT a closed enum, same reasoning as `SUGGESTED_SESSION_TYPES`. Never
 * confuse this with a `WitnessRole` (`role.ts`): "interpreter" is a role a
 * person plays in a specific session, not a system authorisation grant.
 */
export const SUGGESTED_PARTICIPANT_TYPES = [
  'facilitator',
  'participant',
  'community_representative',
  'government_representative',
  'civil_society_representative',
  'researcher',
  'subject_matter_expert',
  'interpreter',
  'observer',
  'note_taker',
  'other',
] as const;

export const addSessionParticipantRequestSchema = z.object({
  linkedUserId: z.string().uuid().optional(),
  displayName: z.string().trim().min(1).max(200).optional(),
  preferredName: z.string().trim().max(200).optional(),
  pronouns: z.string().trim().max(50).optional(),
  affiliation: z.string().trim().max(300).optional(),
  participantType: z.string().trim().min(1, 'A participant type is required').max(100),
  participationMode: z.enum(PARTICIPATION_MODES),
  identityMode: z.enum(PARTICIPANT_IDENTITY_MODES),
  identityVisibility: z.enum(PARTICIPANT_IDENTITY_VISIBILITIES).optional(),
  languagePreference: z.string().trim().max(50).optional(),
  accessibilityRequirements: z.string().trim().max(2000).optional(),
});
export type AddSessionParticipantRequest = z.infer<typeof addSessionParticipantRequestSchema>;

export const updateSessionParticipantRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  preferredName: z.string().trim().max(200).nullable().optional(),
  pronouns: z.string().trim().max(50).nullable().optional(),
  affiliation: z.string().trim().max(300).nullable().optional(),
  participantType: z.string().trim().min(1).max(100).optional(),
  participationMode: z.enum(PARTICIPATION_MODES).optional(),
  languagePreference: z.string().trim().max(50).nullable().optional(),
  accessibilityRequirements: z.string().trim().max(2000).nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateSessionParticipantRequest = z.infer<typeof updateSessionParticipantRequestSchema>;

/**
 * Restricted — a caller needs `participant:manage_restricted`, not merely
 * `participant:update`, to reach this. Separate schema/endpoint from the
 * general update above so that permission is enforced independently, not
 * bundled into an action a lower-privileged caller might also send.
 */
export const updateParticipantNotesRequestSchema = z.object({
  facilitatorNotes: z.string().trim().max(5000).nullable(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateParticipantNotesRequest = z.infer<typeof updateParticipantNotesRequestSchema>;

/**
 * Mirrors `sessionTransitionRequestSchema`: every state change that is not a
 * free-form field edit is a named action here, one endpoint, so the
 * lifecycle rules live in one place instead of being reimplemented per
 * route. `link_user`/`unlink_user` are bundled in even though they are not
 * strictly a state machine, for the same "one small transition surface"
 * reasoning.
 */
export const sessionParticipantTransitionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invite'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('accept_invitation'),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('decline_invitation'),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('cancel_invitation'),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('record_attendance'),
    status: z.enum(PARTICIPANT_ATTENDANCE_STATUSES),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('change_identity_visibility'),
    identityVisibility: z.enum(PARTICIPANT_IDENTITY_VISIBILITIES),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('link_user'),
    linkedUserId: z.string().uuid('A valid user id is required'),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ action: z.literal('unlink_user'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('withdraw'),
    reason: z.string().trim().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ action: z.literal('restore'), expectedVersion: z.number().int().positive() }),
]);
export type SessionParticipantTransitionRequest = z.infer<
  typeof sessionParticipantTransitionRequestSchema
>;

// ─── Consent management (BUILD_ROADMAP.md Milestone 4) ────────────────────────

/**
 * The categories `ConsentPolicyService` (services/api-gateway) knows how to
 * answer structured questions about. NOT a closed enum — a template's
 * `categories` list may declare organisation-defined categories beyond
 * these, same reasoning as `SUGGESTED_SESSION_TYPES` — so request schemas
 * below accept any non-empty category string, not `z.enum(WELL_KNOWN_CONSENT_CATEGORIES)`.
 */
export const WELL_KNOWN_CONSENT_CATEGORIES = [
  'participation',
  'audio_recording',
  'video_recording',
  'photography',
  'transcription',
  'ai_processing',
  'attributed_quotation',
  'anonymous_quotation',
  'internal_use',
  'external_reporting',
  'publication',
  'research_use',
  'future_reuse',
  'knowledge_graph_inclusion',
  'follow_up_contact',
] as const;

export const CONSENT_TEMPLATE_STATUSES = ['draft', 'active', 'retired'] as const;
export type ConsentTemplateStatus = (typeof CONSENT_TEMPLATE_STATUSES)[number];

/**
 * The `SessionConsentConfiguration` aggregate's own status — deliberately
 * named "STATUSES"/"Status" rather than "STATES"/"State" to keep it
 * distinct from `SESSION_CONSENT_CONFIGURATION_STATES`/
 * `SessionConsentConfigurationState` above, which describes a *session's*
 * `consentConfigurationState` field (`not_configured`/`configured`), not
 * this aggregate's own lifecycle. The same naming split exists in
 * `packages/domain/src/session-consent-configuration.ts`.
 */
export const SESSION_CONSENT_CONFIGURATION_STATUSES = ['draft', 'active', 'retired'] as const;
export type SessionConsentConfigurationStatus =
  (typeof SESSION_CONSENT_CONFIGURATION_STATUSES)[number];

export const PARTICIPANT_CONSENT_RECORD_STATUSES = [
  'granted',
  'partially_granted',
  'refused',
  'withdrawn',
  'expired',
  'superseded',
] as const;
export type ParticipantConsentRecordStatus = (typeof PARTICIPANT_CONSENT_RECORD_STATUSES)[number];

const consentTemplateCategoryRequestSchema = z.object({
  category: z.string().trim().min(1, 'A category name is required').max(100),
  required: z.boolean(),
});

export const createConsentTemplateRequestSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(200),
  purpose: z.string().trim().min(1, 'A purpose is required').max(2000),
  description: z.string().trim().max(5000).optional(),
  plainLanguageSummary: z.string().trim().min(1, 'A plain-language summary is required').max(5000),
  supportedLanguages: z
    .array(z.string().trim().min(1).max(50))
    .min(1, 'At least one supported language is required')
    .max(20),
  categories: z
    .array(consentTemplateCategoryRequestSchema)
    .min(1, 'At least one category is required')
    .max(40),
  workspaceId: z.string().uuid().optional(),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
});
export type CreateConsentTemplateRequest = z.infer<typeof createConsentTemplateRequestSchema>;

/**
 * Every field is optional and, when omitted, the new version inherits the
 * previous version's value (`createNewTemplateVersion` in the domain
 * layer) — `organisationId`/`workspaceId` are never included here because
 * they cannot change between versions of the same family.
 */
export const createConsentTemplateVersionRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  purpose: z.string().trim().min(1).max(2000).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  plainLanguageSummary: z.string().trim().min(1).max(5000).optional(),
  supportedLanguages: z.array(z.string().trim().min(1).max(50)).min(1).max(20).optional(),
  categories: z.array(consentTemplateCategoryRequestSchema).min(1).max(40).optional(),
  validFrom: z.string().datetime({ offset: true }).nullable().optional(),
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
});
export type CreateConsentTemplateVersionRequest = z.infer<
  typeof createConsentTemplateVersionRequestSchema
>;

/**
 * Mirrors `membershipActionSchema`: a named lifecycle transition rather than
 * a raw target status. `expectedRevision` — not `expectedVersion` — backs
 * optimistic concurrency here, because `ConsentTemplate.revision` (not
 * `.version`, which is the template's own content-version number) is the
 * field this action bumps; see the domain layer's doc comment on why the
 * two are named differently.
 */
export const consentTemplateActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('activate'), expectedRevision: z.number().int().positive() }),
  z.object({ action: z.literal('retire'), expectedRevision: z.number().int().positive() }),
]);
export type ConsentTemplateAction = z.infer<typeof consentTemplateActionSchema>;

export const configureSessionConsentRequestSchema = z.object({
  consentTemplateId: z.string().uuid('A valid consent template id is required'),
  requiredCategories: z
    .array(z.string().trim().min(1).max(100))
    .min(1, 'At least one required category is needed'),
  optionalCategories: z.array(z.string().trim().min(1).max(100)).optional(),
  facilitatorInstructions: z.string().trim().max(5000).optional(),
  participantIntroduction: z.string().trim().max(5000).optional(),
  effectiveDate: z.string().datetime({ offset: true }).optional(),
});
export type ConfigureSessionConsentRequest = z.infer<typeof configureSessionConsentRequestSchema>;

export const reconfigureSessionConsentRequestSchema = configureSessionConsentRequestSchema.extend({
  expectedVersion: z.number().int().positive(),
});
export type ReconfigureSessionConsentRequest = z.infer<
  typeof reconfigureSessionConsentRequestSchema
>;

const consentCategoryDecisionRequestSchema = z.object({
  category: z.string().trim().min(1, 'A category name is required').max(100),
  granted: z.boolean(),
});

/**
 * Captures a participant's consent — used both for a first-time capture and,
 * with a different endpoint, to amend an existing record (the domain layer's
 * `supersedeConsentRecord` + fresh `captureParticipantConsent` pair share
 * this same input shape, so one schema serves both).
 */
export const captureParticipantConsentRequestSchema = z.object({
  categoryDecisions: z
    .array(consentCategoryDecisionRequestSchema)
    .min(1, 'At least one category decision is required'),
  captureMethod: z.string().trim().min(1, 'A capture method is required').max(100),
  language: z.string().trim().max(50).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  acknowledgementReference: z.string().trim().max(300).optional(),
});
export type CaptureParticipantConsentRequest = z.infer<
  typeof captureParticipantConsentRequestSchema
>;

export const withdrawParticipantConsentRequestSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
  expectedVersion: z.number().int().positive(),
});
export type WithdrawParticipantConsentRequest = z.infer<
  typeof withdrawParticipantConsentRequestSchema
>;

// ─── Evidence capture (BUILD_ROADMAP.md Milestone 5) ───────────────────────────

/**
 * The evidence types a facilitator can pick from. NOT a closed enum — see
 * `EVIDENCE_TYPES`'s doc comment in `packages/domain/src/evidence.ts` for
 * why request schemas below accept any non-empty string, not
 * `z.enum(SUGGESTED_EVIDENCE_TYPES)`.
 */
export const SUGGESTED_EVIDENCE_TYPES = [
  'observation',
  'quote',
  'idea',
  'concern',
  'need',
  'barrier',
  'opportunity',
  'risk',
  'question',
  'disagreement',
  'consensus',
  'decision_candidate',
  'commitment_candidate',
  'action_candidate',
  'recommendation',
  'facilitator_note',
  'document_reference',
  'link',
  'other',
] as const;

export const EVIDENCE_REVIEW_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'needs_clarification',
  'validated',
  'rejected',
  'withdrawn',
] as const;
export type EvidenceReviewStatus = (typeof EVIDENCE_REVIEW_STATUSES)[number];

export const EVIDENCE_VERIFICATION_STATUSES = ['unverified', 'verified', 'disputed'] as const;
export type EvidenceVerificationStatus = (typeof EVIDENCE_VERIFICATION_STATUSES)[number];

export const EVIDENCE_ATTRIBUTION_MODES = [
  'attributed',
  'pseudonymous',
  'anonymous',
  'facilitator_observation',
  'institutional_source',
  'unattributed',
] as const;
export type EvidenceAttributionMode = (typeof EVIDENCE_ATTRIBUTION_MODES)[number];

export const EVIDENCE_LINK_TYPES = [
  'supports',
  'contradicts',
  'clarifies',
  'duplicates',
  'follows_from',
  'related_to',
] as const;
export type EvidenceLinkType = (typeof EVIDENCE_LINK_TYPES)[number];

export const captureEvidenceRequestSchema = z.object({
  evidenceType: z.string().trim().min(1, 'An evidence type is required').max(100),
  title: z.string().trim().min(1, 'A title is required').max(300),
  content: z.string().trim().min(1, 'Content is required').max(20000),
  language: z.string().trim().max(50).optional(),
  sessionOffsetSeconds: z.number().int().min(0).optional(),
  sourceParticipantId: z.string().uuid().optional(),
  attributionMode: z.enum(EVIDENCE_ATTRIBUTION_MODES),
  identityVisibility: z.enum(PARTICIPANT_IDENTITY_VISIBILITIES).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  /** `true` for the quick-capture path — submits immediately rather than saving a draft. */
  submitImmediately: z.boolean().optional(),
});
export type CaptureEvidenceRequest = z.infer<typeof captureEvidenceRequestSchema>;

export const updateEvidenceDraftRequestSchema = z.object({
  evidenceType: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(20000).optional(),
  language: z.string().trim().max(50).nullable().optional(),
  sessionOffsetSeconds: z.number().int().min(0).nullable().optional(),
  sourceParticipantId: z.string().uuid().nullable().optional(),
  attributionMode: z.enum(EVIDENCE_ATTRIBUTION_MODES).optional(),
  identityVisibility: z.enum(PARTICIPANT_IDENTITY_VISIBILITIES).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateEvidenceDraftRequest = z.infer<typeof updateEvidenceDraftRequestSchema>;

export const evidenceTransitionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('withdraw'),
    reason: z.string().trim().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
  }),
]);
export type EvidenceTransitionRequest = z.infer<typeof evidenceTransitionRequestSchema>;

export const createEvidenceLinkRequestSchema = z.object({
  linkType: z.enum(EVIDENCE_LINK_TYPES),
  toEvidenceId: z.string().uuid('A valid evidence id is required'),
  note: z.string().trim().max(1000).optional(),
});
export type CreateEvidenceLinkRequest = z.infer<typeof createEvidenceLinkRequestSchema>;

// ─── Evidence review and validation (BUILD_ROADMAP.md Milestone 6) ─────────────

export const EVIDENCE_CORRECTION_TYPES = [
  'clerical',
  'participant_clarification',
  'facilitator_interpretation',
  'substantive',
] as const;
export type EvidenceCorrectionType = (typeof EVIDENCE_CORRECTION_TYPES)[number];

export const REVIEW_ASSIGNMENT_STATUSES = [
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
  'reassigned',
] as const;
export type ReviewAssignmentStatus = (typeof REVIEW_ASSIGNMENT_STATUSES)[number];

export const CLARIFICATION_STATUSES = ['open', 'answered', 'withdrawn', 'closed'] as const;
export type ClarificationStatus = (typeof CLARIFICATION_STATUSES)[number];

/**
 * A reviewer moving evidence through the review lifecycle itself — begin,
 * resume, validate, reject. Kept separate from
 * `evidenceTransitionRequestSchema` (submit/withdraw) because those are
 * available to whoever captured the evidence, while these require an
 * active `ReviewAssignment` — a distinct authorisation boundary the API
 * layer enforces before this schema is even reached.
 *
 * There is no `mark_needs_clarification` action here: that transition is
 * never taken on its own — it is always paired with opening a
 * `Clarification` (what is the reviewer asking?), so it is reached through
 * `POST .../clarifications` (`requestClarificationRequestSchema`) instead,
 * which moves both aggregates in one transaction. Likewise the common path
 * back from `needs_clarification` is reached through
 * `POST .../clarifications/:id/close`, once a clarification has been
 * answered. `resume_review` remains here only as the escape hatch for the
 * less common case — the reviewer's question was withdrawn, not answered —
 * where no `Clarification` closure exists to pair with.
 */
export const evidenceReviewActionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('begin_review'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('resume_review'),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('validate'),
    reason: z.string().trim().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(1, 'A rejection reason is required').max(2000),
    expectedVersion: z.number().int().positive(),
  }),
]);
export type EvidenceReviewActionRequest = z.infer<typeof evidenceReviewActionRequestSchema>;

export const correctEvidenceRequestSchema = z.object({
  correctionType: z.enum(EVIDENCE_CORRECTION_TYPES),
  reason: z.string().trim().min(1, 'A correction reason is required').max(2000),
  evidenceType: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(20000).optional(),
  language: z.string().trim().max(50).nullable().optional(),
  sessionOffsetSeconds: z.number().int().min(0).nullable().optional(),
  sourceParticipantId: z.string().uuid().nullable().optional(),
  attributionMode: z.enum(EVIDENCE_ATTRIBUTION_MODES).optional(),
  identityVisibility: z.enum(PARTICIPANT_IDENTITY_VISIBILITIES).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  expectedVersion: z.number().int().positive(),
});
export type CorrectEvidenceRequest = z.infer<typeof correctEvidenceRequestSchema>;

export const assignReviewerRequestSchema = z.object({
  reviewerUserId: z.string().uuid('A valid reviewer user id is required'),
});
export type AssignReviewerRequest = z.infer<typeof assignReviewerRequestSchema>;

export const reassignReviewerRequestSchema = z.object({
  reviewerUserId: z.string().uuid('A valid reviewer user id is required'),
  reason: z.string().trim().max(2000).optional(),
});
export type ReassignReviewerRequest = z.infer<typeof reassignReviewerRequestSchema>;

export const cancelReviewAssignmentRequestSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});
export type CancelReviewAssignmentRequest = z.infer<typeof cancelReviewAssignmentRequestSchema>;

export const requestClarificationRequestSchema = z.object({
  question: z.string().trim().min(1, 'A question is required').max(2000),
});
export type RequestClarificationRequest = z.infer<typeof requestClarificationRequestSchema>;

export const respondToClarificationRequestSchema = z.object({
  response: z.string().trim().min(1, 'A response is required').max(4000),
});
export type RespondToClarificationRequest = z.infer<typeof respondToClarificationRequestSchema>;

export const withdrawClarificationRequestSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});
export type WithdrawClarificationRequest = z.infer<typeof withdrawClarificationRequestSchema>;

// ─── Decisions, commitments and actions (BUILD_ROADMAP.md Milestone 7) ────────

export const DECISION_STATUSES = ['proposed', 'confirmed', 'superseded', 'reversed'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const COMMITMENT_STATUSES = [
  'proposed',
  'active',
  'fulfilled',
  'withdrawn',
  'superseded',
] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const ACTION_ITEM_STATUSES = [
  'open',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const ACTION_ITEM_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type ActionItemPriority = (typeof ACTION_ITEM_PRIORITIES)[number];

export const OUTCOME_TYPES = ['decision', 'commitment', 'action_item'] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

/**
 * How an outcome is justified. There are exactly two admissible bases — see
 * `packages/domain/src/outcome-support.ts`'s file header for why, and why
 * `institutional_synthesis` is required to state a rationale rather than
 * being a way to record an outcome with nothing behind it.
 */
export const OUTCOME_SUPPORT_BASES = ['validated_evidence', 'institutional_synthesis'] as const;
export type OutcomeSupportBasis = (typeof OUTCOME_SUPPORT_BASES)[number];

export const OUTCOME_CANDIDATE_JOB_STATUSES = ['pending', 'completed', 'failed'] as const;
export type OutcomeCandidateJobStatus = (typeof OUTCOME_CANDIDATE_JOB_STATUSES)[number];

/**
 * A candidate decision, commitment, or action suggested by the local model
 * from a session's evidence and transcripts — never persisted, never itself
 * an outcome. Accepting one means calling the matching `propose*`/`create*`
 * request below with these fields pre-filled; the human may edit anything
 * before that request is ever sent, and nothing here becomes institutional
 * record until they do.
 */
export interface OutcomeCandidateView {
  type: OutcomeType;
  title: string;
  description: string;
  /** Only meaningful for `commitment`/`action_item` — `null` when the source text does not say. */
  ownerDescription: string | null;
  /** Which evidence item most directly supports this candidate, if any. */
  sourceEvidenceId: string | null;
  model: string;
}

/**
 * Generation runs as a background job (CPU-bound local inference can take
 * longer than a proxy in front of this deployment holds a connection open)
 * — `POST .../outcome-candidates` returns a `jobId` immediately;
 * `GET .../outcome-candidates/:jobId` polls this until `status` is terminal.
 */
export interface OutcomeCandidateJobView {
  status: OutcomeCandidateJobStatus;
  candidates: OutcomeCandidateView[] | null;
  failureReason: string | null;
}

export const proposeDecisionRequestSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(300),
  statement: z.string().trim().min(1, 'A decision statement is required').max(5000),
});
export type ProposeDecisionRequest = z.infer<typeof proposeDecisionRequestSchema>;

export const updateDecisionRequestSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  statement: z.string().trim().min(1).max(5000).optional(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateDecisionRequest = z.infer<typeof updateDecisionRequestSchema>;

/**
 * There is no `propose` action here — proposing creates the decision, so it
 * is a `POST` to the collection rather than a transition. `supersede`
 * requires the id of the replacement: "superseded by nothing" is how a
 * decision quietly disappears from the record.
 */
export const decisionTransitionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('supersede'),
    supersededByDecisionId: z.string().uuid('A valid replacement decision id is required'),
    reason: z.string().trim().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('reverse'),
    reason: z.string().trim().min(1, 'A reversal reason is required').max(2000),
    expectedVersion: z.number().int().positive(),
  }),
]);
export type DecisionTransitionRequest = z.infer<typeof decisionTransitionRequestSchema>;

/**
 * `ownerDescription` is required and `ownerUserId` is not: the owner of a
 * commitment is frequently a team or an agency rather than a Witness account
 * holder. See `packages/domain/src/commitment.ts`'s file header, including
 * why a session *participant* is never recorded as the owner.
 */
export const proposeCommitmentRequestSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(300),
  description: z.string().trim().min(1, 'A description is required').max(5000),
  ownerDescription: z.string().trim().min(1, 'An owner is required').max(300),
  ownerUserId: z.string().uuid().optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
});
export type ProposeCommitmentRequest = z.infer<typeof proposeCommitmentRequestSchema>;

export const updateCommitmentRequestSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  ownerDescription: z.string().trim().min(1).max(300).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateCommitmentRequest = z.infer<typeof updateCommitmentRequestSchema>;

export const commitmentTransitionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('activate'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('fulfil'),
    note: z.string().trim().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('withdraw'),
    reason: z.string().trim().min(1, 'A withdrawal reason is required').max(2000),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('supersede'),
    supersededByCommitmentId: z.string().uuid('A valid replacement commitment id is required'),
    reason: z.string().trim().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
  }),
]);
export type CommitmentTransitionRequest = z.infer<typeof commitmentTransitionRequestSchema>;

export const createActionItemRequestSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(300),
  description: z.string().trim().min(1, 'A description is required').max(5000),
  ownerDescription: z.string().trim().min(1, 'An owner is required').max(300),
  ownerUserId: z.string().uuid().optional(),
  priority: z.enum(ACTION_ITEM_PRIORITIES).optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
});
export type CreateActionItemRequest = z.infer<typeof createActionItemRequestSchema>;

export const updateActionItemRequestSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  ownerDescription: z.string().trim().min(1).max(300).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  priority: z.enum(ACTION_ITEM_PRIORITIES).optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateActionItemRequest = z.infer<typeof updateActionItemRequestSchema>;

/**
 * `record_progress` deliberately does not change state — it is available
 * while an action is `in_progress` *or* `blocked`, because a blocked action
 * can still have its situation updated and requiring an unblock first would
 * lose the note. The server rejects a progress update carrying neither a
 * percentage nor a note.
 */
export const actionItemTransitionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('record_progress'),
    percentComplete: z.number().int().min(0).max(100).optional(),
    note: z.string().trim().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('block'),
    reason: z.string().trim().min(1, 'A blocking reason is required').max(2000),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ action: z.literal('unblock'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('complete'),
    note: z.string().trim().max(2000).optional(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('cancel'),
    reason: z.string().trim().min(1, 'A cancellation reason is required').max(2000),
    expectedVersion: z.number().int().positive(),
  }),
]);
export type ActionItemTransitionRequest = z.infer<typeof actionItemTransitionRequestSchema>;

/**
 * Attach a basis to an outcome. Discriminated on `basis` so the rationale
 * is structurally required for institutional synthesis rather than checked
 * after the fact — an outcome with neither evidence nor stated reasoning is
 * indistinguishable from one somebody made up.
 */
export const recordOutcomeSupportRequestSchema = z.discriminatedUnion('basis', [
  z.object({
    basis: z.literal('validated_evidence'),
    evidenceId: z.string().uuid('A valid evidence id is required'),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    basis: z.literal('institutional_synthesis'),
    rationale: z.string().trim().min(1, 'A rationale is required').max(4000),
  }),
]);
export type RecordOutcomeSupportRequest = z.infer<typeof recordOutcomeSupportRequestSchema>;

// ─── Session reporting and export (BUILD_ROADMAP.md Milestone 8) ─────────────

export const REPORT_STATUSES = [
  'draft',
  'under_review',
  'approved',
  'published_internally',
  'exported',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Which audience a report is written for. This selects which consent category
 * every included record must satisfy, so an internal report and an external
 * one are different documents even when their narrative is identical.
 */
export const REPORT_AUDIENCES = ['internal', 'external', 'public'] as const;
export type ReportAudience = (typeof REPORT_AUDIENCES)[number];

export const REPORT_SOURCE_TYPES = ['evidence', 'decision', 'commitment', 'action_item'] as const;
export type ReportSourceType = (typeof REPORT_SOURCE_TYPES)[number];

/** How evidence may be attributed in a report once redacted. Never a real name. */
export const REPORT_ATTRIBUTION_LABELS = [
  'named_participant',
  'pseudonymous_participant',
  'anonymous_participant',
  'facilitator_observation',
  'institutional_source',
  'unattributed',
] as const;
export type ReportAttributionLabel = (typeof REPORT_ATTRIBUTION_LABELS)[number];

/** Export formats. PDF is deliberately not here — see the Milestone 8 PR. */
export const REPORT_EXPORT_FORMATS = ['html', 'markdown', 'json', 'csv'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

export const createReportRequestSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(300),
  purpose: z.string().trim().max(20000).optional(),
  audience: z.enum(REPORT_AUDIENCES).optional(),
  /**
   * Draw in everything eligible in the session at creation. Default true: a
   * report that starts empty invites an author to write a narrative first and
   * attach sources afterwards, which is the wrong way round.
   */
  includeEligibleSources: z.boolean().optional(),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

export const updateReportRequestSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  purpose: z.string().trim().max(20000).nullable().optional(),
  audience: z.enum(REPORT_AUDIENCES).optional(),
  facilitatorSynthesis: z.string().trim().max(20000).nullable().optional(),
  unresolvedQuestions: z.string().trim().max(20000).nullable().optional(),
  recommendations: z.string().trim().max(20000).nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
export type UpdateReportRequest = z.infer<typeof updateReportRequestSchema>;

/**
 * `request_changes` carries a required reason: "changes requested" with no
 * statement of what changes is not review, it is delay. `revise` produces a
 * new report at the next revision rather than editing the approved one.
 */
export const reportTransitionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('request_changes'),
    reason: z.string().trim().min(1, 'A reason is required').max(2000),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ action: z.literal('approve'), expectedVersion: z.number().int().positive() }),
  z.object({ action: z.literal('publish'), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal('revise'),
    reason: z.string().trim().min(1, 'A revision reason is required').max(2000),
    expectedVersion: z.number().int().positive(),
  }),
]);
export type ReportTransitionRequest = z.infer<typeof reportTransitionRequestSchema>;

export const includeReportSourceRequestSchema = z.object({
  sourceType: z.enum(REPORT_SOURCE_TYPES),
  sourceId: z.string().uuid('A valid record id is required'),
});
export type IncludeReportSourceRequest = z.infer<typeof includeReportSourceRequestSchema>;

// ─── Responses ───────────────────────────────────────────────────────────────

export interface ActorView {
  id: string;
  kind: ActorKind;
  displayName: string;
}

export interface ProvenanceView {
  source: {
    id: string;
    kind: SourceKind;
    label: string;
    occurredAt: string;
  };
  capturedBy: ActorView;
  capturedAt: string;
  /** Absent until the consent service exists (Phase 3). */
  consentGrantId: string | null;
}

export interface AuditEventView {
  id: string;
  action: string;
  actor: ActorView;
  occurredAt: string;
  hash: string;
  previousHash: string | null;
  metadata: Record<string, string>;
}

export interface RecordSummary {
  id: string;
  title: string;
  reviewState: ReviewState;
  isInstitutionalRecord: boolean;
  sourceLabel: string;
  capturedAt: string;
  updatedAt: string;
}

export interface RecordDetail extends RecordSummary {
  body: string;
  provenance: ProvenanceView;
  auditTrail: AuditEventView[];
  /** Server-computed, so a client never has to reimplement the state machine. */
  permittedActions: string[];
  /** Whether the audit chain for this record verifies right now. */
  auditChainValid: boolean;
}

export interface OrganisationSummary {
  id: string;
  name: string;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  organisationId: string;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  accountState: AccountState;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationMembershipView {
  id: string;
  organisationId: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  state: MembershipState;
  /** Permitted next actions, server-computed — same reasoning as `RecordDetail.permittedActions`. */
  permittedActions: MembershipAction['action'][];
  createdAt: string;
  updatedAt: string;
}

/**
 * The result of `POST /api/v1/organisations/:organisationId/users` — a new
 * account, already a member of that organisation and already carrying the
 * given role. The account is `invited` until the person signs in through the
 * identity provider with this exact (verified) email address, same as an
 * account created through `pnpm invite`.
 */
export interface OrganisationInvitationView {
  userId: string;
  email: string;
  displayName: string;
  accountState: AccountState;
  organisationId: string;
  membershipId: string;
  role: WitnessRole;
  createdAt: string;
}

export interface WorkspaceMembershipView {
  id: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  state: MembershipState;
  permittedActions: MembershipAction['action'][];
  createdAt: string;
  updatedAt: string;
}

/** The static role catalog — same for every organisation and workspace. */
export interface RoleDefinition {
  role: WitnessRole;
  /** Plain-language name, for an administrator who should never have to read a role identifier. */
  label: string;
  description: string;
  permittedActions: string[];
}

/**
 * A member's current role assignment in one organisation or workspace, or
 * the absence of one — `role: null` means the member has no assignment yet,
 * a normal and expected state rather than an error (BUILD_ROADMAP.md
 * Milestone 1.2: role assignment never happens implicitly).
 */
export interface RoleAssignmentView {
  membershipId: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  role: WitnessRole | null;
  roleLabel: string | null;
  permittedActions: string[];
  updatedAt: string | null;
}

/**
 * An organisation or workspace the signed-in user belongs to, together with
 * the role they hold there — `null` when their membership carries no role
 * assignment yet (Milestone 1.2: role assignment never happens implicitly,
 * so a membership predates its role assignment more often than not). This
 * is a display convenience for the current-context UI (Milestone 1.4,
 * Authorisation hardening); it is never itself an authorisation decision —
 * the server-side `PolicyEnforcementService` re-derives the same answer
 * independently on every request.
 */
export interface CurrentUserOrganisationView extends OrganisationSummary {
  role: WitnessRole | null;
}

export interface CurrentUserWorkspaceView extends WorkspaceSummary {
  role: WitnessRole | null;
}

/**
 * The signed-in user, as returned by `GET /api/v1/me`. Only organisations and
 * workspaces the user actually belongs to are listed — never the full
 * catalog — so a client that renders this response directly cannot
 * accidentally show access the user does not have.
 */
export interface CurrentUserView {
  id: string;
  displayName: string;
  email: string;
  accountState: AccountState;
  organisations: CurrentUserOrganisationView[];
  workspaces: CurrentUserWorkspaceView[];
}

export interface CoDesignSessionSummary {
  id: string;
  organisationId: string;
  workspaceId: string;
  title: string;
  sessionType: string;
  deliveryMode: SessionDeliveryMode;
  status: SessionStatus;
  startAt: string | null;
  endAt: string | null;
  primaryFacilitatorId: string;
  updatedAt: string;
}

export interface CoDesignSessionDetail extends CoDesignSessionSummary {
  purpose: string;
  description: string | null;
  location: string | null;
  timezone: string | null;
  supportedLanguages: string[];
  culturalProtocolNotes: string | null;
  participantVisibility: SessionParticipantVisibility;
  consentConfigurationState: SessionConsentConfigurationState;
  createdAt: string;
  openedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  /** Optimistic-concurrency counter — send back as `expectedVersion` on the next write. */
  version: number;
  /** Server-computed, so a client never has to reimplement the lifecycle state machine. */
  permittedTransitions: SessionStatus[];
  /** Whether the session currently accepts evidence capture — derived from `status`, not stored. */
  canCaptureEvidence: boolean;
}

export interface SessionLifecycleEventView {
  id: string;
  action: string;
  actor: ActorView;
  occurredAt: string;
  metadata: Record<string, string>;
}

/**
 * Privacy-safe by construction: this shape has no `linkedUserId` and no
 * `facilitatorNotes` field at all — not merely `null` when hidden, but
 * structurally absent, so a server-side mistake cannot leak either through
 * this type. `displayName`/`preferredName`/`pronouns`/`affiliation` carry
 * whatever value the server decided the caller may see — already redacted
 * to a generic placeholder server-side when `identityVisibility` is
 * `facilitators_only` and the caller does not hold
 * `participant:manage_restricted` (`participants.service.ts`).
 */
export interface SessionParticipantSummary {
  id: string;
  sessionId: string;
  displayName: string;
  preferredName: string | null;
  pronouns: string | null;
  affiliation: string | null;
  participantType: string;
  participationMode: ParticipationMode;
  identityMode: ParticipantIdentityMode;
  identityVisibility: ParticipantIdentityVisibility;
  invitationStatus: ParticipantInvitationStatus;
  attendanceStatus: ParticipantAttendanceStatus;
  consentStatusSummary: ParticipantConsentStatusSummary;
  withdrawn: boolean;
  updatedAt: string;
}

export interface SessionParticipantDetail extends SessionParticipantSummary {
  organisationId: string;
  workspaceId: string;
  languagePreference: string | null;
  accessibilityRequirements: string | null;
  createdAt: string;
  withdrawnAt: string | null;
  /** Optimistic-concurrency counter — send back as `expectedVersion` on the next write. */
  version: number;
  permittedInvitationTransitions: ParticipantInvitationStatus[];
  permittedAttendanceTransitions: ParticipantAttendanceStatus[];
  /**
   * Present only for a caller holding `participant:manage_restricted`, or
   * when `identityMode` is `named` (a registered named participant's link
   * to their own account is not restricted information). Absent — not
   * `null` — for every other caller, so its absence from the wire response
   * is visible in a network inspector, not just in application logic.
   */
  linkedUserId?: string | null;
  /** Present only for a caller holding `participant:manage_restricted`. */
  facilitatorNotes?: string | null;
}

export interface ConsentTemplateCategoryView {
  category: string;
  required: boolean;
}

export interface ConsentTemplateSummary {
  id: string;
  familyId: string;
  organisationId: string;
  workspaceId: string | null;
  name: string;
  version: number;
  status: ConsentTemplateStatus;
  updatedAt: string;
}

export interface ConsentTemplateDetail extends ConsentTemplateSummary {
  purpose: string;
  description: string | null;
  plainLanguageSummary: string;
  supportedLanguages: string[];
  categories: ConsentTemplateCategoryView[];
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  /** Optimistic-concurrency counter — send back as `expectedRevision` on the next lifecycle action. */
  revision: number;
  /** Server-computed, so a client never has to reimplement the lifecycle state machine. */
  permittedActions: ConsentTemplateAction['action'][];
}

export interface SessionConsentConfigurationView {
  id: string;
  organisationId: string;
  workspaceId: string;
  sessionId: string;
  consentTemplateId: string;
  templateVersion: number;
  requiredCategories: string[];
  optionalCategories: string[];
  facilitatorInstructions: string | null;
  participantIntroduction: string | null;
  effectiveDate: string;
  status: SessionConsentConfigurationStatus;
  createdAt: string;
  updatedAt: string;
  /** Optimistic-concurrency counter — send back as `expectedVersion` on reconfigure. */
  version: number;
}

export interface ConsentCategoryDecisionView {
  category: string;
  granted: boolean;
}

/**
 * Privacy-safe general view — no `categoryDecisions`, no `withdrawalReason`.
 * A caller without `participant_consent:manage_restricted` only ever
 * receives this shape; the detail extension below is structurally absent
 * from the response, not merely redacted, the same convention
 * `SessionParticipantSummary` established.
 */
export interface ParticipantConsentRecordSummary {
  id: string;
  sessionId: string;
  participantId: string;
  consentTemplateId: string;
  templateVersion: number;
  status: ParticipantConsentRecordStatus;
  capturedAt: string;
  updatedAt: string;
}

export interface ParticipantConsentRecordDetail extends ParticipantConsentRecordSummary {
  organisationId: string;
  workspaceId: string;
  captureMethod: string;
  language: string | null;
  expiresAt: string | null;
  amendsRecordId: string | null;
  supersededByRecordId: string | null;
  withdrawnAt: string | null;
  acknowledgementReference: string | null;
  /** Optimistic-concurrency counter — send back as `expectedVersion` on withdraw. */
  version: number;
  /**
   * The category-by-category grant/refusal breakdown — "detailed category
   * decisions require explicit permission" (BUILD_ROADMAP.md Milestone 4).
   * Present only for a caller holding `participant_consent:manage_restricted`;
   * omitted, not `null`, for every other caller, the same convention
   * `withdrawalReason` and `SessionParticipantDetail.facilitatorNotes` use.
   */
  categoryDecisions?: ConsentCategoryDecisionView[];
  /** Present only for a caller holding `participant_consent:manage_restricted`. */
  withdrawalReason?: string | null;
}

export interface ConsentDashboardParticipantView {
  participantId: string;
  displayName: string;
  status: ParticipantConsentStatusSummary;
  updatedAt: string | null;
}

/** The view backing the facilitator dashboard's per-session consent overview. */
export interface ConsentFacilitatorDashboardView {
  sessionId: string;
  configuration: SessionConsentConfigurationView | null;
  participants: ConsentDashboardParticipantView[];
}

/**
 * Privacy-safe general view. `sourceParticipantId` is present only when
 * `attributionMode` is `attributed` — for every other mode it is
 * structurally absent, not merely redacted, the same "absent means absent"
 * convention `SessionParticipantSummary`/`ParticipantConsentRecordSummary`
 * established. `withdrawalReason` and `consentBasis` are restricted; see
 * `EvidenceDetail` below.
 */
export interface EvidenceSummary {
  id: string;
  sessionId: string;
  evidenceType: string;
  title: string;
  attributionMode: EvidenceAttributionMode;
  identityVisibility: ParticipantIdentityVisibility;
  reviewStatus: EvidenceReviewStatus;
  verificationStatus: EvidenceVerificationStatus;
  tags: string[];
  capturedAt: string;
  updatedAt: string;
  withdrawn: boolean;
  /** Present only when `attributionMode` is `attributed`. */
  sourceParticipantId?: string;
}

export interface EvidenceDetail extends EvidenceSummary {
  organisationId: string;
  workspaceId: string;
  content: string;
  language: string | null;
  sessionOffsetSeconds: number | null;
  supersededByEvidenceId: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  /** Optimistic-concurrency counter — send back as `expectedVersion` on the next write. */
  version: number;
  /** Server-computed, so a client never has to reimplement the lifecycle state machine. */
  permittedActions: EvidenceTransitionRequest['action'][];
  /**
   * Server-computed review actions the evidence's own state allows.
   *
   * State-derived only: this does NOT encode whether the current caller
   * holds the active `ReviewAssignment`, so a non-assigned caller may see
   * an action here that the API then refuses. The server re-checks
   * ownership on every review write — see `EvidenceReviewService`.
   */
  permittedReviewActions: EvidenceReviewActionRequest['action'][];
  canEdit: boolean;
  canCorrect: boolean;
  /**
   * The consent categories checked and allowed at capture time. Present
   * only for a caller holding `evidence:manage_restricted`.
   */
  consentBasis?: string[];
  /** Present only for a caller holding `evidence:manage_restricted`. */
  withdrawalReason?: string | null;
  /** The reviewer's stated reason for the most recent validate/reject decision. */
  reviewDecisionReason: string | null;
  /** `null` when no file has been attached to this evidence yet. */
  attachment: EvidenceAttachmentView | null;
  /** `null` until a transcription has been requested for this evidence's attachment. */
  transcript: TranscriptView | null;
}

export const TRANSCRIPT_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

export interface TranscriptSegmentView {
  text: string;
  startMs: number | null;
  endMs: number | null;
}

/**
 * `generatedText` is what the local model produced and is never overwritten;
 * `editedText` is a human correction, kept separately. `effectiveText` (the
 * server-computed convenience the rest of the product should read) is
 * `editedText` when present, `generatedText` otherwise — see
 * `packages/domain/src/transcript.ts`'s `effectiveTranscriptText`.
 */
export interface TranscriptView {
  id: string;
  evidenceId: string;
  attachmentId: string;
  status: TranscriptStatus;
  generatedText: string | null;
  editedText: string | null;
  effectiveText: string | null;
  segments: TranscriptSegmentView[];
  model: string | null;
  language: string | null;
  confirmed: boolean;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export const SUMMARY_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number];

/**
 * An AI-drafted summary of one co-design session's confirmed content.
 * `sourceEvidenceIds` is the citation list — which evidence fed the
 * summary, for the "inspect provenance" requirement every generated-content
 * view in this product carries.
 */
export interface SessionSummaryView {
  id: string;
  sessionId: string;
  status: SummaryStatus;
  sourceEvidenceIds: string[];
  generatedText: string | null;
  editedText: string | null;
  effectiveText: string | null;
  model: string | null;
  confirmed: boolean;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export const editTranscriptRequestSchema = z.object({
  editedText: z.string().trim().min(1, 'A transcript must not be empty').max(200_000),
  expectedVersion: z.number().int().min(1),
});
export type EditTranscriptRequest = z.infer<typeof editTranscriptRequestSchema>;

export const transcriptVersionRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
});
export type TranscriptVersionRequest = z.infer<typeof transcriptVersionRequestSchema>;

export const editSummaryRequestSchema = z.object({
  editedText: z.string().trim().min(1, 'A summary must not be empty').max(50_000),
  expectedVersion: z.number().int().min(1),
});
export type EditSummaryRequest = z.infer<typeof editSummaryRequestSchema>;

export const EVIDENCE_ATTACHMENT_KINDS = ['audio'] as const;
export type EvidenceAttachmentKind = (typeof EVIDENCE_ATTACHMENT_KINDS)[number];

/**
 * The source file backing one piece of evidence — metadata only. The bytes
 * themselves are fetched separately, from
 * `GET .../evidence/:evidenceId/attachment/content`.
 */
export interface EvidenceAttachmentView {
  id: string;
  evidenceId: string;
  kind: EvidenceAttachmentKind;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
}

export interface EvidenceLinkView {
  id: string;
  sessionId: string;
  linkType: EvidenceLinkType;
  fromEvidenceId: string;
  toEvidenceId: string;
  note: string | null;
  createdAt: string;
  createdBy: ActorView;
}

/**
 * Who is reviewing a piece of evidence, and where that review stands.
 * Never carries a restricted participant identity — `reviewerUserId` is a
 * Witness user account (a facilitator/reviewer), not a session participant.
 */
export interface ReviewAssignmentView {
  id: string;
  evidenceId: string;
  reviewerUserId: string;
  assignedBy: ActorView;
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  status: ReviewAssignmentStatus;
  reassignedFromId: string | null;
  closeReason: string | null;
  version: number;
}

/**
 * A reviewer's question about a piece of evidence and its answer, if any.
 * `respondedBy` is present only once answered.
 */
export interface ClarificationView {
  id: string;
  evidenceId: string;
  reviewAssignmentId: string;
  question: string;
  requestedBy: ActorView;
  requestedAt: string;
  response: string | null;
  respondedBy: ActorView | null;
  respondedAt: string | null;
  status: ClarificationStatus;
  closeReason: string | null;
  version: number;
}

/**
 * What an outcome rests on. The evidence fields are frozen at link time —
 * `evidenceVersion` is the version that was validated, not the evidence's
 * current version, so a later correction cannot silently change what the
 * outcome was justified by.
 */
export interface OutcomeSupportView {
  id: string;
  outcomeType: OutcomeType;
  outcomeId: string;
  basis: OutcomeSupportBasis;
  /** Present only for `validated_evidence`. */
  evidenceId: string | null;
  evidenceVersion: number | null;
  evidenceVerificationStatus: EvidenceVerificationStatus | null;
  /** The evidence's title at read time, for display; absent if unreadable. */
  evidenceTitle?: string;
  /** Required for `institutional_synthesis`. */
  rationale: string | null;
  note: string | null;
  recordedBy: ActorView;
  recordedAt: string;
}

export interface DecisionSummary {
  id: string;
  sessionId: string;
  title: string;
  status: DecisionStatus;
  proposedAt: string;
  confirmedAt: string | null;
  supportCount: number;
  updatedAt: string;
}

export interface DecisionDetail extends DecisionSummary {
  organisationId: string;
  workspaceId: string;
  statement: string;
  proposedBy: ActorView;
  confirmedBy: ActorView | null;
  supersededByDecisionId: string | null;
  supersededAt: string | null;
  reversedAt: string | null;
  closeReason: string | null;
  createdAt: string;
  /** Optimistic-concurrency counter — send back as `expectedVersion` on the next write. */
  version: number;
  /**
   * Server-computed, so a client never reimplements the lifecycle state
   * machine. State-derived only: it does not encode whether the caller holds
   * the authorisation the API will then require.
   */
  permittedActions: DecisionTransitionRequest['action'][];
  canEdit: boolean;
  supports: OutcomeSupportView[];
}

/**
 * `ownerDescription` is plain language and always present; `ownerUserId` is
 * a Witness user account and often absent. Neither is ever a session
 * participant — see `packages/domain/src/commitment.ts`.
 */
export interface CommitmentSummary {
  id: string;
  sessionId: string;
  title: string;
  status: CommitmentStatus;
  ownerDescription: string;
  ownerUserId: string | null;
  dueDate: string | null;
  overdue: boolean;
  supportCount: number;
  updatedAt: string;
}

export interface CommitmentDetail extends CommitmentSummary {
  organisationId: string;
  workspaceId: string;
  description: string;
  proposedBy: ActorView;
  proposedAt: string;
  activatedBy: ActorView | null;
  activatedAt: string | null;
  fulfilledAt: string | null;
  fulfilmentNote: string | null;
  supersededByCommitmentId: string | null;
  closedAt: string | null;
  closeReason: string | null;
  createdAt: string;
  version: number;
  permittedActions: CommitmentTransitionRequest['action'][];
  canEdit: boolean;
  supports: OutcomeSupportView[];
}

export interface ActionItemSummary {
  id: string;
  sessionId: string;
  title: string;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  ownerDescription: string;
  ownerUserId: string | null;
  dueDate: string | null;
  overdue: boolean;
  percentComplete: number;
  supportCount: number;
  updatedAt: string;
}

export interface ActionItemDetail extends ActionItemSummary {
  organisationId: string;
  workspaceId: string;
  description: string;
  progressNote: string | null;
  blockedReason: string | null;
  createdBy: ActorView;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  createdAt: string;
  version: number;
  permittedActions: ActionItemTransitionRequest['action'][];
  canEdit: boolean;
  supports: OutcomeSupportView[];
}

export interface ReportSummary {
  id: string;
  sessionId: string;
  title: string;
  audience: ReportAudience;
  status: ReportStatus;
  revision: number;
  supersedesReportId: string | null;
  sourceCount: number;
  approvedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

/**
 * A record the report draws on, as cited.
 *
 * `sourceVersion` is the version frozen at inclusion, not the record's
 * current one. `drifted` says the record has moved since — not an error, but
 * something a reader is entitled to be told rather than have silently
 * papered over.
 */
export interface ReportSourceView {
  id: string;
  sourceType: ReportSourceType;
  sourceId: string;
  sourceVersion: number;
  sourceStatus: string;
  /** The record's title at read time, for display; absent if unreadable. */
  sourceTitle?: string;
  drifted: boolean;
  includedBy: ActorView;
  includedAt: string;
}

export interface ReportDetail extends ReportSummary {
  organisationId: string;
  workspaceId: string;
  purpose: string | null;
  facilitatorSynthesis: string | null;
  unresolvedQuestions: string | null;
  recommendations: string | null;
  createdBy: ActorView;
  submittedBy: ActorView | null;
  submittedAt: string | null;
  approvedBy: ActorView | null;
  changesRequestedReason: string | null;
  firstExportedAt: string | null;
  createdAt: string;
  /** Optimistic-concurrency counter — send back as `expectedVersion` on the next write. */
  version: number;
  /** Server-computed, so a client never reimplements the lifecycle state machine. */
  permittedActions: ReportTransitionRequest['action'][];
  canEdit: boolean;
  canExport: boolean;
  sources: ReportSourceView[];
}

/**
 * Evidence as it appears in a rendered report, after server-side redaction.
 *
 * `content` is *structurally absent* when the participant did not agree to
 * quotation — not an empty string, so a template cannot render a redaction as
 * though it were silence. `attribution` is a label, never an identity: there
 * is no field here that could carry a real name for a participant who did not
 * agree to be named.
 */
export interface RenderedEvidence {
  id: string;
  title: string;
  evidenceType: string;
  attribution: ReportAttributionLabel;
  quotable: boolean;
  content?: string;
  pseudonym?: string;
}

/** Who took part, by count. A report never lists participants — see the API. */
export interface RenderedParticipantSummary {
  total: number;
  named: number;
  pseudonymous: number;
  anonymous: number;
  withdrawn: number;
  attendedInPerson: number;
  attendedOnline: number;
}

export interface RenderedOutcome {
  id: string;
  title: string;
  status: string;
  detail: string;
  /** Plain-language owner, for commitments and actions. Never a participant. */
  owner?: string;
  dueDate?: string;
}

/**
 * A report composed for reading or export. Everything here has already passed
 * through server-side redaction; the client renders it, it does not filter it.
 */
export interface RenderedReport {
  report: ReportDetail;
  session: {
    title: string;
    sessionType: string;
    purpose: string | null;
    scheduledStart: string | null;
    location: string | null;
  };
  participants: RenderedParticipantSummary;
  evidence: RenderedEvidence[];
  decisions: RenderedOutcome[];
  commitments: RenderedOutcome[];
  actions: RenderedOutcome[];
  /**
   * Records the report cites that were excluded from this rendering by
   * consent. Counted, never described — the count tells a reader the report
   * is not the whole picture, while naming them would leak what was withheld.
   */
  redactedCount: number;
  generatedAt: string;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export type ComponentStatus = 'ok' | 'degraded' | 'down' | 'not_configured';

export interface HealthComponent {
  status: ComponentStatus;
  detail: string;
  /** Round-trip time in milliseconds, when the check performs I/O. */
  latencyMs?: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  buildId: string;
  instanceName: string;
  profile: string;
  dataResidency: string;
  externalInferenceEnabled: boolean;
  uptimeSeconds: number;
  components: Record<string, HealthComponent>;
  /**
   * Capabilities this build does NOT have. Named explicitly so a user of the
   * Developer Preview is never left guessing whether a missing feature is broken
   * or simply not built yet.
   */
  notImplemented: string[];
}

// ─── Search (Phase 6) ──────────────────────────────────────────────────────────

export const SEARCH_RESULT_TYPES = [
  'session',
  'evidence',
  'transcript',
  'summary',
  'decision',
  'commitment',
  'action_item',
] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

/**
 * One matched thing, from a plain scoped-text search across a workspace —
 * "have we discussed this before?", not a knowledge graph or a vector
 * index. Always traceable: `sessionId` and (where the match has one)
 * `evidenceId` are the same ids the rest of the product already uses to
 * link to the source, and `aiGenerated`/`confirmed` say plainly whether a
 * result is someone's own words or a model's, and whether a human has
 * signed off on it yet.
 */
export interface SearchResultView {
  type: SearchResultType;
  sessionId: string;
  sessionTitle: string;
  /** The matched row's own id, for types with a dedicated detail view (evidence, decision, commitment, action_item). */
  entityId: string | null;
  /** The evidence a transcript match belongs to — absent for every other type. */
  evidenceId: string | null;
  title: string;
  snippet: string;
  /** The matched row's own lifecycle status (draft/submitted/proposed/open/…), for display, not for a state machine. */
  status: string | null;
  aiGenerated: boolean;
  /** Only meaningful for AI-generated content (transcript, summary) — `null` for everything else. */
  confirmed: boolean | null;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level detail for validation failures. */
    fields?: Record<string, string[]>;
  };
}
