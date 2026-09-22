/**
 * WorkspaceInvitation — how an external collaborator (a facilitator, reviewer
 * or Knowledge Steward from another organisation, or someone with no
 * organisation at all) is granted workspace-scoped authority without ever
 * becoming a member of the commissioning organisation (ADR-0028).
 *
 * Named to match the existing `WorkspaceMembership`/`RoleAssignment`
 * convention, not `ProgrammeInvitation` — "Workspace" stays the internal
 * domain name throughout; "programme" and "co-design" are UI-facing language
 * applied at the presentation layer only (ADR-0028).
 *
 * Deliberately more conservative than the existing organisation-invitation
 * flow (`OrganisationInvitationsService.invite`, ADR-0025), which provisions
 * membership and role at send time. Nothing about an external collaborator's
 * standing in someone else's workspace exists until they have seen full
 * context (who invited them, which organisation, which programme, what role)
 * and explicitly accepted — see `acceptWorkspaceInvitation`.
 *
 * The token itself never lives in the domain layer: the application layer
 * generates a random token and hashes it (ADR-0003 — the domain must not
 * import `node:crypto`), and only the hash is ever passed in or persisted.
 * Acceptance reads `workspaceId` and `role` *only* from the invitation row
 * this module manages, never from caller-supplied input at accept time —
 * this is what makes "a token minted for Workspace A cannot reach Workspace
 * B" and "the requested role cannot be tampered with" true by construction.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { WitnessRole } from './role.js';
import { isWitnessRole } from './role.js';
import type { OrganisationId, UserId, WorkspaceId, WorkspaceInvitationId } from './ids.js';

const INVITED_NAME_MAX = 200;
const MESSAGE_MAX = 2000;
const AFFILIATION_LABEL_MAX = 300;
const DELIVERY_ERROR_MAX = 500;

/** Mirrors the shape of `EmailAddress`-style validation used elsewhere; kept local and minimal. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const WORKSPACE_INVITATION_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'expired',
  'revoked',
] as const;
export type WorkspaceInvitationStatus = (typeof WORKSPACE_INVITATION_STATUSES)[number];

/**
 * Contextual identity metadata only — never authority, and never resolved
 * against or used to create a real `Organisation` tenant (ADR-0028, PART 4:
 * "I am participating from the Fiji Teachers Association" stays a label; it
 * never becomes authority over an FTA tenant, because no such tenant is ever
 * created or looked up from it). `organisation` here is deliberately a
 * free-text label, not a foreign key — the same reasoning as
 * `SessionParticipant.affiliation`.
 */
export const AFFILIATION_TYPES = [
  'organisation',
  'independent',
  'community',
  'undisclosed',
] as const;
export type AffiliationType = (typeof AFFILIATION_TYPES)[number];

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

/**
 * Transitions. `pending` is the only non-terminal state that can be *entered*
 * from elsewhere (`expired -> pending` on resend, mirroring
 * `SessionParticipant`'s own precedent that `declined`/`cancelled` can be
 * re-invited, unlike `MembershipState`'s terminal `revoked`). `accepted`,
 * `declined` and `revoked` are terminal — a declined or revoked invitation is
 * never silently reopened; a facilitator who wants to try again creates a
 * new invitation.
 */
const TRANSITIONS: Readonly<
  Record<WorkspaceInvitationStatus, readonly WorkspaceInvitationStatus[]>
> = Object.freeze({
  pending: ['accepted', 'declined', 'revoked', 'expired'],
  expired: ['pending'],
  accepted: [],
  declined: [],
  revoked: [],
});

export function canTransitionWorkspaceInvitation(
  from: WorkspaceInvitationStatus,
  to: WorkspaceInvitationStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface WorkspaceInvitation {
  readonly id: WorkspaceInvitationId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly invitedEmail: string;
  readonly invitedName: string | null;
  readonly inviterId: UserId;
  readonly role: WitnessRole;
  readonly affiliationType: AffiliationType;
  readonly affiliationLabel: string | null;
  readonly message: string | null;
  readonly status: WorkspaceInvitationStatus;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly acceptedByUserId: UserId | null;
  readonly declinedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly resendCount: number;
  readonly deliveryStatus: DeliveryStatus;
  readonly deliveryAttempts: number;
  readonly lastDeliveryError: string | null;
  readonly updatedAt: Date;
}

export interface WorkspaceInvitationOutcome {
  readonly invitation: WorkspaceInvitation;
  readonly event: PendingAuditEvent;
}

function assertEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new InvariantViolation(`'${email}' is not a well-formed email address.`, 'INVALID_EMAIL');
  }
  return trimmed;
}

function assertOptional(
  value: string | null | undefined,
  max: number,
  code: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `Field exceeds the maximum of ${max} characters, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

function assertRole(role: string): asserts role is WitnessRole {
  if (!isWitnessRole(role)) {
    throw new InvariantViolation(`'${role}' is not a recognised Witness role.`, 'INVALID_ROLE');
  }
}

function assertAffiliationType(value: string): asserts value is AffiliationType {
  if (!(AFFILIATION_TYPES as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised affiliation type. Choose one of: ${AFFILIATION_TYPES.join(', ')}.`,
      'INVALID_AFFILIATION_TYPE',
    );
  }
}

function assertFutureExpiry(expiresAt: Date, at: Date): void {
  if (expiresAt.getTime() <= at.getTime()) {
    throw new InvariantViolation(
      'An invitation must expire in the future.',
      'EXPIRY_MUST_BE_FUTURE',
    );
  }
}

export interface CreateWorkspaceInvitationInput {
  id: WorkspaceInvitationId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  invitedEmail: string;
  invitedName?: string | null | undefined;
  inviterId: UserId;
  role: string;
  affiliationType: string;
  affiliationLabel?: string | null | undefined;
  message?: string | null | undefined;
  /** Computed by the application layer (SHA-256 of a random token); never the raw token itself. */
  tokenHash: string;
  expiresAt: Date;
  invitedBy: Actor;
  at: Date;
}

/**
 * Create a workspace invitation for an external collaborator.
 *
 * Least privilege (Constitution, Authority and Access): the application
 * layer is expected to gate this behind a `role_assignment:manage`-equivalent
 * workspace-scoped check before calling in — the same convention every other
 * domain function in this module family relies on (ADR-0003).
 */
export function createWorkspaceInvitation(
  input: CreateWorkspaceInvitationInput,
): WorkspaceInvitationOutcome {
  assertRole(input.role);
  assertAffiliationType(input.affiliationType);
  assertFutureExpiry(input.expiresAt, input.at);

  if (input.tokenHash.trim().length === 0) {
    throw new InvariantViolation('An invitation requires a token hash.', 'TOKEN_HASH_REQUIRED');
  }

  const invitation: WorkspaceInvitation = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    invitedEmail: assertEmail(input.invitedEmail),
    invitedName: assertOptional(input.invitedName, INVITED_NAME_MAX, 'INVITED_NAME'),
    inviterId: input.inviterId,
    role: input.role,
    affiliationType: input.affiliationType,
    affiliationLabel: assertOptional(
      input.affiliationLabel,
      AFFILIATION_LABEL_MAX,
      'AFFILIATION_LABEL',
    ),
    message: assertOptional(input.message, MESSAGE_MAX, 'MESSAGE'),
    status: 'pending',
    tokenHash: input.tokenHash,
    createdAt: input.at,
    expiresAt: input.expiresAt,
    acceptedAt: null,
    acceptedByUserId: null,
    declinedAt: null,
    revokedAt: null,
    resendCount: 0,
    deliveryStatus: 'pending',
    deliveryAttempts: 0,
    lastDeliveryError: null,
    updatedAt: input.at,
  };

  return {
    invitation,
    event: {
      action: 'workspace_invitation.created',
      actor: input.invitedBy,
      metadata: {
        workspaceId: invitation.workspaceId,
        invitedEmail: invitation.invitedEmail,
        role: invitation.role,
        affiliationType: invitation.affiliationType,
      },
    },
  };
}

/**
 * Resend — rotates the token and extends the deadline on the *same*
 * invitation row rather than creating a new one, so there is never a second
 * active authority path for the same pending invite (an explicit requirement
 * of this feature: "a resend should not accidentally create a second active
 * membership/authority path"). Permitted from `pending` (still open — the old
 * token is invalidated by the rotation, since acceptance looks the row up by
 * `tokenHash`) or `expired` (reopens it).
 */
export function resendWorkspaceInvitation(
  invitation: WorkspaceInvitation,
  newTokenHash: string,
  newExpiresAt: Date,
  actor: Actor,
  at: Date,
): WorkspaceInvitationOutcome {
  if (invitation.status !== 'pending' && invitation.status !== 'expired') {
    throw new InvariantViolation(
      `Cannot resend an invitation in status '${invitation.status}' — only 'pending' or 'expired'.`,
      'CANNOT_RESEND',
    );
  }
  assertFutureExpiry(newExpiresAt, at);
  if (newTokenHash.trim().length === 0) {
    throw new InvariantViolation('A resend requires a new token hash.', 'TOKEN_HASH_REQUIRED');
  }

  const next: WorkspaceInvitation = {
    ...invitation,
    status: 'pending',
    tokenHash: newTokenHash,
    expiresAt: newExpiresAt,
    resendCount: invitation.resendCount + 1,
    updatedAt: at,
  };

  return {
    invitation: next,
    event: {
      action: 'workspace_invitation.resent',
      actor,
      metadata: { workspaceId: invitation.workspaceId, resendCount: String(next.resendCount) },
    },
  };
}

/**
 * Accept — the only function in this module that produces a workspace
 * authority grant (via the caller then invoking
 * `addExternalWorkspaceCollaborator`/`assignExternalWorkspaceRole` in
 * `workspace-membership.ts`/`role-assignment.ts` with this invitation's own
 * `workspaceId`/`role`, never anything the client supplied at accept time).
 *
 * `emailMatches` is computed by the application layer from the signed-in
 * principal's Keycloak-verified email versus `invitation.invitedEmail`
 * (ADR-0028 — "email possession is not sufficient for authorisation," the
 * same principle ADR-0025 already established for organisation invitations,
 * applied here at a second layer alongside the token). Passed in rather than
 * computed here because the domain layer has no access to the authenticated
 * session (ADR-0003).
 */
export function acceptWorkspaceInvitation(
  invitation: WorkspaceInvitation,
  acceptedByUserId: UserId,
  emailMatches: boolean,
  actor: Actor,
  at: Date,
): WorkspaceInvitationOutcome {
  if (invitation.status !== 'pending') {
    throw new InvariantViolation(
      `Cannot accept an invitation in status '${invitation.status}'.`,
      'INVITATION_NOT_PENDING',
    );
  }
  if (at.getTime() >= invitation.expiresAt.getTime()) {
    throw new InvariantViolation('This invitation has expired.', 'INVITATION_EXPIRED');
  }
  if (!emailMatches) {
    throw new InvariantViolation(
      'The signed-in account does not match the email this invitation was sent to.',
      'EMAIL_MISMATCH',
    );
  }

  const next: WorkspaceInvitation = {
    ...invitation,
    status: 'accepted',
    acceptedAt: at,
    acceptedByUserId,
    updatedAt: at,
  };

  return {
    invitation: next,
    event: {
      action: 'workspace_invitation.accepted',
      actor,
      metadata: { workspaceId: invitation.workspaceId, role: invitation.role },
    },
  };
}

export function declineWorkspaceInvitation(
  invitation: WorkspaceInvitation,
  actor: Actor,
  at: Date,
): WorkspaceInvitationOutcome {
  if (invitation.status !== 'pending') {
    throw new InvariantViolation(
      `Cannot decline an invitation in status '${invitation.status}'.`,
      'INVITATION_NOT_PENDING',
    );
  }

  const next: WorkspaceInvitation = {
    ...invitation,
    status: 'declined',
    declinedAt: at,
    updatedAt: at,
  };

  return {
    invitation: next,
    event: {
      action: 'workspace_invitation.declined',
      actor,
      metadata: { workspaceId: invitation.workspaceId },
    },
  };
}

/** Revoke a still-pending invitation. Does not touch any resulting membership — see this file's header. */
export function revokeWorkspaceInvitation(
  invitation: WorkspaceInvitation,
  actor: Actor,
  at: Date,
): WorkspaceInvitationOutcome {
  if (invitation.status !== 'pending') {
    throw new InvariantViolation(
      `Cannot revoke an invitation in status '${invitation.status}'.`,
      'INVITATION_NOT_PENDING',
    );
  }

  const next: WorkspaceInvitation = {
    ...invitation,
    status: 'revoked',
    revokedAt: at,
    updatedAt: at,
  };

  return {
    invitation: next,
    event: {
      action: 'workspace_invitation.revoked',
      actor,
      metadata: { workspaceId: invitation.workspaceId },
    },
  };
}

/**
 * Lazily mark a pending invitation expired. Not required for the security
 * guarantee (`acceptWorkspaceInvitation` independently rejects an
 * expired-but-still-`pending` row) — this exists so a read path can show an
 * accurate status without a background job (PART 25 explicitly excludes
 * building new production infrastructure this phase). `actor` is a system
 * actor supplied by the caller (ADR-0003) — this transition is never
 * performed by a human.
 */
export function markWorkspaceInvitationExpired(
  invitation: WorkspaceInvitation,
  actor: Actor,
  at: Date,
): WorkspaceInvitationOutcome {
  if (invitation.status !== 'pending') {
    throw new InvariantViolation(
      `Cannot expire an invitation in status '${invitation.status}'.`,
      'INVITATION_NOT_PENDING',
    );
  }
  if (at.getTime() < invitation.expiresAt.getTime()) {
    throw new InvariantViolation(
      'This invitation has not reached its expiry time yet.',
      'NOT_YET_EXPIRED',
    );
  }

  const next: WorkspaceInvitation = { ...invitation, status: 'expired', updatedAt: at };

  return {
    invitation: next,
    event: {
      action: 'workspace_invitation.expired',
      actor,
      metadata: { workspaceId: invitation.workspaceId },
    },
  };
}

/**
 * Delivery state — separate from the invitation's own business status, same
 * discipline as `InvitationNotification` (ADR-0025): SMTP acceptance is
 * authoritative for delivery status; it is never conflated with acceptance
 * of the invitation itself. `actor` is a system actor supplied by the caller.
 */
export function recordWorkspaceInvitationDelivery(
  invitation: WorkspaceInvitation,
  result: { readonly status: 'sent' | 'failed'; readonly error?: string | null | undefined },
  actor: Actor,
  at: Date,
): WorkspaceInvitationOutcome {
  const next: WorkspaceInvitation = {
    ...invitation,
    deliveryStatus: result.status,
    deliveryAttempts: invitation.deliveryAttempts + 1,
    lastDeliveryError:
      result.status === 'failed'
        ? assertOptional(
            result.error ?? 'Delivery failed.',
            DELIVERY_ERROR_MAX,
            'LAST_DELIVERY_ERROR',
          )
        : null,
    updatedAt: at,
  };

  return {
    invitation: next,
    event: {
      action:
        result.status === 'sent'
          ? 'workspace_invitation.delivery_sent'
          : 'workspace_invitation.delivery_failed',
      actor,
      metadata: {
        workspaceId: invitation.workspaceId,
        attemptCount: String(next.deliveryAttempts),
      },
    },
  };
}
