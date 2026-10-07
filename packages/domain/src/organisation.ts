/**
 * Organisation — the commercial and governance identity (BUILD_ROADMAP.md,
 * Release 0.2, item 1). The *technical* isolation boundary is `Tenant`
 * (`tenant.ts`, ADR-0034) — a distinct, related concept; see that file for
 * how the two relate and why they are not the same thing.
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
import type { OrganisationId, TenantId } from './ids.js';

/** The maximum length of an organisation name. */
const NAME_MAX = 200;

/**
 * 5 GiB — the fallback of last resort only, used when neither an explicit
 * override nor a resolvable commercial resource profile exists (e.g. an
 * organisation with no subscription at all). Not a marketing figure and not
 * read by any plan-facing code — `services/api-gateway/src/organisations/
 * storage-quota.service.ts` resolves the real default from the
 * organisation's effective `ResourceProfile` (commercial-runtime-readiness
 * work), data-driven per plan rather than hard-coded here.
 */
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
  /**
   * `null` means "no explicit platform-admin override" — the organisation's
   * effective quota is resolved live from its commercial ResourceProfile
   * (`StorageQuotaService.usage()`), so a plan change is reflected
   * immediately. A non-null value is a negotiated override that takes
   * precedence over the plan default until explicitly cleared.
   */
  readonly storageQuotaBytes: number | null;
  readonly profile: InstitutionalProfile;
  /**
   * The explicit technical-isolation `Tenant` this organisation is assigned
   * to, if any (ADR-0034). `null` means "no explicit assignment" — use
   * `effectiveTenantId` (`tenant.ts`), never this field directly, to decide
   * which tenant an organisation is actually on.
   */
  readonly tenantId: TenantId | null;
  readonly createdAt: Date;
}

export interface OrganisationOutcome {
  readonly organisation: Organisation;
  readonly event: PendingAuditEvent;
}

function assertStorageQuota(bytes: number | null): number | null {
  if (bytes === null) return null;
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
  /**
   * Omitted (or explicitly `null`) by default so a new organisation
   * inherits its plan's live resource-profile quota rather than a figure
   * frozen at creation time. Pass a number only for an immediate negotiated
   * override.
   */
  storageQuotaBytes?: number | null;
  profile?: string;
}): OrganisationOutcome {
  const organisation: Organisation = {
    id: input.id,
    name: assertName(input.name),
    storageQuotaBytes: assertStorageQuota(input.storageQuotaBytes ?? null),
    profile: assertProfile(input.profile ?? 'general'),
    tenantId: null,
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
 * The platform-admin override quota is per-tenant and configurable, not a
 * fixed global constant baked into enforcement. Any positive value is
 * accepted — the domain layer does not second-guess an administrator's
 * judgement about what a specific institution needs, only that the number
 * itself is coherent. Passing `null` clears the override, reverting the
 * organisation to its plan's live resource-profile default.
 */
export function updateStorageQuota(
  organisation: Organisation,
  storageQuotaBytes: number | null,
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
