/**
 * Identifiers.
 *
 * Branded string types rather than raw `string`, so that passing a RecordId where
 * an ActorId is expected is a compile error rather than a runtime mystery. This
 * costs a cast at the boundary and catches a whole class of defect that is
 * otherwise only found in production.
 *
 * Identifier *generation* is not here. The domain layer must not read the clock
 * or a random source (ADR-0003) — both are injected as ports, so that a test can
 * make time and identity deterministic.
 */

import { InvariantViolation } from './errors.js';

declare const brand: unique symbol;

type Branded<T, B> = T & { readonly [brand]: B };

export type RecordId = Branded<string, 'RecordId'>;
export type ActorId = Branded<string, 'ActorId'>;
export type SourceId = Branded<string, 'SourceId'>;
export type AuditEventId = Branded<string, 'AuditEventId'>;
export type OrganisationId = Branded<string, 'OrganisationId'>;

/**
 * UUID v4/v7 shape. We accept both: v7 is time-ordered, which matters for the
 * append-only audit log, while existing v4 identifiers must keep validating.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, kind: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new InvariantViolation(`${kind} must be a UUID, received '${value}'.`, 'INVALID_ID');
  }
}

export function toRecordId(value: string): RecordId {
  assertUuid(value, 'RecordId');
  return value as RecordId;
}

export function toActorId(value: string): ActorId {
  assertUuid(value, 'ActorId');
  return value as ActorId;
}

export function toSourceId(value: string): SourceId {
  assertUuid(value, 'SourceId');
  return value as SourceId;
}

export function toAuditEventId(value: string): AuditEventId {
  assertUuid(value, 'AuditEventId');
  return value as AuditEventId;
}

export function toOrganisationId(value: string): OrganisationId {
  assertUuid(value, 'OrganisationId');
  return value as OrganisationId;
}
