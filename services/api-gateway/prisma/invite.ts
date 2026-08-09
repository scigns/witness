/**
 * Invite a colleague into an existing organisation.
 *
 * There is no HTTP route for this yet, and that is deliberate rather than an
 * oversight: `user:create` has no organisation or workspace to scope to, so it
 * resolves in the *global* tier, which never includes `admin`
 * (`packages/policy/policy.csv`, `RoleResolutionService.globalGrantTiers`).
 * Answering "who may create an account from nothing" needs a
 * platform-administrator concept that the accepted domain model does not have,
 * and a controlled internal pilot is not the place to invent one.
 *
 * So an operator runs this instead, once per pilot user. It creates:
 *
 *   • a user in the `invited` state, keyed on a verified email;
 *   • their organisation membership;
 *   • their role assignment in that organisation.
 *
 * The account is inert until that person signs in through the identity
 * provider with a *verified* email that matches — `AuthenticationService` links
 * the provider subject then, and not before. Running this grants nothing to
 * anyone who cannot already authenticate at the identity provider.
 *
 * Refuses to touch an email that already has an account: changing someone's
 * organisation or role from a shell script, with no audit actor and no
 * optimistic-concurrency check, is exactly the kind of edit that should go
 * through the application.
 *
 * Required environment:
 *   WITNESS_INVITE_ORGANISATION   the organisation's name (must already exist)
 *   WITNESS_INVITE_EMAIL          the person's verified email at the IdP
 *   WITNESS_INVITE_NAME           how their name should read in Witness
 *   WITNESS_INVITE_ROLE           admin | facilitator | contributor | reviewer |
 *                                 participant | reader
 */

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { firstAuditEventFor } from './operator-audit.js';

const prisma = new PrismaClient();

type RequiredVariable =
  | 'WITNESS_INVITE_ORGANISATION'
  | 'WITNESS_INVITE_EMAIL'
  | 'WITNESS_INVITE_NAME'
  | 'WITNESS_INVITE_ROLE';

const ROLES = ['admin', 'facilitator', 'contributor', 'reviewer', 'participant', 'reader'];

function required(name: RequiredVariable): string {
  const value = (process.env[name] ?? '').trim();
  if (value === '') {
    throw new Error(`${name} is required. Invitation is explicit and takes no defaults.`);
  }
  return value;
}

async function main(): Promise<void> {
  const organisationName = required('WITNESS_INVITE_ORGANISATION');
  const email = required('WITNESS_INVITE_EMAIL').toLowerCase();
  const displayName = required('WITNESS_INVITE_NAME');
  const role = required('WITNESS_INVITE_ROLE');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`WITNESS_INVITE_EMAIL is not an email address: ${email}`);
  }
  if (!ROLES.includes(role)) {
    throw new Error(`WITNESS_INVITE_ROLE must be one of ${ROLES.join(', ')} — got '${role}'.`);
  }

  const organisation = await prisma.organisation.findFirst({ where: { name: organisationName } });
  if (organisation === null) {
    throw new Error(`No organisation named '${organisationName}'. Run \`pnpm bootstrap\` first.`);
  }

  if ((await prisma.user.findUnique({ where: { email } })) !== null) {
    process.stdout.write(
      `${email} already has a Witness account. Change their membership or role through the ` +
        'application, where it is audited.\n',
    );
    return;
  }

  const now = new Date();
  const userId = randomUUID();
  const actorId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.actor.create({
      data: { id: actorId, kind: 'system', displayName: 'Operator invitation' },
    });

    await tx.user.create({
      data: {
        id: userId,
        email,
        displayName,
        accountState: 'invited',
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.organisationMembership.create({
      data: {
        id: randomUUID(),
        organisationId: organisation.id,
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
        organisationId: organisation.id,
        userId,
        role,
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.auditEvent.create({
      data: firstAuditEventFor(
        {
          subjectType: 'user',
          subjectId: userId,
          action: 'user.invited',
          metadata: { via: 'invite', role, organisationId: organisation.id },
        },
        actorId,
        now,
      ),
    });
  });

  process.stdout.write(
    `Invited ${email} to "${organisationName}" as ${role}.\n` +
      'They activate the account by signing in through the identity provider with that verified ' +
      'email address.\n',
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Invitation failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
