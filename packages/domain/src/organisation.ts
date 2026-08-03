/**
 * Organisation — the tenant boundary (BUILD_ROADMAP.md, Release 0.2, item 1).
 *
 * An organisation is the outermost scope everything else in Witness sits inside:
 * workspaces, participants, records. This preview only covers creation — there is
 * no rename, archive or transfer operation yet, so the aggregate is deliberately
 * minimal rather than pre-built for change it does not yet support.
 *
 * Same shape as `record.ts`: immutable, and creation returns an outcome pairing
 * the aggregate with a `PendingAuditEvent` rather than a persisted audit event,
 * so the application layer supplies the identifier, clock and hash (ADR-0003).
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { OrganisationId } from './ids.js';

/** The maximum length of an organisation name. */
const NAME_MAX = 200;

export interface Organisation {
  readonly id: OrganisationId;
  readonly name: string;
  readonly createdAt: Date;
}

export interface OrganisationOutcome {
  readonly organisation: Organisation;
  readonly event: PendingAuditEvent;
}

function assertName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation(
      'An organisation must have a name. An unnamed organisation cannot be attributed to in provenance.',
      'NAME_REQUIRED',
    );
  }

  if (trimmed.length > NAME_MAX) {
    throw new InvariantViolation(
      `An organisation name must be ${NAME_MAX} characters or fewer, received ${trimmed.length}.`,
      'NAME_TOO_LONG',
    );
  }

  return trimmed;
}

/**
 * Create a new organisation.
 *
 * Least privilege (Constitution, Article on Authority and Access) means this is
 * not open to every actor — the application layer is expected to gate it behind
 * an `organisation:create` authorisation check before calling in, the same way
 * `record:create` gates `captureRecord`.
 */
export function createOrganisation(input: {
  id: OrganisationId;
  name: string;
  createdBy: Actor;
  createdAt: Date;
}): OrganisationOutcome {
  const organisation: Organisation = {
    id: input.id,
    name: assertName(input.name),
    createdAt: input.createdAt,
  };

  return {
    organisation,
    event: {
      action: 'organisation.created',
      actor: input.createdBy,
      metadata: { name: organisation.name },
    },
  };
}
