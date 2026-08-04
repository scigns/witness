import { describe, expect, it } from 'vitest';

import {
  toActorId,
  toCoDesignSessionId,
  toConsentTemplateId,
  toOrganisationId,
  toParticipantConsentRecordId,
  toSessionParticipantId,
  toWorkspaceId,
} from './ids.js';
import type { Actor } from './actor.js';
import {
  captureParticipantConsent,
  participantConsentRecordStatus,
  supersedeConsentRecord,
  withdrawParticipantConsent,
  type ParticipantConsentRecord,
} from './participant-consent-record.js';

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');
const EARLIER = new Date('2026-03-01T10:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const PARTICIPANT = toSessionParticipantId('55555555-5555-4555-8555-555555555555');
const TEMPLATE = toConsentTemplateId('66666666-6666-4666-8666-666666666666');
const RECORD_ID = toParticipantConsentRecordId('77777777-7777-4777-8777-777777777777');
const RECORD_ID_2 = toParticipantConsentRecordId('88888888-8888-4888-8888-888888888888');

const REQUIRED = ['participation'];
const OPTIONAL = ['audio_recording', 'photography'];

function baseInput() {
  return {
    id: RECORD_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    participantId: PARTICIPANT,
    consentTemplateId: TEMPLATE,
    templateVersion: 1,
    categoryDecisions: [{ category: 'participation', granted: true }],
    requiredCategories: REQUIRED,
    optionalCategories: OPTIONAL,
    captureMethod: 'in-person verbal',
    capturedBy: HUMAN,
    at: NOW,
  };
}

function grantedRecord(): ParticipantConsentRecord {
  return captureParticipantConsent({
    ...baseInput(),
    categoryDecisions: [
      { category: 'participation', granted: true },
      { category: 'audio_recording', granted: true },
      { category: 'photography', granted: true },
    ],
  }).record;
}

describe('captureParticipantConsent', () => {
  it('creates a record with computed status metadata', () => {
    const { record, event } = captureParticipantConsent({
      ...baseInput(),
      categoryDecisions: [
        { category: 'participation', granted: true },
        { category: 'audio_recording', granted: false },
      ],
    });
    expect(record.version).toBe(1);
    expect(event.action).toBe('participant_consent_record.captured');
    expect(event.metadata['status']).toBe('partially_granted');
    expect(event.metadata['amendsRecordId']).toBe('');
  });

  it('rejects an empty set of category decisions', () => {
    expect(() => captureParticipantConsent({ ...baseInput(), categoryDecisions: [] })).toThrow(
      /at least one category decision/i,
    );
  });

  it('rejects a category not in the required/optional lists', () => {
    expect(() =>
      captureParticipantConsent({
        ...baseInput(),
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'video_recording', granted: true },
        ],
      }),
    ).toThrow(/not part of this session's consent configuration/i);
  });

  it('rejects a duplicate category decision within one record', () => {
    expect(() =>
      captureParticipantConsent({
        ...baseInput(),
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'participation', granted: false },
        ],
      }),
    ).toThrow(/more than once/i);
  });

  it('records an amendsRecordId when supplied', () => {
    const { record } = captureParticipantConsent({
      ...baseInput(),
      id: RECORD_ID_2,
      amendsRecordId: RECORD_ID,
    });
    expect(record.amendsRecordId).toBe(RECORD_ID);
  });
});

describe('participantConsentRecordStatus', () => {
  it('is granted when every required and optional category is granted', () => {
    expect(participantConsentRecordStatus(grantedRecord(), REQUIRED, NOW)).toBe('granted');
  });

  it('is partially_granted when required categories are granted but an optional one is not', () => {
    const record = captureParticipantConsent({
      ...baseInput(),
      categoryDecisions: [
        { category: 'participation', granted: true },
        { category: 'audio_recording', granted: false },
      ],
    }).record;
    expect(participantConsentRecordStatus(record, REQUIRED, NOW)).toBe('partially_granted');
  });

  it('is refused when a required category is refused', () => {
    const record = captureParticipantConsent({
      ...baseInput(),
      categoryDecisions: [{ category: 'participation', granted: false }],
    }).record;
    expect(participantConsentRecordStatus(record, REQUIRED, NOW)).toBe('refused');
  });

  it('is refused when a required category was never decided', () => {
    const record = captureParticipantConsent({
      ...baseInput(),
      categoryDecisions: [{ category: 'audio_recording', granted: true }],
      requiredCategories: [],
      optionalCategories: ['audio_recording'],
    }).record;
    expect(participantConsentRecordStatus(record, REQUIRED, NOW)).toBe('refused');
  });

  it('is withdrawn regardless of category decisions once withdrawn', () => {
    const withdrawn = withdrawParticipantConsent(grantedRecord(), HUMAN, null, LATER).record;
    expect(participantConsentRecordStatus(withdrawn, REQUIRED, LATER)).toBe('withdrawn');
  });

  it('is superseded regardless of category decisions once superseded', () => {
    const superseded = supersedeConsentRecord(grantedRecord(), RECORD_ID_2, HUMAN, LATER).record;
    expect(participantConsentRecordStatus(superseded, REQUIRED, LATER)).toBe('superseded');
  });

  it('is expired once past its expiresAt, even if all categories were granted', () => {
    const record = captureParticipantConsent({
      ...baseInput(),
      categoryDecisions: [{ category: 'participation', granted: true }],
      expiresAt: NOW,
    }).record;
    expect(participantConsentRecordStatus(record, REQUIRED, LATER)).toBe('expired');
    expect(participantConsentRecordStatus(record, REQUIRED, EARLIER)).toBe('granted');
  });

  it('checks withdrawn before superseded before expired', () => {
    const superseded = supersedeConsentRecord(grantedRecord(), RECORD_ID_2, HUMAN, LATER).record;
    const withdrawnAndSuperseded = withdrawParticipantConsent(
      superseded,
      HUMAN,
      null,
      LATER,
    ).record;
    expect(participantConsentRecordStatus(withdrawnAndSuperseded, REQUIRED, LATER)).toBe(
      'withdrawn',
    );
  });
});

describe('supersedeConsentRecord', () => {
  it('marks the record superseded by the replacement', () => {
    const { record, event } = supersedeConsentRecord(grantedRecord(), RECORD_ID_2, HUMAN, LATER);
    expect(record.supersededByRecordId).toBe(RECORD_ID_2);
    expect(record.version).toBe(2);
    expect(event.action).toBe('participant_consent_record.superseded');
  });

  it('ATTACK — rejects superseding an already-withdrawn record', () => {
    const withdrawn = withdrawParticipantConsent(grantedRecord(), HUMAN, null, LATER).record;
    expect(() => supersedeConsentRecord(withdrawn, RECORD_ID_2, HUMAN, LATER)).toThrow(
      /already been withdrawn|cannot be superseded/i,
    );
  });

  it('ATTACK — rejects superseding an already-superseded record', () => {
    const superseded = supersedeConsentRecord(grantedRecord(), RECORD_ID_2, HUMAN, LATER).record;
    expect(() =>
      supersedeConsentRecord(
        superseded,
        toParticipantConsentRecordId('99999999-9999-4999-8999-999999999999'),
        HUMAN,
        LATER,
      ),
    ).toThrow(/already been superseded/i);
  });
});

describe('withdrawParticipantConsent', () => {
  it('sets withdrawnAt and an optional reason', () => {
    const { record, event } = withdrawParticipantConsent(
      grantedRecord(),
      HUMAN,
      'Participant changed their mind.',
      LATER,
    );
    expect(record.withdrawnAt).toEqual(LATER);
    expect(record.withdrawalReason).toBe('Participant changed their mind.');
    expect(record.version).toBe(2);
    expect(event.action).toBe('participant_consent_record.withdrawn');
    expect(event.metadata['reason']).toBe('Participant changed their mind.');
  });

  it('omits the reason from audit metadata when none is given', () => {
    const { event } = withdrawParticipantConsent(grantedRecord(), HUMAN, null, LATER);
    expect(event.metadata['reason']).toBeUndefined();
  });

  it('ATTACK — rejects withdrawing an already-withdrawn record', () => {
    const withdrawn = withdrawParticipantConsent(grantedRecord(), HUMAN, null, LATER).record;
    expect(() => withdrawParticipantConsent(withdrawn, HUMAN, null, LATER)).toThrow(
      /already been withdrawn/i,
    );
  });

  it('there is no restore function — re-granting requires a fresh capture, not an undo', () => {
    const withdrawn = withdrawParticipantConsent(grantedRecord(), HUMAN, null, LATER).record;
    const fresh = captureParticipantConsent({
      ...baseInput(),
      id: RECORD_ID_2,
      amendsRecordId: withdrawn.id,
      categoryDecisions: [{ category: 'participation', granted: true }],
      at: LATER,
    }).record;
    expect(fresh.withdrawnAt).toBeNull();
    expect(fresh.amendsRecordId).toBe(withdrawn.id);
  });
});
