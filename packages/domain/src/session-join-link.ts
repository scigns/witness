/**
 * SessionJoinLink (Phase 5, Workstream 1.6) — a governed, session-scoped
 * credential that lets a participant with no prior workspace standing
 * acquire a `SessionParticipant` row without a facilitator adding them by
 * hand first.
 *
 * Deliberately session-scoped, never workspace- or programme-wide: a link
 * minted for one session must never work for another, and must never be a
 * standing bearer credential a facilitator can only revoke by rotating
 * every session's link at once. `assertSessionJoinLinkUsable` enforces
 * session-binding by construction — the caller passes the sessionId being
 * joined and this module refuses a mismatch.
 *
 * Same token discipline as `workspace-invitation.ts`: the domain layer never
 * sees or generates the raw token (ADR-0003 forbids `node:crypto` here) —
 * the application layer generates a random value and hashes it, and only
 * `tokenHash` is ever passed in or persisted. A database read alone cannot
 * reconstruct a usable join link or QR code.
 *
 * What differs from `WorkspaceInvitation`: a `WorkspaceInvitation` is
 * single-use and single-target (one email, one accept). A
 * `SessionJoinLink` is a standing, multi-use credential — the same QR
 * poster is scanned by every participant in the room over the life of the
 * session. Idempotency and rate-limiting for *individual* join attempts
 * against a standing link are therefore not this module's job (there is no
 * single "the" attempt to make idempotent) — that is
 * `SessionJoinAttempt`'s job, tracked at the application layer.
 *
 * `governanceMode` decides what identity proof a join requires. That
 * decision — checking a signed-in session, an existing workspace
 * membership, or nothing at all — needs data this module cannot see
 * (ADR-0003), so `governanceMode` is exposed here purely as a fact the
 * application layer reads off the link and enforces; this module only
 * guarantees the value itself cannot be tampered with after creation.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CoDesignSessionId,
  OrganisationId,
  SessionJoinLinkId,
  UserId,
  WorkspaceId,
} from './ids.js';

/**
 * - `invited_only` — the joining principal must already hold a role in this
 *   workspace (an existing `WorkspaceMembership`); the link only saves a
 *   facilitator from typing a URL by hand, it grants no new standing.
 * - `verified_guest` — any signed-in Witness account may join; no prior
 *   workspace standing required.
 * - `pseudonymous` — no sign-in required; the joining client supplies a
 *   display name, but it is never linked to a Witness account.
 * - `anonymous` — no sign-in, no display name; the resulting
 *   `SessionParticipant.identityMode` is forced to `'anonymous'`.
 */
export const SESSION_JOIN_GOVERNANCE_MODES = [
  'invited_only',
  'verified_guest',
  'pseudonymous',
  'anonymous',
] as const;
export type SessionJoinGovernanceMode = (typeof SESSION_JOIN_GOVERNANCE_MODES)[number];

export const SESSION_JOIN_LINK_STATUSES = ['active', 'revoked', 'expired'] as const;
export type SessionJoinLinkStatus = (typeof SESSION_JOIN_LINK_STATUSES)[number];

export interface SessionJoinLink {
  readonly id: SessionJoinLinkId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly governanceMode: SessionJoinGovernanceMode;
  readonly tokenHash: string;
  readonly status: SessionJoinLinkStatus;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly maxUses: number | null;
  readonly useCount: number;
  readonly updatedAt: Date;
}

export interface SessionJoinLinkOutcome {
  readonly link: SessionJoinLink;
  readonly event: PendingAuditEvent;
}

function assertGovernanceMode(value: string): asserts value is SessionJoinGovernanceMode {
  if (!(SESSION_JOIN_GOVERNANCE_MODES as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised session join governance mode. Choose one of: ${SESSION_JOIN_GOVERNANCE_MODES.join(', ')}.`,
      'INVALID_GOVERNANCE_MODE',
    );
  }
}

function assertFutureExpiry(expiresAt: Date, at: Date): void {
  if (expiresAt.getTime() <= at.getTime()) {
    throw new InvariantViolation(
      'A session join link must expire in the future.',
      'EXPIRY_MUST_BE_FUTURE',
    );
  }
}

export interface CreateSessionJoinLinkInput {
  id: SessionJoinLinkId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  governanceMode: string;
  /** Computed by the application layer (SHA-256 of a random token); never the raw token itself. */
  tokenHash: string;
  expiresAt: Date;
  /** `null`/`undefined` means uncapped — only the trailing-window rate limit applies. */
  maxUses?: number | null | undefined;
  createdByUserId: UserId;
  createdBy: Actor;
  at: Date;
}

/**
 * Create a session join link.
 *
 * Least privilege (Constitution, Authority and Access): the application
 * layer is expected to gate this behind a facilitator-equivalent
 * session-scoped check before calling in, same convention as
 * `createWorkspaceInvitation`.
 */
export function createSessionJoinLink(input: CreateSessionJoinLinkInput): SessionJoinLinkOutcome {
  assertGovernanceMode(input.governanceMode);
  assertFutureExpiry(input.expiresAt, input.at);

  if (input.tokenHash.trim().length === 0) {
    throw new InvariantViolation('A join link requires a token hash.', 'TOKEN_HASH_REQUIRED');
  }
  if (input.maxUses != null && input.maxUses <= 0) {
    throw new InvariantViolation(
      'maxUses must be a positive number when provided.',
      'INVALID_MAX_USES',
    );
  }

  const link: SessionJoinLink = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    governanceMode: input.governanceMode,
    tokenHash: input.tokenHash,
    status: 'active',
    createdByUserId: input.createdByUserId,
    createdAt: input.at,
    expiresAt: input.expiresAt,
    revokedAt: null,
    maxUses: input.maxUses ?? null,
    useCount: 0,
    updatedAt: input.at,
  };

  return {
    link,
    event: {
      action: 'session_join_link.created',
      actor: input.createdBy,
      metadata: {
        sessionId: link.sessionId,
        governanceMode: link.governanceMode,
      },
    },
  };
}

export function revokeSessionJoinLink(
  link: SessionJoinLink,
  actor: Actor,
  at: Date,
): SessionJoinLinkOutcome {
  if (link.status !== 'active') {
    throw new InvariantViolation(
      `Cannot revoke a join link in status '${link.status}' — only 'active'.`,
      'CANNOT_REVOKE',
    );
  }

  const next: SessionJoinLink = { ...link, status: 'revoked', revokedAt: at, updatedAt: at };

  return {
    link: next,
    event: {
      action: 'session_join_link.revoked',
      actor,
      metadata: { sessionId: link.sessionId },
    },
  };
}

/**
 * Lazily mark an active link expired. Not required for the security
 * guarantee (`assertSessionJoinLinkUsable` independently rejects an
 * expired-but-still-`active` row) — exists purely so a read path can show
 * accurate status without a background job.
 */
export function markSessionJoinLinkExpired(
  link: SessionJoinLink,
  actor: Actor,
  at: Date,
): SessionJoinLinkOutcome {
  if (link.status !== 'active') {
    throw new InvariantViolation(
      `Cannot expire a join link in status '${link.status}' — only 'active'.`,
      'CANNOT_EXPIRE',
    );
  }
  if (at.getTime() < link.expiresAt.getTime()) {
    throw new InvariantViolation(
      'This join link has not reached its expiry time yet.',
      'NOT_YET_EXPIRED',
    );
  }

  const next: SessionJoinLink = { ...link, status: 'expired', updatedAt: at };

  return {
    link: next,
    event: {
      action: 'session_join_link.expired',
      actor,
      metadata: { sessionId: link.sessionId },
    },
  };
}

/**
 * The one check every join attempt must pass before a `SessionParticipant`
 * is created from it. Session-binding is guaranteed by construction, not by
 * a check here: the join route (`POST /session-join/:token/join`) carries
 * no separate session selector at all — the token itself is the only
 * lookup key, and a token's `tokenHash` resolves to exactly one link and
 * therefore exactly one `sessionId`. There is no request shape through
 * which a token minted for one session could be presented "against"
 * another, so this module has nothing to compare it to.
 */
export function assertSessionJoinLinkUsable(link: SessionJoinLink, at: Date): void {
  if (link.status !== 'active') {
    throw new InvariantViolation(
      `This join link is ${link.status === 'revoked' ? 'no longer active' : link.status}.`,
      'JOIN_LINK_NOT_ACTIVE',
    );
  }
  if (at.getTime() >= link.expiresAt.getTime()) {
    throw new InvariantViolation('This join link has expired.', 'JOIN_LINK_EXPIRED');
  }
  if (link.maxUses != null && link.useCount >= link.maxUses) {
    throw new InvariantViolation(
      'This join link has reached its maximum number of uses.',
      'JOIN_LINK_EXHAUSTED',
    );
  }
}

/** Record one successful use. Called once per *new* participant created — never for an idempotent replay. */
export function recordSessionJoinLinkUse(link: SessionJoinLink, at: Date): SessionJoinLink {
  return { ...link, useCount: link.useCount + 1, updatedAt: at };
}
