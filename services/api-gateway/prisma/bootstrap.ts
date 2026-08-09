/**
 * First-run bootstrap for a deployed instance.
 *
 * Witness is deny-by-default all the way down: every administrative route
 * requires an authenticated principal who already holds an `admin` role
 * assignment in some scope. On a freshly migrated production database nobody
 * holds one, so there is no request anyone can make that creates the first
 * organisation. That is the correct posture — and it means a deployment needs
 * exactly one operation performed outside the HTTP surface.
 *
 * This is that operation, and nothing more. It creates:
 *
 *   • one organisation,
 *   • one user in the `invited` account state, keyed on a verified email,
 *   • that user's organisation membership and `admin` role assignment.
 *
 * It creates no sessions, no participants, no consent records and no evidence.
 * It is not a demo seed — `prisma/seed.ts` is, and it must never run against a
 * production database (`pnpm seed` is separate, and stays separate).
 *
 * The user is left in `invited`. They become real by signing in through the
 * identity provider: `AuthenticationService` matches the verified email from
 * the ID token against this row, links the provider subject, and activates the
 * account. So this script grants nothing to anyone who cannot already
 * authenticate as that email at the IdP — it is an invitation, not a back door.
 *
 * Refuses to run if any organisation already exists. A bootstrap that can be
 * re-run against a live instance is a privilege-escalation tool.
 */

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { firstAuditEventFor } from './operator-audit.js';

const prisma = new PrismaClient();

/** The three values bootstrap takes. Named as a type so a typo is a compile error. */
type RequiredVariable =
  | 'WITNESS_BOOTSTRAP_ORGANISATION_NAME'
  | 'WITNESS_BOOTSTRAP_ADMIN_EMAIL'
  | 'WITNESS_BOOTSTRAP_ADMIN_NAME';

function required(name: RequiredVariable): string {
  const value = (process.env[name] ?? '').trim();
  if (value === '') {
    throw new Error(`${name} is required. Bootstrap is opt-in and takes no defaults.`);
  }
  return value;
}

async function main(): Promise<void> {
  const organisationName = required('WITNESS_BOOTSTRAP_ORGANISATION_NAME');
  const adminEmail = required('WITNESS_BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const adminName = required('WITNESS_BOOTSTRAP_ADMIN_NAME');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    throw new Error(`WITNESS_BOOTSTRAP_ADMIN_EMAIL is not an email address: ${adminEmail}`);
  }

  const existing = await prisma.organisation.count();
  if (existing > 0) {
    process.stdout.write(
      `Refusing to bootstrap: ${existing} organisation(s) already exist. ` +
        'Add further administrators through the application.\n',
    );
    return;
  }

  const now = new Date();
  const organisationId = randomUUID();
  const userId = randomUUID();
  const actorId = randomUUID();

  await prisma.$transaction(async (tx) => {
    // The audit chain needs an actor row, and the actor here is genuinely the
    // deployment itself rather than a person — recorded as such instead of
    // borrowing the administrator's identity for an action they did not take.
    await tx.actor.create({
      data: { id: actorId, kind: 'system', displayName: 'Deployment bootstrap' },
    });

    await tx.organisation.create({
      data: { id: organisationId, name: organisationName, createdAt: now },
    });

    await tx.user.create({
      data: {
        id: userId,
        email: adminEmail,
        displayName: adminName,
        accountState: 'invited',
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.organisationMembership.create({
      data: {
        id: randomUUID(),
        organisationId,
        userId,
        state: 'active',
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'organisation',
        organisationId,
        userId,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      },
    });

    for (const event of [
      {
        subjectType: 'organisation',
        subjectId: organisationId,
        action: 'organisation.created',
        metadata: { via: 'bootstrap' },
      },
      {
        subjectType: 'user',
        subjectId: userId,
        action: 'user.invited',
        metadata: { via: 'bootstrap', role: 'admin' },
      },
    ]) {
      await tx.auditEvent.create({ data: firstAuditEventFor(event, actorId, now) });
    }
  });

  process.stdout.write(
    `Bootstrapped organisation "${organisationName}".\n` +
      `Invited ${adminEmail} as an organisation administrator.\n` +
      'They activate the account by signing in through the identity provider with that ' +
      'verified email address.\n',
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
