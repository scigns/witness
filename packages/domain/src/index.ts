/**
 * @witness/domain — the pure domain model.
 *
 * This package imports nothing but the standard library and other domain code
 * (ADR-0003). No NestJS, no Prisma, no HTTP, no filesystem, no system clock, no
 * random source. Time, identity and hashing are injected as arguments.
 *
 * The rule is enforced by `scripts/ci/check-domain-purity.sh` rather than by
 * reviewer memory, because reviewer memory is where architecture goes to die.
 */

export * from './errors.js';
export * from './ids.js';
export * from './actor.js';
export * from './provenance.js';
export * from './review.js';
export * from './audit.js';
export * from './record.js';
export * from './organisation.js';
