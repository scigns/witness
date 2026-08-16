/**
 * Organisation — the tenant boundary (BUILD_ROADMAP.md, Release 0.2, item 1).
 *
 * An organisation is the outermost scope everything else in Witness sits inside:
 * workspaces, participants, records. Creation and a narrow storage-quota update
 * are the only two operations — there is no rename, archive or transfer
 * operation yet, so the aggregate stays deliberately minimal rather than
 * pre-built for change it does not yet support.
 *
 * Same shape as `record.ts`: immutable, and every operation returns an
 * outcome pairing the aggregate with a `PendingAuditEvent` rather than a
 * persisted audit event, so the application layer supplies the identifier,
 * clock and hash (ADR-0003).
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { OrganisationId } from './ids.js';

/** The maximum length of an organisation name. */
const NAME_MAX = 200;

/** 5 GiB — Flight 1's included storage allowance per organisation. */
export const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * A profile is a starting point, not a fork: it configures which sensible
 * defaults an organisation gets at creation (e.g. the starter consent
 * template `prisma/bootstrap.ts`-style seeding picks — see
 * `organisations.service.ts`), never a different code path or a different
 * deployment. `general` is the unopinionated default for an institution
 * that does not match one of the named ones.
 */
export const INSTITUTIONAL_PROFILES = ['general', 'spc', 'fta', 'moj', 'church'] as const;
export type InstitutionalProfile = (typeof INSTITUTIONAL_PROFILES)[number];

export interface Organisation {
  readonly id: OrganisationId;
  readonly name: string;
  readonly storageQuotaBytes: number;
  readonly profile: InstitutionalProfile;
  readonly createdAt: Date;
}

export interface OrganisationOutcome {
  readonly organisation: Organisation;
  readonly event: PendingAuditEvent;
}

function assertStorageQuota(bytes: number): number {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new InvariantViolation(
      `A storage quota must be a positive whole number of bytes, received ${bytes}.`,
      'INVALID_STORAGE_QUOTA',
    );
  }
  return bytes;
}

function assertProfile(profile: string): InstitutionalProfile {
  if (!(INSTITUTIONAL_PROFILES as readonly string[]).includes(profile)) {
    throw new InvariantViolation(
      `'${profile}' is not a recognised institutional profile. Choose one of: ${INSTITUTIONAL_PROFILES.join(', ')}.`,
      'INVALID_PROFILE',
    );
  }
  return profile as InstitutionalProfile;
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
  storageQuotaBytes?: number;
  profile?: string;
}): OrganisationOutcome {
  const organisation: Organisation = {
    id: input.id,
    name: assertName(input.name),
    storageQuotaBytes: assertStorageQuota(input.storageQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES),
    profile: assertProfile(input.profile ?? 'general'),
    createdAt: input.createdAt,
  };

  return {
    organisation,
    event: {
      action: 'organisation.created',
      actor: input.createdBy,
      metadata: { name: organisation.name, profile: organisation.profile },
    },
  };
}

/**
 * The operator override Flight 1 asks for: quota is per-tenant and
 * configurable, not a fixed global constant baked into enforcement. Any
 * positive value is accepted — the domain layer does not second-guess an
 * operator's judgement about what a specific institution needs, only that
 * the number itself is coherent.
 */
export function updateStorageQuota(
  organisation: Organisation,
  storageQuotaBytes: number,
  updatedBy: Actor,
): OrganisationOutcome {
  const validated = assertStorageQuota(storageQuotaBytes);

  return {
    organisation: { ...organisation, storageQuotaBytes: validated },
    event: {
      action: 'organisation.storage_quota_updated',
      actor: updatedBy,
      metadata: {
        from: String(organisation.storageQuotaBytes),
        to: String(validated),
      },
    },
  };
}
