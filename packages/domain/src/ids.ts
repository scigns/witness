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
export type IdentityLinkId = Branded<string, 'IdentityLinkId'>;
export type CoDesignSessionId = Branded<string, 'CoDesignSessionId'>;
export type SessionParticipantId = Branded<string, 'SessionParticipantId'>;
export type ConsentTemplateId = Branded<string, 'ConsentTemplateId'>;
export type SessionConsentConfigurationId = Branded<string, 'SessionConsentConfigurationId'>;
export type ParticipantConsentRecordId = Branded<string, 'ParticipantConsentRecordId'>;
export type EvidenceId = Branded<string, 'EvidenceId'>;
export type EvidenceLinkId = Branded<string, 'EvidenceLinkId'>;
export type ReviewAssignmentId = Branded<string, 'ReviewAssignmentId'>;
export type ClarificationId = Branded<string, 'ClarificationId'>;

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

export function toIdentityLinkId(value: string): IdentityLinkId {
  assertUuid(value, 'IdentityLinkId');
  return value as IdentityLinkId;
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
