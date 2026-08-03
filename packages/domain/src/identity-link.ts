/**
 * Identity link — the stable connection between an external identity
 * provider's subject and a Witness user (BUILD_ROADMAP.md Milestone 1.3,
 * Authentication).
 *
 * Deliberately keyed on `(provider, providerSubject)`, never on email. A
 * provider's subject claim (`sub`) is the one thing OIDC guarantees is
 * stable for the lifetime of the account; email is mutable, sometimes
 * unverified, and — critically — is the field an attacker controls if a
 * provider ever lets an unverified address through. `packages/domain/src/user.ts`
 * already normalises email for *display and lookup*; this module is what
 * stops that lookup from ever being trusted as a *permanent* identity key
 * once a link exists.
 */

import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { IdentityLinkId, UserId } from './ids.js';

export interface IdentityLink {
  readonly id: IdentityLinkId;
  readonly userId: UserId;
  /** e.g. `'keycloak'` — the provider name, not a display label. */
  readonly provider: string;
  /** The provider's `sub` claim. Opaque to Witness; never re-derived from email. */
  readonly providerSubject: string;
  readonly linkedAt: Date;
  readonly lastSignInAt: Date | null;
}

export interface IdentityLinkOutcome {
  readonly link: IdentityLink;
  readonly event: PendingAuditEvent;
}

/**
 * Record the first successful link between a verified external identity and
 * a Witness user. Uniqueness of `(provider, providerSubject)` — one link can
 * point to at most one user — is a database constraint (ADR-0003: the
 * application layer checks before calling in); this module records the
 * fact and its provenance, it does not enforce the constraint itself.
 */
export function linkIdentity(input: {
  id: IdentityLinkId;
  userId: UserId;
  provider: string;
  providerSubject: string;
  linkedBy: Actor;
  at: Date;
}): IdentityLinkOutcome {
  const link: IdentityLink = {
    id: input.id,
    userId: input.userId,
    provider: input.provider,
    providerSubject: input.providerSubject,
    linkedAt: input.at,
    lastSignInAt: input.at,
  };

  return {
    link,
    event: {
      action: 'identity_link.created',
      actor: input.linkedBy,
      metadata: { userId: link.userId, provider: link.provider },
    },
  };
}

/** Record a subsequent successful sign-in against an existing link. */
export function recordSignIn(link: IdentityLink, at: Date): IdentityLink {
  return { ...link, lastSignInAt: at };
}

/**
 * Administrator-controlled removal — the identity can no longer sign in as
 * this user until a new link is created. Does not touch the `User` row
 * itself; a user with no link is simply a user nobody can currently sign in
 * as, the same as one who has never signed in.
 */
export function removeIdentityLink(link: IdentityLink, removedBy: Actor): PendingAuditEvent {
  return {
    action: 'identity_link.removed',
    actor: removedBy,
    metadata: { userId: link.userId, provider: link.provider },
  };
}
