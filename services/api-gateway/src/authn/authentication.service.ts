/**
 * Authentication orchestration — sign-in, callback, current-user, sign-out.
 *
 * The steps `BUILD_ROADMAP.md` Milestone 1.3 names for an authenticated
 * identity happen here, in order: verify external identity
 * (`IdentityProviderPort`), resolve the Witness user (`resolveWitnessUser`),
 * verify account state (`assertAccountAccessible`), issue a session.
 * Membership and role-assignment resolution for a *specific* scope happen
 * per-request in `SessionAuthenticator`, not here — this service's job ends
 * at "who is this person and are they allowed to hold a session at all".
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  activateAccount,
  assertAccountAccessible,
  isInGoodStanding,
  linkIdentity,
  normaliseEmail,
  recordSignIn,
  toIdentityLinkId,
  toUserId,
  updateOwnProfile,
  type AccountState,
  type IdentityLink,
  type MembershipState,
  type User,
  type WitnessRole,
} from '@witness/domain';
import type { CurrentUserView, UpdateOwnProfileRequest } from '@witness/contracts';

import type { Principal } from '../authz/authorization.port.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { IdentityProviderPort } from './identity-provider.port.js';
import { SessionService, type IssuedSession } from './session.service.js';
import {
  codeChallengeFor,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from './pkce.helper.js';

export class AuthenticationDeniedError extends Error {
  constructor(
    message: string,
    public readonly reason:
      'unknown_identity' | 'account_suspended' | 'account_deactivated' | 'invalid_callback',
  ) {
    super(message);
    this.name = 'AuthenticationDeniedError';
  }
}

const LOGIN_ATTEMPT_TTL_MINUTES = 10;

/**
 * Duck-typed check for Prisma's `PrismaClientKnownRequestError` with code
 * `P2025` ("record to delete/update does not exist"), deliberately without
 * importing `Prisma` from `@prisma/client` as a runtime value. That import
 * only resolves once `prisma generate` has produced the generated client on
 * disk — true for every build, but not guaranteed before this package's own
 * unit tests run (they exercise this service against a hand-rolled fake
 * Prisma, never a real `PrismaClient`), so requiring it here would make
 * `handleCallback` untestable without a generation step tests have no other
 * reason to depend on.
 */
function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2025'
  );
}

/** The "who signed this action" principal used for the system-attributed steps of sign-in itself. */
const SIGN_IN_SYSTEM_PRINCIPAL: Principal = {
  subject: 'system:authentication',
  displayName: 'Witness Authentication',
  kind: 'system',
  roles: [],
};

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identityProvider: IdentityProviderPort,
    private readonly sessions: SessionService,
    private readonly redirectUri: string,
    private readonly sessionTtlMinutes: number,
  ) {}

  async startLogin(): Promise<{ redirectUrl: string }> {
    const state = generateState();
    const nonce = generateNonce();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = codeChallengeFor(codeVerifier);

    // Opportunistic cleanup: `GET /api/v1/auth/login` is unauthenticated, so
    // this table would otherwise grow without bound from abandoned attempts
    // (nobody ever completed the callback) as well as merely-expired ones.
    // A dedicated scheduled job is documented for production (see
    // docs/engineering/DEVELOPER_ONBOARDING.md) — this keeps the table
    // bounded even without one, at the cost of one small indexed delete per
    // sign-in start.
    await this.prisma.authLoginAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    await this.prisma.authLoginAttempt.create({
      data: {
        state,
        nonce,
        codeVerifier,
        redirectUri: this.redirectUri,
        expiresAt: new Date(Date.now() + LOGIN_ATTEMPT_TTL_MINUTES * 60_000),
      },
    });

    const request = await this.identityProvider.buildAuthorizationRequest({
      state,
      nonce,
      codeChallenge,
      redirectUri: this.redirectUri,
    });

    return { redirectUrl: request.url };
  }

  async handleCallback(code: string, state: string): Promise<IssuedSession> {
    if (code.trim() === '' || state.trim() === '') {
      throw new AuthenticationDeniedError('Missing code or state.', 'invalid_callback');
    }

    // Single-use, consumed atomically: the DELETE *is* the claim. `findUnique`
    // followed by a separate `delete` would let two concurrent callbacks
    // carrying the same `state` both read the row before either deleted it,
    // and both would then proceed to code exchange. Only the caller whose
    // DELETE actually removes a row may continue — a losing concurrent
    // caller, or a replay after the row is already gone, gets Prisma's
    // "record not found" (P2025), which reads identically to "never existed".
    const attempt = await this.prisma.authLoginAttempt
      .delete({ where: { state } })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) return null;
        throw error;
      });

    if (attempt === null || attempt.expiresAt.getTime() < Date.now()) {
      throw new AuthenticationDeniedError(
        'Unknown or expired sign-in attempt.',
        'invalid_callback',
      );
    }

    let idToken: string;
    try {
      const exchanged = await this.identityProvider.exchangeCode({
        code,
        codeVerifier: attempt.codeVerifier,
        redirectUri: attempt.redirectUri,
      });
      idToken = exchanged.idToken;
    } catch (error) {
      this.logger.warn(`Code exchange failed: ${error instanceof Error ? error.message : error}`);
      throw new AuthenticationDeniedError('Could not complete sign-in.', 'invalid_callback');
    }

    let verified;
    try {
      verified = await this.identityProvider.verifyIdToken(idToken, attempt.nonce);
    } catch (error) {
      this.logger.warn(
        `ID token verification failed: ${error instanceof Error ? error.message : error}`,
      );
      throw new AuthenticationDeniedError(
        'Could not verify the signed-in identity.',
        'invalid_callback',
      );
    }

    const user = await this.resolveWitnessUser(verified);

    try {
      assertAccountAccessible(user.accountState as AccountState);
    } catch {
      await this.auditDenial(user.id, user.accountState);
      throw new AuthenticationDeniedError(
        user.accountState === 'suspended'
          ? 'This account has been suspended and cannot sign in.'
          : 'This account has been deactivated and cannot sign in.',
        user.accountState === 'suspended' ? 'account_suspended' : 'account_deactivated',
      );
    }

    return this.sessions.issue(user.id, this.sessionTtlMinutes);
  }

  /**
   * Resolve a verified external identity to a Witness user — an existing
   * link, or a controlled first-sign-in activation, never an auto-created
   * account.
   */
  private async resolveWitnessUser(verified: {
    subject: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
  }): Promise<{ id: string; accountState: string }> {
    const existingLinkRow = await this.prisma.identityLink.findUnique({
      where: {
        provider_providerSubject: {
          provider: this.identityProvider.provider,
          providerSubject: verified.subject,
        },
      },
    });

    if (existingLinkRow !== null) {
      const link: IdentityLink = {
        id: toIdentityLinkId(existingLinkRow.id),
        userId: toUserId(existingLinkRow.userId),
        provider: existingLinkRow.provider,
        providerSubject: existingLinkRow.providerSubject,
        linkedAt: existingLinkRow.linkedAt,
        lastSignInAt: existingLinkRow.lastSignInAt,
      };
      const updated = recordSignIn(link, new Date());

      await this.prisma.identityLink.update({
        where: { id: existingLinkRow.id },
        data: { lastSignInAt: updated.lastSignInAt },
      });

      return this.prisma.user.findUniqueOrThrow({ where: { id: existingLinkRow.userId } });
    }

    // No existing link. Controlled first-sign-in activation only: the email
    // must be verified by the provider (never trust an unverified email as
    // a linking key) and must match an *invited* user an administrator
    // already registered. Anything else is an unknown identity — Witness
    // never creates a user here, and never links onto an account that is
    // not currently `invited` without an existing link (BUILD_ROADMAP.md:
    // "do not automatically create unrestricted users").
    if (verified.email === null || !verified.emailVerified) {
      throw new AuthenticationDeniedError(
        'No Witness account is linked to this identity, and it has no verified email to ' +
          'match against an invited account.',
        'unknown_identity',
      );
    }

    const candidateRow = await this.prisma.user.findUnique({
      where: { email: normaliseEmail(verified.email) },
    });

    if (candidateRow === null || candidateRow.accountState !== 'invited') {
      throw new AuthenticationDeniedError(
        'No Witness account is linked to this identity, and no invited account matches its email.',
        'unknown_identity',
      );
    }

    const now = new Date();
    const actor = await resolveActor(this.prisma, {
      subject: `${this.identityProvider.provider}:${verified.subject}`,
      displayName: verified.name ?? verified.email,
      kind: 'human',
      roles: [],
    });

    const candidate: User = {
      id: toUserId(candidateRow.id),
      email: candidateRow.email,
      displayName: candidateRow.displayName,
      bio: candidateRow.bio,
      accountState: 'invited',
      createdAt: candidateRow.createdAt,
      updatedAt: candidateRow.updatedAt,
    };

    const linkOutcome = linkIdentity({
      id: toIdentityLinkId(randomUUID()),
      userId: candidate.id,
      provider: this.identityProvider.provider,
      providerSubject: verified.subject,
      linkedBy: actor,
      at: now,
    });

    const activationOutcome = activateAccount(candidate, actor, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.identityLink.create({
        data: {
          id: linkOutcome.link.id,
          provider: linkOutcome.link.provider,
          providerSubject: linkOutcome.link.providerSubject,
          userId: linkOutcome.link.userId,
          linkedAt: linkOutcome.link.linkedAt,
          lastSignInAt: linkOutcome.link.lastSignInAt,
        },
      });
      await appendAuditEvent(tx, 'identity_link', linkOutcome.link.id, linkOutcome.event, now);

      await tx.user.update({
        where: { id: candidateRow.id },
        data: { accountState: 'active', updatedAt: now },
      });
      await appendAuditEvent(tx, 'user', candidateRow.id, activationOutcome.event, now);
    });

    return { id: candidateRow.id, accountState: 'active' };
  }

  private async auditDenial(userId: string, accountState: string): Promise<void> {
    const actor = await resolveActor(this.prisma, SIGN_IN_SYSTEM_PRINCIPAL);

    await this.prisma.$transaction(async (tx) => {
      await appendAuditEvent(
        tx,
        'user',
        userId,
        { action: 'authentication.denied', actor, metadata: { accountState } },
        new Date(),
      );
    });
  }

  async signOut(sessionToken: string): Promise<void> {
    await this.sessions.revoke(sessionToken);
  }

  /**
   * The signed-in user's own identity plus only what they actually have
   * access to — organisations and workspaces they hold a membership in
   * good standing for, never the full catalog.
   *
   * A *session token* can outlive the account it belongs to becoming
   * suspended or deactivated after sign-in — `SessionService` only checks
   * token validity and expiry, not account state. Distinguishing that case
   * here (rather than silently returning the view, or collapsing it into
   * the same "not signed in" response as a missing session) is what lets
   * `CurrentUserController` tell a suspended user something true instead of
   * a generic "sign in again".
   */
  async getCurrentUser(userId: string): Promise<CurrentUserResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null) return { status: 'not_found' };
    if (user.accountState === 'suspended') return { status: 'suspended' };
    if (user.accountState === 'deactivated') return { status: 'deactivated' };

    const [organisationMemberships, workspaceMemberships, roleAssignments] = await Promise.all([
      this.prisma.organisationMembership.findMany({
        where: { userId },
        include: { organisation: true },
      }),
      this.prisma.workspaceMembership.findMany({
        where: { userId },
        include: { workspace: true },
      }),
      // One role per (user, organisation) and one per (user, workspace) —
      // the `RoleAssignment` domain invariant guarantees at most one row
      // each, so a plain map (not a multi-value structure) is enough.
      this.prisma.roleAssignment.findMany({
        where: { userId },
        select: { role: true, organisationId: true, workspaceId: true },
      }),
    ]);

    const roleByOrganisation = new Map(
      roleAssignments
        .filter((a) => a.organisationId !== null)
        .map((a) => [a.organisationId as string, a.role as WitnessRole]),
    );
    const roleByWorkspace = new Map(
      roleAssignments
        .filter((a) => a.workspaceId !== null)
        .map((a) => [a.workspaceId as string, a.role as WitnessRole]),
    );

    return {
      status: 'ok',
      view: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        bio: user.bio,
        accountState: user.accountState as AccountState,
        organisations: organisationMemberships
          .filter((m) => isInGoodStanding(m.state as MembershipState))
          .map((m) => ({
            id: m.organisation.id,
            name: m.organisation.name,
            profile: m.organisation.profile,
            createdAt: m.organisation.createdAt.toISOString(),
            role: roleByOrganisation.get(m.organisation.id) ?? null,
          })),
        workspaces: workspaceMemberships
          .filter((m) => isInGoodStanding(m.state as MembershipState))
          .map((m) => ({
            id: m.workspace.id,
            name: m.workspace.name,
            organisationId: m.workspace.organisationId,
            description: m.workspace.description,
            createdAt: m.workspace.createdAt.toISOString(),
            role: roleByWorkspace.get(m.workspace.id) ?? null,
          })),
      },
    };
  }

  /**
   * A person editing their own profile. Not gated by `AuthorizationGuard` —
   * same "may describe yourself" reasoning as `getCurrentUser` — so this
   * takes a raw `userId` from the caller's own session, not a `Principal`.
   */
  async updateProfile(userId: string, input: UpdateOwnProfileRequest): Promise<CurrentUserResult> {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    if (row === null) return { status: 'not_found' };
    if (row.accountState === 'suspended') return { status: 'suspended' };
    if (row.accountState === 'deactivated') return { status: 'deactivated' };

    const user: User = {
      id: toUserId(row.id),
      email: row.email,
      displayName: row.displayName,
      bio: row.bio,
      accountState: row.accountState as AccountState,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    const actor = await resolveActor(this.prisma, {
      subject: `user:${userId}`,
      displayName: user.displayName,
      kind: 'human',
      roles: [],
    });
    const now = new Date();
    const outcome = updateOwnProfile(user, input, actor, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { bio: outcome.user.bio } });
      await appendAuditEvent(tx, 'user', outcome.user.id, outcome.event, now);
    });

    return this.getCurrentUser(userId);
  }
}

/** Discriminated so `CurrentUserController` can map each case to a distinct, honest response. */
export type CurrentUserResult =
  | { readonly status: 'ok'; readonly view: CurrentUserView }
  | { readonly status: 'not_found' }
  | { readonly status: 'suspended' }
  | { readonly status: 'deactivated' };
