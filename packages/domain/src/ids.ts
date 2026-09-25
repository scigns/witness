/**
 * Identifiers.
 *
 * Branded string types rather than raw `string`, so that passing a RecordId where
 * an ActorId is expected is a compile error rather than a runtime mystery. This
 * costs a cast at the boundary and catches a whole class of defect that is
 * otherwise only found in production.
 *
 * Identifier *generation* is not here. The domain layer must not read the clock
 * or a random source (ADR-0003) — both are injected as ports, so that a test can
 * make time and identity deterministic.
 */

import { InvariantViolation } from './errors.js';

declare const brand: unique symbol;

type Branded<T, B> = T & { readonly [brand]: B };

export type RecordId = Branded<string, 'RecordId'>;
export type ActorId = Branded<string, 'ActorId'>;
export type SourceId = Branded<string, 'SourceId'>;
export type AuditEventId = Branded<string, 'AuditEventId'>;
export type OrganisationId = Branded<string, 'OrganisationId'>;
export type WorkspaceId = Branded<string, 'WorkspaceId'>;
export type UserId = Branded<string, 'UserId'>;
export type OrganisationMembershipId = Branded<string, 'OrganisationMembershipId'>;
export type WorkspaceMembershipId = Branded<string, 'WorkspaceMembershipId'>;
export type RoleAssignmentId = Branded<string, 'RoleAssignmentId'>;
/** ADR-0028 — external-collaborator workspace invitation. */
export type WorkspaceInvitationId = Branded<string, 'WorkspaceInvitationId'>;
export type IdentityLinkId = Branded<string, 'IdentityLinkId'>;
export type CoDesignSessionId = Branded<string, 'CoDesignSessionId'>;
export type SessionParticipantId = Branded<string, 'SessionParticipantId'>;
/** Phase 5, Workstream 1.6 — governed QR/link session joining. */
export type SessionJoinLinkId = Branded<string, 'SessionJoinLinkId'>;
export type SessionJoinAttemptId = Branded<string, 'SessionJoinAttemptId'>;
export type ConsentTemplateId = Branded<string, 'ConsentTemplateId'>;
export type SessionConsentConfigurationId = Branded<string, 'SessionConsentConfigurationId'>;
export type ParticipantConsentRecordId = Branded<string, 'ParticipantConsentRecordId'>;
export type EvidenceId = Branded<string, 'EvidenceId'>;
export type EvidenceLinkId = Branded<string, 'EvidenceLinkId'>;
export type EvidenceAttachmentId = Branded<string, 'EvidenceAttachmentId'>;
export type TranscriptId = Branded<string, 'TranscriptId'>;
export type SessionSummaryId = Branded<string, 'SessionSummaryId'>;
export type ReviewAssignmentId = Branded<string, 'ReviewAssignmentId'>;
export type ClarificationId = Branded<string, 'ClarificationId'>;
export type DecisionId = Branded<string, 'DecisionId'>;
export type CommitmentId = Branded<string, 'CommitmentId'>;
export type ActionItemId = Branded<string, 'ActionItemId'>;
export type OutcomeSupportId = Branded<string, 'OutcomeSupportId'>;
export type ReportId = Branded<string, 'ReportId'>;
export type ReportSourceId = Branded<string, 'ReportSourceId'>;
export type AgendaItemId = Branded<string, 'AgendaItemId'>;
export type ResourceId = Branded<string, 'ResourceId'>;
export type InvoiceId = Branded<string, 'InvoiceId'>;
export type InvoiceLineItemId = Branded<string, 'InvoiceLineItemId'>;
export type PaymentId = Branded<string, 'PaymentId'>;
export type PaymentMethodId = Branded<string, 'PaymentMethodId'>;
export type PurchaseOrderId = Branded<string, 'PurchaseOrderId'>;
/** Phase 5, Workstream 2.1 — a distinct, customer-facing settlement confirmation. */
export type ReceiptId = Branded<string, 'ReceiptId'>;
/** Phase 5, Workstream 2.4 — the commercial term an organisation's paid access is authorised under. */
export type AgreementId = Branded<string, 'AgreementId'>;

// Product feedback micro-surveys and governed testimonial publication (Phase 6, Track B).
export type ProductFeedbackId = Branded<string, 'ProductFeedbackId'>;
export type CustomerStoryId = Branded<string, 'CustomerStoryId'>;

// Evidence knowledge graph (ADR-0011, ADR-0012, ADR-0026).
export type KnowledgeDomainId = Branded<string, 'KnowledgeDomainId'>;
export type KnowledgeEntityId = Branded<string, 'KnowledgeEntityId'>;
export type EntityAliasId = Branded<string, 'EntityAliasId'>;
export type EntityMergeLogId = Branded<string, 'EntityMergeLogId'>;
export type RelationshipTypeCode = Branded<string, 'RelationshipTypeCode'>;
export type KnowledgeRelationshipId = Branded<string, 'KnowledgeRelationshipId'>;
export type KnowledgeEntityAttributeId = Branded<string, 'KnowledgeEntityAttributeId'>;
export type CandidateAssertionId = Branded<string, 'CandidateAssertionId'>;
export type KnowledgeReviewDecisionId = Branded<string, 'KnowledgeReviewDecisionId'>;
export type KnowledgeProvenanceChainId = Branded<string, 'KnowledgeProvenanceChainId'>;
export type KnowledgeAssertionId = Branded<string, 'KnowledgeAssertionId'>;

/**
 * UUID v4/v7 shape. We accept both: v7 is time-ordered, which matters for the
 * append-only audit log, while existing v4 identifiers must keep validating.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, kind: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new InvariantViolation(`${kind} must be a UUID, received '${value}'.`, 'INVALID_ID');
  }
}

export function toRecordId(value: string): RecordId {
  assertUuid(value, 'RecordId');
  return value as RecordId;
}

export function toActorId(value: string): ActorId {
  assertUuid(value, 'ActorId');
  return value as ActorId;
}

export function toSourceId(value: string): SourceId {
  assertUuid(value, 'SourceId');
  return value as SourceId;
}

export function toAuditEventId(value: string): AuditEventId {
  assertUuid(value, 'AuditEventId');
  return value as AuditEventId;
}

export function toOrganisationId(value: string): OrganisationId {
  assertUuid(value, 'OrganisationId');
  return value as OrganisationId;
}

export function toWorkspaceId(value: string): WorkspaceId {
  assertUuid(value, 'WorkspaceId');
  return value as WorkspaceId;
}

export function toUserId(value: string): UserId {
  assertUuid(value, 'UserId');
  return value as UserId;
}

export function toOrganisationMembershipId(value: string): OrganisationMembershipId {
  assertUuid(value, 'OrganisationMembershipId');
  return value as OrganisationMembershipId;
}

export function toWorkspaceMembershipId(value: string): WorkspaceMembershipId {
  assertUuid(value, 'WorkspaceMembershipId');
  return value as WorkspaceMembershipId;
}

export function toRoleAssignmentId(value: string): RoleAssignmentId {
  assertUuid(value, 'RoleAssignmentId');
  return value as RoleAssignmentId;
}

export function toWorkspaceInvitationId(value: string): WorkspaceInvitationId {
  assertUuid(value, 'WorkspaceInvitationId');
  return value as WorkspaceInvitationId;
}

export function toIdentityLinkId(value: string): IdentityLinkId {
  assertUuid(value, 'IdentityLinkId');
  return value as IdentityLinkId;
}

export function toSessionJoinLinkId(value: string): SessionJoinLinkId {
  assertUuid(value, 'SessionJoinLinkId');
  return value as SessionJoinLinkId;
}

export function toSessionJoinAttemptId(value: string): SessionJoinAttemptId {
  assertUuid(value, 'SessionJoinAttemptId');
  return value as SessionJoinAttemptId;
}

export function toCoDesignSessionId(value: string): CoDesignSessionId {
  assertUuid(value, 'CoDesignSessionId');
  return value as CoDesignSessionId;
}

export function toSessionParticipantId(value: string): SessionParticipantId {
  assertUuid(value, 'SessionParticipantId');
  return value as SessionParticipantId;
}

export function toConsentTemplateId(value: string): ConsentTemplateId {
  assertUuid(value, 'ConsentTemplateId');
  return value as ConsentTemplateId;
}

export function toSessionConsentConfigurationId(value: string): SessionConsentConfigurationId {
  assertUuid(value, 'SessionConsentConfigurationId');
  return value as SessionConsentConfigurationId;
}

export function toParticipantConsentRecordId(value: string): ParticipantConsentRecordId {
  assertUuid(value, 'ParticipantConsentRecordId');
  return value as ParticipantConsentRecordId;
}

export function toEvidenceId(value: string): EvidenceId {
  assertUuid(value, 'EvidenceId');
  return value as EvidenceId;
}

export function toEvidenceAttachmentId(value: string): EvidenceAttachmentId {
  assertUuid(value, 'EvidenceAttachmentId');
  return value as EvidenceAttachmentId;
}

export function toTranscriptId(value: string): TranscriptId {
  assertUuid(value, 'TranscriptId');
  return value as TranscriptId;
}

export function toSessionSummaryId(value: string): SessionSummaryId {
  assertUuid(value, 'SessionSummaryId');
  return value as SessionSummaryId;
}

export function toEvidenceLinkId(value: string): EvidenceLinkId {
  assertUuid(value, 'EvidenceLinkId');
  return value as EvidenceLinkId;
}

export function toReviewAssignmentId(value: string): ReviewAssignmentId {
  assertUuid(value, 'ReviewAssignmentId');
  return value as ReviewAssignmentId;
}

export function toClarificationId(value: string): ClarificationId {
  assertUuid(value, 'ClarificationId');
  return value as ClarificationId;
}

export function toDecisionId(value: string): DecisionId {
  assertUuid(value, 'DecisionId');
  return value as DecisionId;
}

export function toCommitmentId(value: string): CommitmentId {
  assertUuid(value, 'CommitmentId');
  return value as CommitmentId;
}

export function toActionItemId(value: string): ActionItemId {
  assertUuid(value, 'ActionItemId');
  return value as ActionItemId;
}

export function toOutcomeSupportId(value: string): OutcomeSupportId {
  assertUuid(value, 'OutcomeSupportId');
  return value as OutcomeSupportId;
}

export function toReportId(value: string): ReportId {
  assertUuid(value, 'ReportId');
  return value as ReportId;
}

export function toReportSourceId(value: string): ReportSourceId {
  assertUuid(value, 'ReportSourceId');
  return value as ReportSourceId;
}

export function toAgendaItemId(value: string): AgendaItemId {
  assertUuid(value, 'AgendaItemId');
  return value as AgendaItemId;
}

export function toResourceId(value: string): ResourceId {
  assertUuid(value, 'ResourceId');
  return value as ResourceId;
}

export function toInvoiceId(value: string): InvoiceId {
  assertUuid(value, 'InvoiceId');
  return value as InvoiceId;
}

export function toInvoiceLineItemId(value: string): InvoiceLineItemId {
  assertUuid(value, 'InvoiceLineItemId');
  return value as InvoiceLineItemId;
}

export function toPaymentId(value: string): PaymentId {
  assertUuid(value, 'PaymentId');
  return value as PaymentId;
}

export function toReceiptId(value: string): ReceiptId {
  assertUuid(value, 'ReceiptId');
  return value as ReceiptId;
}

export function toPaymentMethodId(value: string): PaymentMethodId {
  assertUuid(value, 'PaymentMethodId');
  return value as PaymentMethodId;
}

export function toPurchaseOrderId(value: string): PurchaseOrderId {
  assertUuid(value, 'PurchaseOrderId');
  return value as PurchaseOrderId;
}

export function toAgreementId(value: string): AgreementId {
  assertUuid(value, 'AgreementId');
  return value as AgreementId;
}

export function toProductFeedbackId(value: string): ProductFeedbackId {
  assertUuid(value, 'ProductFeedbackId');
  return value as ProductFeedbackId;
}

export function toCustomerStoryId(value: string): CustomerStoryId {
  assertUuid(value, 'CustomerStoryId');
  return value as CustomerStoryId;
}

export function toKnowledgeDomainId(value: string): KnowledgeDomainId {
  assertUuid(value, 'KnowledgeDomainId');
  return value as KnowledgeDomainId;
}

export function toKnowledgeEntityId(value: string): KnowledgeEntityId {
  assertUuid(value, 'KnowledgeEntityId');
  return value as KnowledgeEntityId;
}

export function toEntityAliasId(value: string): EntityAliasId {
  assertUuid(value, 'EntityAliasId');
  return value as EntityAliasId;
}

export function toEntityMergeLogId(value: string): EntityMergeLogId {
  assertUuid(value, 'EntityMergeLogId');
  return value as EntityMergeLogId;
}

const RELATIONSHIP_TYPE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

/**
 * Not a UUID — a stable vocabulary code (`SUPPORTS`, `x_acme_CUSTOM_LINK`).
 * Format only; whether the code is a *registered* type is a database lookup
 * against `RelationshipTypeDefinition`, which the domain layer does not
 * perform (ADR-0003) — see `relationship-vocabulary.ts`.
 */
export function toRelationshipTypeCode(value: string): RelationshipTypeCode {
  if (!RELATIONSHIP_TYPE_CODE_PATTERN.test(value)) {
    throw new InvariantViolation(
      `'${value}' is not a well-formed relationship type code (expected upper-snake-case, optionally namespaced).`,
      'INVALID_RELATIONSHIP_TYPE_CODE',
    );
  }
  return value as RelationshipTypeCode;
}

export function toKnowledgeRelationshipId(value: string): KnowledgeRelationshipId {
  assertUuid(value, 'KnowledgeRelationshipId');
  return value as KnowledgeRelationshipId;
}

export function toKnowledgeEntityAttributeId(value: string): KnowledgeEntityAttributeId {
  assertUuid(value, 'KnowledgeEntityAttributeId');
  return value as KnowledgeEntityAttributeId;
}

export function toCandidateAssertionId(value: string): CandidateAssertionId {
  assertUuid(value, 'CandidateAssertionId');
  return value as CandidateAssertionId;
}

export function toKnowledgeReviewDecisionId(value: string): KnowledgeReviewDecisionId {
  assertUuid(value, 'KnowledgeReviewDecisionId');
  return value as KnowledgeReviewDecisionId;
}

export function toKnowledgeProvenanceChainId(value: string): KnowledgeProvenanceChainId {
  assertUuid(value, 'KnowledgeProvenanceChainId');
  return value as KnowledgeProvenanceChainId;
}

export function toKnowledgeAssertionId(value: string): KnowledgeAssertionId {
  assertUuid(value, 'KnowledgeAssertionId');
  return value as KnowledgeAssertionId;
}
