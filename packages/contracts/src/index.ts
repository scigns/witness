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

// ─── Errors ──────────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level detail for validation failures. */
    fields?: Record<string, string[]>;
  };
}
