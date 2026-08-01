/**
 * Domain errors.
 *
 * These are thrown when an invariant would be violated. They are deliberately
 * distinct from HTTP or database errors: the domain layer knows nothing about
 * transports or storage (ADR-0003), so an adapter is responsible for translating
 * these into whatever its protocol requires.
 */

/** Base class for every violation of a domain rule. */
export class DomainError extends Error {
  public override readonly name: string = 'DomainError';

  constructor(
    message: string,
    /** Stable machine-readable code. Safe to expose; contains no user data. */
    public readonly code: string,
  ) {
    super(message);
  }
}

/** A value failed validation before an aggregate could be constructed. */
export class InvariantViolation extends DomainError {
  public override readonly name = 'InvariantViolation';

  constructor(message: string, code = 'INVARIANT_VIOLATION') {
    super(message, code);
  }
}

/**
 * A review state transition was attempted that the state machine does not permit.
 *
 * Carries the attempted transition so an operator can see what was tried without
 * needing to reproduce it.
 */
export class IllegalTransition extends DomainError {
  public override readonly name = 'IllegalTransition';

  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot move a record from '${from}' to '${to}'.`, 'ILLEGAL_TRANSITION');
  }
}

/**
 * Principle P4 — the machine proposes, the human disposes.
 *
 * Thrown when a non-human actor attempts to confirm a candidate assertion into
 * the institutional record. This is enforced in the domain rather than at the API
 * boundary precisely so it cannot be bypassed by adding a new adapter.
 */
export class HumanConfirmationRequired extends DomainError {
  public override readonly name = 'HumanConfirmationRequired';

  constructor(actorKind: string) {
    super(
      `An actor of kind '${actorKind}' cannot confirm a record. ` +
        'Confirmation into the institutional record requires a human (principle P4).',
      'HUMAN_CONFIRMATION_REQUIRED',
    );
  }
}
