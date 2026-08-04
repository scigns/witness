/**
 * Session issuance and validation.
 *
 * The bearer token handed to the browser is never itself persisted — only
 * its SHA-256 hash, the same reasoning as never storing a password (see the
 * `AuthSession` model's own comment in `schema.prisma` for why a bearer
 * token rather than a cookie).
 */

import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { sha256 } from '../infrastructure/hashing.js';

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * "Unknown" (no such token — never issued, or already signed out) and
 * "expired" (a real session, but past `expiresAt`) are different situations
 * for a caller like `CurrentUserController` to explain to a user, even
 * though both mean "not currently signed in". `resolveUserId` collapses
 * them for callers (`SessionAuthenticator`) that only need a yes/no.
 */
export type SessionLookupResult =
  | { readonly status: 'valid'; readonly userId: string }
  | { readonly status: 'not_found' }
  | { readonly status: 'expired' };

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, ttlMinutes: number): Promise<IssuedSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.prisma.authSession.create({
      data: {
        id: randomUUID(),
        tokenHash: sha256(token),
        userId,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async resolveSession(rawToken: string): Promise<SessionLookupResult> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: sha256(rawToken) },
      select: { userId: true, expiresAt: true },
    });

    if (session === null) return { status: 'not_found' };
    if (session.expiresAt.getTime() < Date.now()) return { status: 'expired' };
    return { status: 'valid', userId: session.userId };
  }

  /** Returns the session's user id, or `null` if the token is unknown or expired. */
  async resolveUserId(rawToken: string): Promise<string | null> {
    const result = await this.resolveSession(rawToken);
    return result.status === 'valid' ? result.userId : null;
  }

  async revoke(rawToken: string): Promise<void> {
    // Deleting a row that may not exist (already expired, already signed
    // out elsewhere) is not an error — sign-out is idempotent by design.
    await this.prisma.authSession.deleteMany({ where: { tokenHash: sha256(rawToken) } });
  }
}
