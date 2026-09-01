import { randomUUID } from 'node:crypto';

import { createActor, toActorId } from '@witness/domain';

import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';

export interface RecoverPlatformRoleInput {
  email: string;
  role: 'admin';
  reason: string;
  confirmation: string;
}

export async function recoverPlatformRole(prisma: PrismaService, input: RecoverPlatformRoleInput) {
  if (input.confirmation !== 'RECOVER_PLATFORM_ADMIN') {
    throw new Error('Recovery requires explicit RECOVER_PLATFORM_ADMIN confirmation.');
  }
  if (input.reason.trim().length < 10 || input.reason.length > 500) {
    throw new Error('Recovery reason must contain between 10 and 500 characters.');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('witness-platform-roles'))`;
    const usable = await tx.roleAssignment.count({
      where: {
        scopeType: 'platform',
        role: 'admin',
        user: { accountState: 'active', identityLinks: { some: {} } },
      },
    });
    if (usable > 0)
      throw new Error('Recovery refused: a usable platform administrator already exists.');

    const user = await tx.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { identityLinks: { select: { id: true } } },
    });
    if (user === null)
      throw new Error(`Recovery target '${input.email}' is not an existing Witness user.`);
    if (user.accountState !== 'active' || user.identityLinks.length === 0) {
      throw new Error('Recovery target must be active and linked through a verified OIDC sign-in.');
    }
    const existing = await tx.roleAssignment.findFirst({
      where: { userId: user.id, scopeType: 'platform' },
    });
    if (existing !== null)
      throw new Error('Recovery target already has a platform role assignment.');

    const now = new Date();
    const actorRow = await tx.actor.create({
      data: { id: randomUUID(), kind: 'system', displayName: 'Platform authority recovery' },
    });
    const actor = createActor({
      id: toActorId(actorRow.id),
      kind: 'system',
      displayName: actorRow.displayName,
    });
    const assignment = await tx.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'platform',
        userId: user.id,
        role: input.role,
        createdAt: now,
        updatedAt: now,
      },
    });
    await appendAuditEvent(
      tx,
      'role_assignment',
      assignment.id,
      {
        action: 'platform_role.recovered',
        actor,
        metadata: {
          targetUserId: user.id,
          targetEmail: user.email,
          role: input.role,
          previousState: 'absent',
          resultingState: 'active',
          reason: input.reason.trim(),
          recovery: 'true',
        },
      },
      now,
    );
    return { email: user.email, role: assignment.role };
  });
}
