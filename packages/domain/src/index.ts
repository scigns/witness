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
export * from './workspace.js';
export * from './membership.js';
export * from './user.js';
export * from './organisation-membership.js';
export * from './workspace-membership.js';
export * from './role.js';
export * from './role-assignment.js';
export * from './identity-link.js';
export * from './co-design-session.js';
export * from './session-participant.js';
export * from './consent-template.js';
export * from './session-consent-configuration.js';
export * from './participant-consent-record.js';
export * from './consent-decision.js';
export * from './evidence.js';
export * from './evidence-link.js';
export * from './evidence-attachment.js';
export * from './transcript.js';
export * from './session-summary.js';
export * from './review-assignment.js';
export * from './clarification.js';
export * from './outcome-support.js';
export * from './decision.js';
export * from './commitment.js';
export * from './action-item.js';
export * from './report.js';
export * from './report-source.js';
export * from './report-composition.js';
export * from './agenda-item.js';
export * from './resource.js';
export * from './commercial.js';
