import { describe, expect, it } from 'vitest';

import {
  toActorId,
  toCoDesignSessionId,
  toEvidenceId,
  toEvidenceLinkId,
  toOrganisationId,
  toWorkspaceId,
} from './ids.js';
import type { Actor } from './actor.js';
import {
  createEvidenceLink,
  removeEvidenceLink,
  type LinkableEvidenceRef,
} from './evidence-link.js';

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const ORG_2 = toOrganisationId('29999999-9999-4999-8999-999999999999');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const WORKSPACE_2 = toWorkspaceId('39999999-9999-4999-8999-999999999999');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const SESSION_2 = toCoDesignSessionId('49999999-9999-4999-8999-999999999999');
const LINK_ID = toEvidenceLinkId('77777777-7777-4777-8777-777777777777');
const EVIDENCE_A = toEvidenceId('88888888-8888-4888-8888-888888888888');
const EVIDENCE_B = toEvidenceId('99999999-9999-4999-8999-999999999999');

function ref(overrides: Partial<LinkableEvidenceRef> = {}): LinkableEvidenceRef {
  return {
    id: EVIDENCE_A,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    ...overrides,
  };
}

describe('createEvidenceLink', () => {
  it('creates a link between two pieces of evidence in the same session', () => {
    const { link, event } = createEvidenceLink({
      id: LINK_ID,
      linkType: 'supports',
      from: ref({ id: EVIDENCE_A }),
      to: ref({ id: EVIDENCE_B }),
      createdBy: HUMAN,
      at: NOW,
    });
    expect(link.fromEvidenceId).toBe(EVIDENCE_A);
    expect(link.toEvidenceId).toBe(EVIDENCE_B);
    expect(link.linkType).toBe('supports');
    expect(event.action).toBe('evidence_link.created');
  });

  it('rejects an unrecognised link type', () => {
    expect(() =>
      createEvidenceLink({
        id: LINK_ID,
        linkType: 'not-a-real-type',
        from: ref({ id: EVIDENCE_A }),
        to: ref({ id: EVIDENCE_B }),
        createdBy: HUMAN,
        at: NOW,
      }),
    ).toThrow(/not a recognised evidence link type/i);
  });

  it('ATTACK — rejects linking evidence to itself', () => {
    expect(() =>
      createEvidenceLink({
        id: LINK_ID,
        linkType: 'related_to',
        from: ref({ id: EVIDENCE_A }),
        to: ref({ id: EVIDENCE_A }),
        createdBy: HUMAN,
        at: NOW,
      }),
    ).toThrow(/cannot be linked to itself/i);
  });

  it('ATTACK — rejects linking across organisations', () => {
    expect(() =>
      createEvidenceLink({
        id: LINK_ID,
        linkType: 'related_to',
        from: ref({ id: EVIDENCE_A }),
        to: ref({ id: EVIDENCE_B, organisationId: ORG_2 }),
        createdBy: HUMAN,
        at: NOW,
      }),
    ).toThrow(/cross organisations/i);
  });

  it('ATTACK — rejects linking across workspaces', () => {
    expect(() =>
      createEvidenceLink({
        id: LINK_ID,
        linkType: 'related_to',
        from: ref({ id: EVIDENCE_A }),
        to: ref({ id: EVIDENCE_B, workspaceId: WORKSPACE_2 }),
        createdBy: HUMAN,
        at: NOW,
      }),
    ).toThrow(/cross workspaces/i);
  });

  it('ATTACK — rejects linking across sessions', () => {
    expect(() =>
      createEvidenceLink({
        id: LINK_ID,
        linkType: 'related_to',
        from: ref({ id: EVIDENCE_A }),
        to: ref({ id: EVIDENCE_B, sessionId: SESSION_2 }),
        createdBy: HUMAN,
        at: NOW,
      }),
    ).toThrow(/cross sessions/i);
  });

  it('rejects a note over the maximum length', () => {
    expect(() =>
      createEvidenceLink({
        id: LINK_ID,
        linkType: 'related_to',
        from: ref({ id: EVIDENCE_A }),
        to: ref({ id: EVIDENCE_B }),
        note: 'x'.repeat(1001),
        createdBy: HUMAN,
        at: NOW,
      }),
    ).toThrow(/1000 characters or fewer/i);
  });
});

describe('removeEvidenceLink', () => {
  it('emits an evidence_link.removed audit event', () => {
    const { link } = createEvidenceLink({
      id: LINK_ID,
      linkType: 'duplicates',
      from: ref({ id: EVIDENCE_A }),
      to: ref({ id: EVIDENCE_B }),
      createdBy: HUMAN,
      at: NOW,
    });
    const event = removeEvidenceLink(link, HUMAN);
    expect(event.action).toBe('evidence_link.removed');
    expect(event.metadata['linkType']).toBe('duplicates');
  });
});
