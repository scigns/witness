/**
 * Licence-boundary drift check.
 *
 * `@witness/contracts` is Apache-2.0 and `@witness/domain` is GPL-3.0-or-later.
 * Apache-2.0 code may be consumed by GPL code, never the reverse (ADR-0002), so
 * `contracts` cannot import the domain's unions — it declares its own copies.
 *
 * Two declarations of the same thing drift. This test is the only reason they
 * will not: it lives in the API service, which already depends on both, and so is
 * the one place the comparison can legally be made.
 *
 * If this fails, do not "fix" it by loosening the assertion. Update whichever
 * side is wrong, and check whether an API consumer needs a contract version bump.
 */

import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_STATES as CONTRACT_ACCOUNT_STATES,
  ACTOR_KINDS as CONTRACT_ACTOR_KINDS,
  CLARIFICATION_STATUSES as CONTRACT_CLARIFICATION_STATUSES,
  CONSENT_TEMPLATE_STATUSES as CONTRACT_CONSENT_TEMPLATE_STATUSES,
  EVIDENCE_CORRECTION_TYPES as CONTRACT_EVIDENCE_CORRECTION_TYPES,
  MEMBERSHIP_STATES as CONTRACT_MEMBERSHIP_STATES,
  PARTICIPANT_ATTENDANCE_STATUSES as CONTRACT_PARTICIPANT_ATTENDANCE_STATUSES,
  PARTICIPANT_CONSENT_RECORD_STATUSES as CONTRACT_PARTICIPANT_CONSENT_RECORD_STATUSES,
  PARTICIPANT_CONSENT_STATUS_SUMMARIES as CONTRACT_PARTICIPANT_CONSENT_STATUS_SUMMARIES,
  PARTICIPANT_IDENTITY_MODES as CONTRACT_PARTICIPANT_IDENTITY_MODES,
  PARTICIPANT_IDENTITY_VISIBILITIES as CONTRACT_PARTICIPANT_IDENTITY_VISIBILITIES,
  PARTICIPANT_INVITATION_STATUSES as CONTRACT_PARTICIPANT_INVITATION_STATUSES,
  PARTICIPATION_MODES as CONTRACT_PARTICIPATION_MODES,
  REVIEW_ASSIGNMENT_STATUSES as CONTRACT_REVIEW_ASSIGNMENT_STATUSES,
  REVIEW_STATES as CONTRACT_REVIEW_STATES,
  SESSION_CONSENT_CONFIGURATION_STATES as CONTRACT_SESSION_CONSENT_CONFIGURATION_STATES,
  SESSION_CONSENT_CONFIGURATION_STATUSES as CONTRACT_SESSION_CONSENT_CONFIGURATION_STATUSES,
  SESSION_DELIVERY_MODES as CONTRACT_SESSION_DELIVERY_MODES,
  SESSION_PARTICIPANT_VISIBILITIES as CONTRACT_SESSION_PARTICIPANT_VISIBILITIES,
  SESSION_STATUSES as CONTRACT_SESSION_STATUSES,
  SOURCE_KINDS as CONTRACT_SOURCE_KINDS,
  WITNESS_ROLES as CONTRACT_WITNESS_ROLES,
} from '@witness/contracts';
import {
  ACCOUNT_STATES as DOMAIN_ACCOUNT_STATES,
  ACTOR_KINDS as DOMAIN_ACTOR_KINDS,
  CLARIFICATION_STATUSES as DOMAIN_CLARIFICATION_STATUSES,
  CONSENT_TEMPLATE_STATUSES as DOMAIN_CONSENT_TEMPLATE_STATUSES,
  EVIDENCE_CORRECTION_TYPES as DOMAIN_EVIDENCE_CORRECTION_TYPES,
  MEMBERSHIP_STATES as DOMAIN_MEMBERSHIP_STATES,
  PARTICIPANT_ATTENDANCE_STATUSES as DOMAIN_PARTICIPANT_ATTENDANCE_STATUSES,
  PARTICIPANT_CONSENT_RECORD_STATUSES as DOMAIN_PARTICIPANT_CONSENT_RECORD_STATUSES,
  PARTICIPANT_CONSENT_STATUS_SUMMARIES as DOMAIN_PARTICIPANT_CONSENT_STATUS_SUMMARIES,
  PARTICIPANT_IDENTITY_MODES as DOMAIN_PARTICIPANT_IDENTITY_MODES,
  PARTICIPANT_IDENTITY_VISIBILITIES as DOMAIN_PARTICIPANT_IDENTITY_VISIBILITIES,
  PARTICIPANT_INVITATION_STATUSES as DOMAIN_PARTICIPANT_INVITATION_STATUSES,
  PARTICIPATION_MODES as DOMAIN_PARTICIPATION_MODES,
  REVIEW_ASSIGNMENT_STATUSES as DOMAIN_REVIEW_ASSIGNMENT_STATUSES,
  REVIEW_STATES as DOMAIN_REVIEW_STATES,
  SESSION_CONSENT_CONFIGURATION_STATES as DOMAIN_SESSION_CONSENT_CONFIGURATION_STATES,
  SESSION_CONSENT_CONFIGURATION_STATUSES as DOMAIN_SESSION_CONSENT_CONFIGURATION_STATUSES,
  SESSION_DELIVERY_MODES as DOMAIN_SESSION_DELIVERY_MODES,
  SESSION_PARTICIPANT_VISIBILITIES as DOMAIN_SESSION_PARTICIPANT_VISIBILITIES,
  SESSION_STATUSES as DOMAIN_SESSION_STATUSES,
  SOURCE_KINDS as DOMAIN_SOURCE_KINDS,
  WITNESS_ROLES as DOMAIN_WITNESS_ROLES,
} from '@witness/domain';

describe('contracts and domain agree across the licence boundary', () => {
  it('review states are identical', () => {
    expect([...CONTRACT_REVIEW_STATES].sort()).toEqual([...DOMAIN_REVIEW_STATES].sort());
  });

  it('source kinds are identical', () => {
    expect([...CONTRACT_SOURCE_KINDS].sort()).toEqual([...DOMAIN_SOURCE_KINDS].sort());
  });

  it('actor kinds are identical', () => {
    expect([...CONTRACT_ACTOR_KINDS].sort()).toEqual([...DOMAIN_ACTOR_KINDS].sort());
  });

  it('account states are identical', () => {
    expect([...CONTRACT_ACCOUNT_STATES].sort()).toEqual([...DOMAIN_ACCOUNT_STATES].sort());
  });

  it('membership states are identical', () => {
    expect([...CONTRACT_MEMBERSHIP_STATES].sort()).toEqual([...DOMAIN_MEMBERSHIP_STATES].sort());
  });

  it('Witness roles are identical', () => {
    expect([...CONTRACT_WITNESS_ROLES].sort()).toEqual([...DOMAIN_WITNESS_ROLES].sort());
  });

  it('session statuses are identical', () => {
    expect([...CONTRACT_SESSION_STATUSES].sort()).toEqual([...DOMAIN_SESSION_STATUSES].sort());
  });

  it('session delivery modes are identical', () => {
    expect([...CONTRACT_SESSION_DELIVERY_MODES].sort()).toEqual(
      [...DOMAIN_SESSION_DELIVERY_MODES].sort(),
    );
  });

  it('session participant visibilities are identical', () => {
    expect([...CONTRACT_SESSION_PARTICIPANT_VISIBILITIES].sort()).toEqual(
      [...DOMAIN_SESSION_PARTICIPANT_VISIBILITIES].sort(),
    );
  });

  it('session consent configuration states are identical', () => {
    expect([...CONTRACT_SESSION_CONSENT_CONFIGURATION_STATES].sort()).toEqual(
      [...DOMAIN_SESSION_CONSENT_CONFIGURATION_STATES].sort(),
    );
  });

  it('participant identity modes are identical', () => {
    expect([...CONTRACT_PARTICIPANT_IDENTITY_MODES].sort()).toEqual(
      [...DOMAIN_PARTICIPANT_IDENTITY_MODES].sort(),
    );
  });

  it('participant identity visibilities are identical', () => {
    expect([...CONTRACT_PARTICIPANT_IDENTITY_VISIBILITIES].sort()).toEqual(
      [...DOMAIN_PARTICIPANT_IDENTITY_VISIBILITIES].sort(),
    );
  });

  it('participation modes are identical', () => {
    expect([...CONTRACT_PARTICIPATION_MODES].sort()).toEqual(
      [...DOMAIN_PARTICIPATION_MODES].sort(),
    );
  });

  it('participant invitation statuses are identical', () => {
    expect([...CONTRACT_PARTICIPANT_INVITATION_STATUSES].sort()).toEqual(
      [...DOMAIN_PARTICIPANT_INVITATION_STATUSES].sort(),
    );
  });

  it('participant attendance statuses are identical', () => {
    expect([...CONTRACT_PARTICIPANT_ATTENDANCE_STATUSES].sort()).toEqual(
      [...DOMAIN_PARTICIPANT_ATTENDANCE_STATUSES].sort(),
    );
  });

  it('participant consent status summaries are identical', () => {
    expect([...CONTRACT_PARTICIPANT_CONSENT_STATUS_SUMMARIES].sort()).toEqual(
      [...DOMAIN_PARTICIPANT_CONSENT_STATUS_SUMMARIES].sort(),
    );
  });

  it('consent template statuses are identical', () => {
    expect([...CONTRACT_CONSENT_TEMPLATE_STATUSES].sort()).toEqual(
      [...DOMAIN_CONSENT_TEMPLATE_STATUSES].sort(),
    );
  });

  it('session consent configuration statuses are identical', () => {
    expect([...CONTRACT_SESSION_CONSENT_CONFIGURATION_STATUSES].sort()).toEqual(
      [...DOMAIN_SESSION_CONSENT_CONFIGURATION_STATUSES].sort(),
    );
  });

  it('participant consent record statuses are identical', () => {
    expect([...CONTRACT_PARTICIPANT_CONSENT_RECORD_STATUSES].sort()).toEqual(
      [...DOMAIN_PARTICIPANT_CONSENT_RECORD_STATUSES].sort(),
    );
  });

  it('evidence correction types are identical', () => {
    expect([...CONTRACT_EVIDENCE_CORRECTION_TYPES].sort()).toEqual(
      [...DOMAIN_EVIDENCE_CORRECTION_TYPES].sort(),
    );
  });

  it('review assignment statuses are identical', () => {
    expect([...CONTRACT_REVIEW_ASSIGNMENT_STATUSES].sort()).toEqual(
      [...DOMAIN_REVIEW_ASSIGNMENT_STATUSES].sort(),
    );
  });

  it('clarification statuses are identical', () => {
    expect([...CONTRACT_CLARIFICATION_STATUSES].sort()).toEqual(
      [...DOMAIN_CLARIFICATION_STATUSES].sort(),
    );
  });
});
