/**
 * User — a registered Witness account (BUILD_ROADMAP.md Milestone 1.1, Users and
 * Memberships).
 *
 * This is deliberately decoupled from `Actor`. `Actor` answers "who performed
 * this action" for the audit trail, and is resolved from whatever principal the
 * (unverified, development-only) authorisation boundary presents — it has
 * existed since the Developer Preview and predates any registered-user concept.
 * `User` answers a different question: "who is this organisation allowed to
 * grant access to", independent of whether that person has ever signed in.
 * Authentication (Milestone 1.3) is what will eventually let a signed-in
 * principal resolve to a `User` row; until then, a `User` is data an
 * administrator manages, not an identity anyone can act as.
 *
 * Every user starts `invited` — there is no real invitation delivery yet
 * (BUILD_ROADMAP.md is explicit that email delivery is a separate, undated
 * capability), so `invited` here means "registered, not yet able to sign in",
 * not "an email was sent". The UI must say so; this module does not claim more
 * than that.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { UserId } from './ids.js';

export const ACCOUNT_STATES = ['invited', 'active', 'suspended', 'deactivated'] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

/** The maximum length of a user's display name. */
const DISPLAY_NAME_MAX = 200;

/**
 * Deliberately conservative: this rejects some technically-legal addresses
 * (quoted local parts, IP-literal domains) in exchange for catching the actual
 * mistakes an administrator will make — a missing `@`, a stray space, a typo'd
 * domain with no dot. RFC 5322's full grammar is not worth the false sense of
 * rigour it would buy here.
 *
 * No single regex here on purpose. A pattern like `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
 * lets the middle and trailing groups both match `.`, so a non-matching input
 * forces the engine to retry every possible split between them — polynomial
 * backtracking on attacker-controlled input (flagged by CodeQL). Splitting on
 * the single `@` first makes the local/domain boundary unambiguous, so there is
 * nothing left to backtrack over.
 */
const NO_WHITESPACE_OR_AT = /^[^\s@]+$/;

/** Matches the `witness_user.email` column (`VARCHAR(320)`) — defence in depth, same reasoning as `DISPLAY_NAME_MAX`. */
const EMAIL_MAX = 320;

export interface User {
  readonly id: UserId;
  /** Normalised (trimmed, lower-cased) — see `normaliseEmail`. */
  readonly email: string;
  readonly displayName: string;
  readonly accountState: AccountState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserOutcome {
  readonly user: User;
  readonly event: PendingAuditEvent;
}

/**
 * Canonicalise an email address for storage and comparison.
 *
 * Case sensitivity in the local part is technically permitted by RFC 5321, but
 * no mail system in practice treats `Name@example.com` and `name@example.com`
 * as different mailboxes, and treating them as different Witness users would
 * make "duplicate canonical email addresses must be prevented" impossible to
 * satisfy against a user who simply typed their own address differently twice.
 */
export function normaliseEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  // A second '@' would make the split ambiguous — indexOf finds the first,
  // so an address like 'a@b@c' fails the local/domain checks below rather
  // than being silently split at the wrong position.
  const local = at === -1 ? '' : trimmed.slice(0, at);
  const domain = at === -1 ? '' : trimmed.slice(at + 1);

  const valid =
    at > 0 &&
    NO_WHITESPACE_OR_AT.test(local) &&
    NO_WHITESPACE_OR_AT.test(domain) &&
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.');

  if (!valid) {
    throw new InvariantViolation(`'${email}' is not a valid email address.`, 'INVALID_EMAIL');
  }

  if (trimmed.length > EMAIL_MAX) {
    throw new InvariantViolation(
      `An email address must be ${EMAIL_MAX} characters or fewer, received ${trimmed.length}.`,
      'EMAIL_TOO_LONG',
    );
  }

  return trimmed;
}

function assertDisplayName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation('A user must have a display name.', 'DISPLAY_NAME_REQUIRED');
  }

  if (trimmed.length > DISPLAY_NAME_MAX) {
    throw new InvariantViolation(
      `A user display name must be ${DISPLAY_NAME_MAX} characters or fewer, received ${trimmed.length}.`,
      'DISPLAY_NAME_TOO_LONG',
    );
  }

  return trimmed;
}

/**
 * Register a new user.
 *
 * Duplicate-email prevention is NOT enforced here — it requires reading every
 * existing user, which is an application-layer concern (ADR-0003). The
 * application layer is expected to check before calling in, and the database
 * carries a unique constraint as the layer that cannot be bypassed by a second
 * call site forgetting to check.
 */
export function createUser(input: {
  id: UserId;
  email: string;
  displayName: string;
  registeredBy: Actor;
  registeredAt: Date;
}): UserOutcome {
  const user: User = {
    id: input.id,
    email: normaliseEmail(input.email),
    displayName: assertDisplayName(input.displayName),
    accountState: 'invited',
    createdAt: input.registeredAt,
    updatedAt: input.registeredAt,
  };

  return {
    user,
    event: {
      action: 'user.created',
      actor: input.registeredBy,
      metadata: { email: user.email },
    },
  };
}

/**
 * Controlled first-sign-in activation (Milestone 1.3, Authentication).
 *
 * An administrator registering a user (`createUser`, above) does not grant
 * access — it records that the person is *supposed* to have it. Activation
 * is the one, narrow transition that turns a verified external sign-in into
 * "this account may now be used", and it only ever applies to an account an
 * administrator already created; nothing in this module creates a `User`
 * that was not explicitly registered first (BUILD_ROADMAP.md Milestone 1.2's
 * "do not automatically create unrestricted users", carried forward here).
 */
export function activateAccount(user: User, activatedBy: Actor, at: Date): UserOutcome {
  if (user.accountState !== 'invited') {
    throw new InvariantViolation(
      `Cannot activate a user from account state '${user.accountState}' — only an invited ` +
        'account can complete first sign-in.',
      'INVALID_ACCOUNT_STATE',
    );
  }

  return {
    user: { ...user, accountState: 'active', updatedAt: at },
    event: {
      action: 'user.activated',
      actor: activatedBy,
      metadata: { email: user.email },
    },
  };
}

/**
 * Whether a sign-in may proceed for an account in this state. `invited` is
 * accessible — that is precisely the state `activateAccount` exists to move
 * out of — but `suspended` and `deactivated` are not, and each gets its own
 * code so the API can return a denial that names the actual reason rather
 * than one generic "access denied".
 */
export function assertAccountAccessible(accountState: AccountState): void {
  if (accountState === 'suspended') {
    throw new InvariantViolation(
      'This account has been suspended and cannot sign in.',
      'ACCOUNT_SUSPENDED',
    );
  }

  if (accountState === 'deactivated') {
    throw new InvariantViolation(
      'This account has been deactivated and cannot sign in.',
      'ACCOUNT_DEACTIVATED',
    );
  }
}
