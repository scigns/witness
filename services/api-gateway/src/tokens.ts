/**
 * Dependency injection tokens.
 *
 * `WitnessConfig` is an interface, so it cannot be its own token — interfaces do
 * not survive compilation. A named symbol keeps the binding explicit and greppable.
 */

export const WITNESS_CONFIG = Symbol.for('witness.config');
