/**
 * Provenance — principle P3, "provenance or it did not happen".
 *
 * Every institutional record traces back to a source, captured at a time, by a
 * named actor. In the full system this chain extends to a source utterance at a
 * timestamp in a recording under a consent grant (ADR-0012). The Developer
 * Preview implements the part of that chain that exists today and does not
 * pretend to the rest — `consentGrantId` is optional here and becomes mandatory
 * when the consent service lands in Phase 3.
 *
 * The rule this file exists to enforce: a record cannot be constructed without
 * provenance. Not "should not" — cannot. There is no code path that produces an
 * InstitutionalRecord with a null provenance, which is why the guarantee is worth
 * making in the first place.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { SourceId } from './ids.js';

export const SOURCE_KINDS = ['meeting', 'document', 'correspondence', 'manual_entry'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface Source {
  readonly id: SourceId;
  readonly kind: SourceKind;
  /** Human-meaningful description: "Water Committee, 14 March 2026". */
  readonly label: string;
  /** When the source material was created — not when it was ingested. */
  readonly occurredAt: Date;
}

export interface Provenance {
  readonly source: Source;
  /** Who captured this into Witness. */
  readonly capturedBy: Actor;
  /** When Witness recorded it. Distinct from `source.occurredAt`. */
  readonly capturedAt: Date;
  /**
   * Consent grant authorising processing (P2).
   *
   * Optional in the Developer Preview because the consent service does not exist
   * yet (Phase 3, roadmap 3.4). It is declared here rather than added later so
   * that the shape of the obligation is visible now, and so the compiler will
   * point at every call site on the day it becomes mandatory.
   */
  readonly consentGrantId?: string;
}

export function createSource(input: {
  id: SourceId;
  kind: SourceKind;
  label: string;
  occurredAt: Date;
}): Source {
  const label = input.label.trim();

  if (label.length === 0) {
    throw new InvariantViolation(
      'A source must have a label. An unlabelled source cannot be found again by a human.',
      'SOURCE_LABEL_REQUIRED',
    );
  }

  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new InvariantViolation('Source occurredAt is not a valid date.', 'INVALID_DATE');
  }

  return { id: input.id, kind: input.kind, label, occurredAt: input.occurredAt };
}

export function createProvenance(input: {
  source: Source;
  capturedBy: Actor;
  capturedAt: Date;
  consentGrantId?: string | undefined;
}): Provenance {
  if (Number.isNaN(input.capturedAt.getTime())) {
    throw new InvariantViolation('Provenance capturedAt is not a valid date.', 'INVALID_DATE');
  }

  // Capture cannot precede the thing being captured. This catches timezone
  // handling errors at the boundary, where they are cheap, instead of surfacing
  // years later as a record that appears to have been filed before the meeting
  // it describes took place.
  if (input.capturedAt.getTime() < input.source.occurredAt.getTime()) {
    throw new InvariantViolation(
      'A record cannot be captured before its source occurred.',
      'CAPTURE_PRECEDES_SOURCE',
    );
  }

  return {
    source: input.source,
    capturedBy: input.capturedBy,
    capturedAt: input.capturedAt,
    ...(input.consentGrantId !== undefined ? { consentGrantId: input.consentGrantId } : {}),
  };
}
