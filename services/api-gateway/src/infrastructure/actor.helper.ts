/**
 * Resolve the `Actor` row for a principal — find or create.
 *
 * Every write-side service in this module (`OrganisationsService`,
 * `WorkspacesService`, and now the users/memberships services) needs exactly
 * this lookup before it can attribute an audit event. Factored out here so the
 * three *new* services in this capability share one implementation rather than
 * three near-identical private methods; the pre-existing services keep their
 * own copies rather than being refactored as a side effect of this PR.
 */

import { randomUUID } from 'node:crypto';

import { createActor, toActorId, type Actor } from '@witness/domain';

import type { PrismaService } from './prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';

export async function resolveActor(prisma: PrismaService, principal: Principal): Promise<Actor> {
  const existing = await prisma.actor.findFirst({
    where: { displayName: principal.displayName, kind: principal.kind },
  });

  if (existing !== null) {
    return createActor({
      id: toActorId(existing.id),
      kind: existing.kind as Actor['kind'],
      displayName: existing.displayName,
    });
  }

  const created = await prisma.actor.create({
    data: {
      id: randomUUID(),
      kind: principal.kind,
      displayName: principal.displayName,
    },
  });

  return createActor({
    id: toActorId(created.id),
    kind: created.kind as Actor['kind'],
    displayName: created.displayName,
  });
}
