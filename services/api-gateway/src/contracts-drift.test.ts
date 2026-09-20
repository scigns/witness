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
  ACTION_ITEM_PRIORITIES as CONTRACT_ACTION_ITEM_PRIORITIES,
  ACTION_ITEM_STATUSES as CONTRACT_ACTION_ITEM_STATUSES,
  ACTOR_KINDS as CONTRACT_ACTOR_KINDS,
  CLARIFICATION_STATUSES as CONTRACT_CLARIFICATION_STATUSES,
  COMMITMENT_STATUSES as CONTRACT_COMMITMENT_STATUSES,
  DECISION_STATUSES as CONTRACT_DECISION_STATUSES,
  CONSENT_TEMPLATE_STATUSES as CONTRACT_CONSENT_TEMPLATE_STATUSES,
  EVIDENCE_CORRECTION_TYPES as CONTRACT_EVIDENCE_CORRECTION_TYPES,
  MEMBERSHIP_STATES as CONTRACT_MEMBERSHIP_STATES,
  OUTCOME_SUPPORT_BASES as CONTRACT_OUTCOME_SUPPORT_BASES,
  OUTCOME_TYPES as CONTRACT_OUTCOME_TYPES,
  PARTICIPANT_ATTENDANCE_STATUSES as CONTRACT_PARTICIPANT_ATTENDANCE_STATUSES,
  PARTICIPANT_CONSENT_RECORD_STATUSES as CONTRACT_PARTICIPANT_CONSENT_RECORD_STATUSES,
  PARTICIPANT_CONSENT_STATUS_SUMMARIES as CONTRACT_PARTICIPANT_CONSENT_STATUS_SUMMARIES,
  PARTICIPANT_IDENTITY_MODES as CONTRACT_PARTICIPANT_IDENTITY_MODES,
  PARTICIPANT_IDENTITY_VISIBILITIES as CONTRACT_PARTICIPANT_IDENTITY_VISIBILITIES,
  PARTICIPANT_INVITATION_STATUSES as CONTRACT_PARTICIPANT_INVITATION_STATUSES,
  PARTICIPATION_MODES as CONTRACT_PARTICIPATION_MODES,
  REPORT_ATTRIBUTION_LABELS as CONTRACT_REPORT_ATTRIBUTION_LABELS,
  REPORT_AUDIENCES as CONTRACT_REPORT_AUDIENCES,
  REPORT_SOURCE_TYPES as CONTRACT_REPORT_SOURCE_TYPES,
  REPORT_STATUSES as CONTRACT_REPORT_STATUSES,
  REVIEW_ASSIGNMENT_STATUSES as CONTRACT_REVIEW_ASSIGNMENT_STATUSES,
  REVIEW_STATES as CONTRACT_REVIEW_STATES,
  SESSION_CONSENT_CONFIGURATION_STATES as CONTRACT_SESSION_CONSENT_CONFIGURATION_STATES,
  SESSION_CONSENT_CONFIGURATION_STATUSES as CONTRACT_SESSION_CONSENT_CONFIGURATION_STATUSES,
  SESSION_DELIVERY_MODES as CONTRACT_SESSION_DELIVERY_MODES,
  SESSION_PARTICIPANT_VISIBILITIES as CONTRACT_SESSION_PARTICIPANT_VISIBILITIES,
  SESSION_STATUSES as CONTRACT_SESSION_STATUSES,
  SOURCE_KINDS as CONTRACT_SOURCE_KINDS,
  WITNESS_ROLES as CONTRACT_WITNESS_ROLES,
  KNOWLEDGE_ENTITY_TYPES as CONTRACT_KNOWLEDGE_ENTITY_TYPES,
  TOPIC_SCHEMES as CONTRACT_TOPIC_SCHEMES,
  SENSITIVITY_CLASSES as CONTRACT_SENSITIVITY_CLASSES,
  CANDIDATE_ASSERTION_TYPES as CONTRACT_CANDIDATE_ASSERTION_TYPES,
  CANDIDATE_ASSERTION_STATUSES as CONTRACT_CANDIDATE_ASSERTION_STATUSES,
  KNOWLEDGE_REVIEW_DECISIONS as CONTRACT_KNOWLEDGE_REVIEW_DECISIONS,
  ASSERTION_LIFECYCLE_STATES as CONTRACT_ASSERTION_LIFECYCLE_STATES,
  PERSPECTIVE_TAGS as CONTRACT_PERSPECTIVE_TAGS,
} from '@witness/contracts';
import {
  ACCOUNT_STATES as DOMAIN_ACCOUNT_STATES,
  ACTION_ITEM_PRIORITIES as DOMAIN_ACTION_ITEM_PRIORITIES,
  ACTION_ITEM_STATUSES as DOMAIN_ACTION_ITEM_STATUSES,
  ACTOR_KINDS as DOMAIN_ACTOR_KINDS,
  CLARIFICATION_STATUSES as DOMAIN_CLARIFICATION_STATUSES,
  COMMITMENT_STATUSES as DOMAIN_COMMITMENT_STATUSES,
  DECISION_STATUSES as DOMAIN_DECISION_STATUSES,
  CONSENT_TEMPLATE_STATUSES as DOMAIN_CONSENT_TEMPLATE_STATUSES,
  EVIDENCE_CORRECTION_TYPES as DOMAIN_EVIDENCE_CORRECTION_TYPES,
  MEMBERSHIP_STATES as DOMAIN_MEMBERSHIP_STATES,
  OUTCOME_SUPPORT_BASES as DOMAIN_OUTCOME_SUPPORT_BASES,
  OUTCOME_TYPES as DOMAIN_OUTCOME_TYPES,
  PARTICIPANT_ATTENDANCE_STATUSES as DOMAIN_PARTICIPANT_ATTENDANCE_STATUSES,
  PARTICIPANT_CONSENT_RECORD_STATUSES as DOMAIN_PARTICIPANT_CONSENT_RECORD_STATUSES,
  PARTICIPANT_CONSENT_STATUS_SUMMARIES as DOMAIN_PARTICIPANT_CONSENT_STATUS_SUMMARIES,
  PARTICIPANT_IDENTITY_MODES as DOMAIN_PARTICIPANT_IDENTITY_MODES,
  PARTICIPANT_IDENTITY_VISIBILITIES as DOMAIN_PARTICIPANT_IDENTITY_VISIBILITIES,
  PARTICIPANT_INVITATION_STATUSES as DOMAIN_PARTICIPANT_INVITATION_STATUSES,
  PARTICIPATION_MODES as DOMAIN_PARTICIPATION_MODES,
  REPORT_ATTRIBUTION_LABELS as DOMAIN_REPORT_ATTRIBUTION_LABELS,
  REPORT_AUDIENCES as DOMAIN_REPORT_AUDIENCES,
  REPORT_SOURCE_TYPES as DOMAIN_REPORT_SOURCE_TYPES,
  REPORT_STATUSES as DOMAIN_REPORT_STATUSES,
  REVIEW_ASSIGNMENT_STATUSES as DOMAIN_REVIEW_ASSIGNMENT_STATUSES,
  REVIEW_STATES as DOMAIN_REVIEW_STATES,
  SESSION_CONSENT_CONFIGURATION_STATES as DOMAIN_SESSION_CONSENT_CONFIGURATION_STATES,
  SESSION_CONSENT_CONFIGURATION_STATUSES as DOMAIN_SESSION_CONSENT_CONFIGURATION_STATUSES,
  SESSION_DELIVERY_MODES as DOMAIN_SESSION_DELIVERY_MODES,
  SESSION_PARTICIPANT_VISIBILITIES as DOMAIN_SESSION_PARTICIPANT_VISIBILITIES,
  SESSION_STATUSES as DOMAIN_SESSION_STATUSES,
  SOURCE_KINDS as DOMAIN_SOURCE_KINDS,
  WITNESS_ROLES as DOMAIN_WITNESS_ROLES,
  KNOWLEDGE_ENTITY_TYPES as DOMAIN_KNOWLEDGE_ENTITY_TYPES,
  TOPIC_SCHEMES as DOMAIN_TOPIC_SCHEMES,
  SENSITIVITY_CLASSES as DOMAIN_SENSITIVITY_CLASSES,
  CANDIDATE_ASSERTION_TYPES as DOMAIN_CANDIDATE_ASSERTION_TYPES,
  CANDIDATE_ASSERTION_STATUSES as DOMAIN_CANDIDATE_ASSERTION_STATUSES,
  KNOWLEDGE_REVIEW_DECISIONS as DOMAIN_KNOWLEDGE_REVIEW_DECISIONS,
  ASSERTION_LIFECYCLE_STATES as DOMAIN_ASSERTION_LIFECYCLE_STATES,
  PERSPECTIVE_TAGS as DOMAIN_PERSPECTIVE_TAGS,
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

  it('decision statuses are identical', () => {
    expect([...CONTRACT_DECISION_STATUSES].sort()).toEqual([...DOMAIN_DECISION_STATUSES].sort());
  });

  it('commitment statuses are identical', () => {
    expect([...CONTRACT_COMMITMENT_STATUSES].sort()).toEqual(
      [...DOMAIN_COMMITMENT_STATUSES].sort(),
    );
  });

  it('action item statuses are identical', () => {
    expect([...CONTRACT_ACTION_ITEM_STATUSES].sort()).toEqual(
      [...DOMAIN_ACTION_ITEM_STATUSES].sort(),
    );
  });

  it('action item priorities are identical', () => {
    expect([...CONTRACT_ACTION_ITEM_PRIORITIES].sort()).toEqual(
      [...DOMAIN_ACTION_ITEM_PRIORITIES].sort(),
    );
  });

  it('outcome types are identical', () => {
    expect([...CONTRACT_OUTCOME_TYPES].sort()).toEqual([...DOMAIN_OUTCOME_TYPES].sort());
  });

  it('outcome support bases are identical', () => {
    expect([...CONTRACT_OUTCOME_SUPPORT_BASES].sort()).toEqual(
      [...DOMAIN_OUTCOME_SUPPORT_BASES].sort(),
    );
  });

  it('report statuses are identical', () => {
    expect([...CONTRACT_REPORT_STATUSES].sort()).toEqual([...DOMAIN_REPORT_STATUSES].sort());
  });

  it('report audiences are identical', () => {
    expect([...CONTRACT_REPORT_AUDIENCES].sort()).toEqual([...DOMAIN_REPORT_AUDIENCES].sort());
  });

  it('report source types are identical', () => {
    expect([...CONTRACT_REPORT_SOURCE_TYPES].sort()).toEqual(
      [...DOMAIN_REPORT_SOURCE_TYPES].sort(),
    );
  });

  it('report attribution labels are identical', () => {
    expect([...CONTRACT_REPORT_ATTRIBUTION_LABELS].sort()).toEqual(
      [...DOMAIN_REPORT_ATTRIBUTION_LABELS].sort(),
    );
  });

  it('knowledge entity types are identical', () => {
    expect([...CONTRACT_KNOWLEDGE_ENTITY_TYPES].sort()).toEqual(
      [...DOMAIN_KNOWLEDGE_ENTITY_TYPES].sort(),
    );
  });

  it('topic schemes are identical', () => {
    expect([...CONTRACT_TOPIC_SCHEMES].sort()).toEqual([...DOMAIN_TOPIC_SCHEMES].sort());
  });

  it('sensitivity classes are identical', () => {
    expect([...CONTRACT_SENSITIVITY_CLASSES].sort()).toEqual(
      [...DOMAIN_SENSITIVITY_CLASSES].sort(),
    );
  });

  it('candidate assertion types are identical', () => {
    expect([...CONTRACT_CANDIDATE_ASSERTION_TYPES].sort()).toEqual(
      [...DOMAIN_CANDIDATE_ASSERTION_TYPES].sort(),
    );
  });

  it('candidate assertion statuses are identical', () => {
    expect([...CONTRACT_CANDIDATE_ASSERTION_STATUSES].sort()).toEqual(
      [...DOMAIN_CANDIDATE_ASSERTION_STATUSES].sort(),
    );
  });

  it('knowledge review decisions are identical', () => {
    expect([...CONTRACT_KNOWLEDGE_REVIEW_DECISIONS].sort()).toEqual(
      [...DOMAIN_KNOWLEDGE_REVIEW_DECISIONS].sort(),
    );
  });

  it('assertion lifecycle states are identical', () => {
    expect([...CONTRACT_ASSERTION_LIFECYCLE_STATES].sort()).toEqual(
      [...DOMAIN_ASSERTION_LIFECYCLE_STATES].sort(),
    );
  });

  it('perspective tags are identical', () => {
    expect([...CONTRACT_PERSPECTIVE_TAGS].sort()).toEqual([...DOMAIN_PERSPECTIVE_TAGS].sort());
  });
});
