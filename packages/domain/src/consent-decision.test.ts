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
  withdrawParticipantConsent,
} from './participant-consent-record.js';
import {
  mayAttributeQuotation,
  mayFollowUp,
  mayIncludeInKnowledgeGraph,
  mayParticipate,
  mayPhotograph,
  mayProcessWithAi,
  mayPublish,
  mayQuoteAnonymously,
  mayRecordAudio,
  mayRecordVideo,
  mayReportExternally,
  mayReuseInFuture,
  mayTranscribe,
  mayUseCategory,
  mayUseForResearch,
  mayUseInternally,
  resolveActiveConsentRecord,
  type ConsentDecisionContext,
} from './consent-decision.js';

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const PARTICIPANT = toSessionParticipantId('55555555-5555-4555-8555-555555555555');
const TEMPLATE = toConsentTemplateId('66666666-6666-4666-8666-666666666666');
const RECORD_ID = toParticipantConsentRecordId('77777777-7777-4777-8777-777777777777');
const RECORD_ID_2 = toParticipantConsentRecordId('88888888-8888-4888-8888-888888888888');

const REQUIRED = ['participation'];
const OPTIONAL = [
  'audio_recording',
  'video_recording',
  'photography',
  'transcription',
  'ai_processing',
  'attributed_quotation',
  'anonymous_quotation',
  'internal_use',
  'external_reporting',
  'publication',
  'research_use',
  'future_reuse',
  'knowledge_graph_inclusion',
  'follow_up_contact',
  'custom_thing',
];

function record(overrides: {
  id?: typeof RECORD_ID;
  categoryDecisions: { category: string; granted: boolean }[];
  at?: Date;
  expiresAt?: Date | null;
}) {
  return captureParticipantConsent({
    id: overrides.id ?? RECORD_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    participantId: PARTICIPANT,
    consentTemplateId: TEMPLATE,
    templateVersion: 1,
    categoryDecisions: overrides.categoryDecisions,
    requiredCategories: REQUIRED,
    optionalCategories: OPTIONAL,
    captureMethod: 'in-person verbal',
    capturedBy: HUMAN,
    at: overrides.at ?? NOW,
    expiresAt: overrides.expiresAt ?? null,
  }).record;
}

function contextFor(records: ReturnType<typeof record>[], now: Date = NOW): ConsentDecisionContext {
  return { records, requiredCategories: REQUIRED, now };
}

describe('resolveActiveConsentRecord', () => {
  it('returns null when there are no records', () => {
    expect(resolveActiveConsentRecord([], NOW)).toBeNull();
  });

  it('returns the sole active record', () => {
    const r = record({ categoryDecisions: [{ category: 'participation', granted: true }] });
    expect(resolveActiveConsentRecord([r], NOW)).toBe(r);
  });

  it('excludes a withdrawn record', () => {
    const r = record({ categoryDecisions: [{ category: 'participation', granted: true }] });
    const withdrawn = withdrawParticipantConsent(r, HUMAN, null, LATER).record;
    expect(resolveActiveConsentRecord([withdrawn], LATER)).toBeNull();
  });

  it('excludes a superseded record', () => {
    const r = record({ categoryDecisions: [{ category: 'participation', granted: true }] });
    const superseded = {
      ...r,
      supersededByRecordId: RECORD_ID_2,
    };
    expect(resolveActiveConsentRecord([superseded], NOW)).toBeNull();
  });

  it('excludes an expired record', () => {
    const r = record({
      categoryDecisions: [{ category: 'participation', granted: true }],
      expiresAt: NOW,
    });
    expect(resolveActiveConsentRecord([r], LATER)).toBeNull();
  });

  it('picks the most recently captured record when more than one is somehow active', () => {
    const older = record({
      categoryDecisions: [{ category: 'participation', granted: false }],
      at: NOW,
    });
    const newer = record({
      id: RECORD_ID_2,
      categoryDecisions: [{ category: 'participation', granted: true }],
      at: LATER,
    });
    expect(resolveActiveConsentRecord([older, newer], LATER)).toBe(newer);
  });
});

describe('mayParticipate', () => {
  it('is allowed when participation was granted', () => {
    const r = record({ categoryDecisions: [{ category: 'participation', granted: true }] });
    expect(mayParticipate(contextFor([r])).allowed).toBe(true);
  });

  it('fails closed when participation was refused', () => {
    const r = record({ categoryDecisions: [{ category: 'participation', granted: false }] });
    expect(mayParticipate(contextFor([r])).allowed).toBe(false);
  });

  it('fails closed when no record exists at all', () => {
    expect(mayParticipate(contextFor([])).allowed).toBe(false);
  });

  it('fails closed when participation was never decided in the active record', () => {
    const r = record({ categoryDecisions: [{ category: 'audio_recording', granted: true }] });
    expect(mayParticipate(contextFor([r])).allowed).toBe(false);
  });
});

describe('category questions are gated on participation', () => {
  it('ATTACK — a category granted in the record is still denied if participation itself was refused', () => {
    const r = record({
      categoryDecisions: [
        { category: 'participation', granted: false },
        { category: 'audio_recording', granted: true },
      ],
    });
    const answer = mayRecordAudio(contextFor([r]));
    expect(answer.allowed).toBe(false);
    expect(answer.reason).toMatch(/participation is not consented/i);
  });

  it('allows a category when both participation and the category are granted', () => {
    const r = record({
      categoryDecisions: [
        { category: 'participation', granted: true },
        { category: 'audio_recording', granted: true },
      ],
    });
    expect(mayRecordAudio(contextFor([r])).allowed).toBe(true);
  });
});

describe('each of the fourteen dependent category questions', () => {
  const fullyGranted = record({
    categoryDecisions: [
      { category: 'participation', granted: true },
      ...OPTIONAL.filter((c) => c !== 'custom_thing').map((category) => ({
        category,
        granted: true,
      })),
    ],
  });
  const context = contextFor([fullyGranted]);

  it.each([
    ['audio_recording', mayRecordAudio],
    ['video_recording', mayRecordVideo],
    ['photography', mayPhotograph],
    ['transcription', mayTranscribe],
    ['ai_processing', mayProcessWithAi],
    ['attributed_quotation', mayAttributeQuotation],
    ['anonymous_quotation', mayQuoteAnonymously],
    ['internal_use', mayUseInternally],
    ['external_reporting', mayReportExternally],
    ['publication', mayPublish],
    ['research_use', mayUseForResearch],
    ['future_reuse', mayReuseInFuture],
    ['knowledge_graph_inclusion', mayIncludeInKnowledgeGraph],
    ['follow_up_contact', mayFollowUp],
  ] as const)('%s is allowed once granted', (_category, fn) => {
    expect(fn(context).allowed).toBe(true);
  });
});

describe('mayUseCategory', () => {
  it('answers for an organisation-defined category beyond the well-known fifteen', () => {
    const r = record({
      categoryDecisions: [
        { category: 'participation', granted: true },
        { category: 'custom_thing', granted: true },
      ],
    });
    expect(mayUseCategory(contextFor([r]), 'custom_thing').allowed).toBe(true);
  });

  it('fails closed for an organisation-defined category that was refused', () => {
    const r = record({
      categoryDecisions: [
        { category: 'participation', granted: true },
        { category: 'custom_thing', granted: false },
      ],
    });
    expect(mayUseCategory(contextFor([r]), 'custom_thing').allowed).toBe(false);
  });
});
