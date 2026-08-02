/**
 * Actors — who did something.
 *
 * The distinction between a human and a machine actor is load-bearing, not
 * descriptive. Principle P4 states that AI extraction produces *candidates* and
 * that candidates require human confirmation before becoming institutional
 * record. That rule is only enforceable if the domain can tell the difference,
 * so `kind` is part of the type rather than a column somebody remembers to check.
 */

import { InvariantViolation } from './errors.js';
import type { ActorId } from './ids.js';

export const ACTOR_KINDS = ['human', 'model', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface Actor {
  readonly id: ActorId;
  /**
   * `human`  — a person, authenticated through the identity provider (ADR-0007)
   * `model`  — an inference run; `displayName` carries the model and version
   * `system` — automated platform action with no model involved (retention sweep)
   */
  readonly kind: ActorKind;
  /** Shown in provenance. For a model this MUST identify the version (P3). */
  readonly displayName: string;
}

export function isHuman(actor: Actor): boolean {
  return actor.kind === 'human';
}

export function createActor(input: { id: ActorId; kind: ActorKind; displayName: string }): Actor {
  const displayName = input.displayName.trim();

  if (displayName.length === 0) {
    throw new InvariantViolation(
      'An actor must have a display name — provenance that names nobody is not provenance.',
      'ACTOR_NAME_REQUIRED',
    );
  }

  // A model actor whose name does not carry a version makes every assertion it
  // produced unreproducible: "extracted by llama3.3" cannot be re-run, compared,
  // or corrected when a later version behaves differently. P3 requires the
  // named model *version*, so an unversioned model actor is rejected here rather
  // than discovered years later when someone tries to audit an extraction.
  if (input.kind === 'model' && !/[:@]|\bv?\d/.test(displayName)) {
    throw new InvariantViolation(
      `A model actor must carry its version, received '${displayName}'. ` +
        'Example: "ollama/llama3.3:70b-instruct".',
      'MODEL_VERSION_REQUIRED',
    );
  }

  return { id: input.id, kind: input.kind, displayName };
}
