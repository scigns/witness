/**
 * Tenant — the technical isolation boundary (ADR-0034), distinct from
 * `Organisation` (commercial and governance identity, `organisation.ts`).
 *
 * `Tenant` is deliberately minimal: today it carries only identity and a
 * label. It exists so that "which organisations share a technical
 * environment" can become a real, queryable fact later (a dedicated
 * environment for one institutional customer, or several small
 * organisations sharing one) without a schema migration when that need
 * arrives — not because that provisioning logic exists yet.
 */

import type { TenantId } from './ids.js';

export interface Tenant {
  readonly id: TenantId;
  readonly label: string;
  readonly createdAt: Date;
}

/**
 * The one place "which tenant is this organisation on" is resolved. Every
 * organisation's effective tenant is itself until an operator explicitly
 * assigns a `Tenant` row — this function is what makes that fallback a
 * single, named fact rather than logic re-derived at each call site.
 */
export function effectiveTenantId(organisation: {
  readonly id: string;
  readonly tenantId: string | null;
}): string {
  return organisation.tenantId ?? organisation.id;
}
