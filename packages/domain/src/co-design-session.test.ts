/**
 * CoDesignSession domain tests (BUILD_ROADMAP.md Milestone 2).
 *
 * Kept in its own file rather than added to the existing `domain.test.ts`
 * monolith — that file already covers eight aggregates; a ninth belongs
 * beside the code it tests, the same reasoning `organisation.ts` and
 * `workspace.ts` share one file today but nothing requires every future
 * aggregate to keep joining it.
 */

import { describe, expect, it } from 'vitest';

import {
  archiveSession,
  canCaptureEvidence,
  canTransitionSession,
  changeSessionFacilitator,
  closeSession,
  createActor,
  createCoDesignSession,
  openSession,
  permittedSessionTransitions,
  reopenSession,
  scheduleSession,
  toActorId,
  toCoDesignSessionId,
  toOrganisationId,
  toUserId,
  toWorkspaceId,
  unscheduleSession,
  updateSessionDetails,
} from './index.js';

const HUMAN = createActor({
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'F. Acilitator',
});

const MODEL = createActor({
  id: toActorId('22222222-2222-4222-8222-222222222222'),
  kind: 'model',
  displayName: 'ollama/llama3.3:70b-instruct',
});

const ORGANISATION_ID = toOrganisationId('33333333-3333-4333-8333-333333333333');
const WORKSPACE_ID = toWorkspaceId('44444444-4444-4444-8444-444444444444');
const FACILITATOR_ID = toUserId('55555555-5555-4555-8555-555555555555');
const OTHER_FACILITATOR_ID = toUserId('66666666-6666-4666-8666-666666666666');
const NOW = new Date('2026-03-14T11:00:00Z');

function draftSession() {
  return createCoDesignSession({
    id: toCoDesignSessionId('77777777-7777-4777-8777-777777777777'),
    organisationId: ORGANISATION_ID,
    workspaceId: WORKSPACE_ID,
    title: 'Water access co-design workshop',
    purpose: 'Agree priorities for the next bore maintenance cycle.',
    sessionType: 'co_design_workshop',
    deliveryMode: 'in_person',
    primaryFacilitatorId: FACILITATOR_ID,
    createdBy: HUMAN,
    createdAt: NOW,
  }).session;
}

describe('creating a co-design session', () => {
  it('always starts as a draft, never scheduled or open', () => {
    const outcome = createCoDesignSession({
      id: toCoDesignSessionId('77777777-7777-4777-8777-777777777777'),
      organisationId: ORGANISATION_ID,
      workspaceId: WORKSPACE_ID,
      title: 'Water access co-design workshop',
      purpose: 'Agree priorities for the next bore maintenance cycle.',
      sessionType: 'co_design_workshop',
      deliveryMode: 'in_person',
      primaryFacilitatorId: FACILITATOR_ID,
      createdBy: HUMAN,
      createdAt: NOW,
    });

    expect(outcome.session.status).toBe('draft');
    expect(outcome.session.version).toBe(1);
    expect(outcome.session.consentConfigurationState).toBe('not_configured');
    expect(outcome.session.organisationId).toBe(ORGANISATION_ID);
    expect(outcome.session.workspaceId).toBe(WORKSPACE_ID);
    expect(outcome.event.action).toBe('co_design_session.created');
    expect(outcome.event.metadata['organisationId']).toBe(ORGANISATION_ID);
    expect(outcome.event.metadata['workspaceId']).toBe(WORKSPACE_ID);
  });

  it('rejects an empty title', () => {
    expect(() =>
      createCoDesignSession({
        id: toCoDesignSessionId('77777777-7777-4777-8777-777777777777'),
        organisationId: ORGANISATION_ID,
        workspaceId: WORKSPACE_ID,
        title: '   ',
        purpose: 'Agree priorities.',
        sessionType: 'co_design_workshop',
        deliveryMode: 'in_person',
        primaryFacilitatorId: FACILITATOR_ID,
        createdBy: HUMAN,
        createdAt: NOW,
      }),
    ).toThrow(/title/i);
  });

  it('rejects an empty purpose', () => {
    expect(() =>
      createCoDesignSession({
        id: toCoDesignSessionId('77777777-7777-4777-8777-777777777777'),
        organisationId: ORGANISATION_ID,
        workspaceId: WORKSPACE_ID,
        title: 'Water access co-design workshop',
        purpose: '   ',
        sessionType: 'co_design_workshop',
        deliveryMode: 'in_person',
        primaryFacilitatorId: FACILITATOR_ID,
        createdBy: HUMAN,
        createdAt: NOW,
      }),
    ).toThrow(/purpose/i);
  });

  it('accepts an organisation-defined session type, not limited to a fixed list', () => {
    const outcome = createCoDesignSession({
      id: toCoDesignSessionId('77777777-7777-4777-8777-777777777777'),
      organisationId: ORGANISATION_ID,
      workspaceId: WORKSPACE_ID,
      title: 'Talanoa on coastal erosion',
      purpose: 'Community-led discussion following the accepted cultural protocol.',
      sessionType: 'talanoa',
      deliveryMode: 'in_person',
      primaryFacilitatorId: FACILITATOR_ID,
      culturalProtocolNotes: 'Opens and closes with a shared meal; elders speak first.',
      createdBy: HUMAN,
      createdAt: NOW,
    });

    expect(outcome.session.sessionType).toBe('talanoa');
    expect(outcome.session.culturalProtocolNotes).toContain('elders speak first');
  });

  it('rejects more than the maximum number of supported languages', () => {
    expect(() =>
      createCoDesignSession({
        id: toCoDesignSessionId('77777777-7777-4777-8777-777777777777'),
        organisationId: ORGANISATION_ID,
        workspaceId: WORKSPACE_ID,
        title: 'Water access co-design workshop',
        purpose: 'Agree priorities.',
        sessionType: 'co_design_workshop',
        deliveryMode: 'in_person',
        primaryFacilitatorId: FACILITATOR_ID,
        supportedLanguages: Array.from({ length: 21 }, (_, i) => `lang-${i}`),
        createdBy: HUMAN,
        createdAt: NOW,
      }),
    ).toThrow(/languages/i);
  });

  it('defaults participant visibility to facilitators-only — the safer default', () => {
    expect(draftSession().participantVisibility).toBe('facilitators_only');
  });
});

describe('lifecycle transitions', () => {
  it('permits draft -> scheduled -> open -> closed -> archived', () => {
    expect(canTransitionSession('draft', 'scheduled')).toBe(true);
    expect(canTransitionSession('scheduled', 'open')).toBe(true);
    expect(canTransitionSession('open', 'closed')).toBe(true);
    expect(canTransitionSession('closed', 'archived')).toBe(true);
  });

  it('permits draft -> open directly, and scheduled -> draft', () => {
    expect(canTransitionSession('draft', 'open')).toBe(true);
    expect(canTransitionSession('scheduled', 'draft')).toBe(true);
  });

  it('rejects opening an archived session — archived is terminal', () => {
    expect(canTransitionSession('archived', 'open')).toBe(false);
    expect(permittedSessionTransitions('archived')).toEqual([]);
  });

  it('rejects skipping straight from scheduled or open to archived', () => {
    expect(canTransitionSession('scheduled', 'archived')).toBe(false);
    expect(canTransitionSession('open', 'archived')).toBe(false);
  });

  it('opens a draft session directly', () => {
    const outcome = openSession(draftSession(), HUMAN, NOW);
    expect(outcome.session.status).toBe('open');
    expect(outcome.session.openedAt).toEqual(NOW);
    expect(outcome.event.action).toBe('co_design_session.opened');
  });

  it('schedules a draft session, setting status and start time together', () => {
    const startAt = new Date('2026-04-01T09:00:00Z');
    const endAt = new Date('2026-04-01T12:00:00Z');
    const outcome = scheduleSession(
      draftSession(),
      HUMAN,
      { startAt, endAt, timezone: 'Pacific/Auckland' },
      NOW,
    );

    expect(outcome.session.status).toBe('scheduled');
    expect(outcome.session.startAt).toEqual(startAt);
    expect(outcome.session.timezone).toBe('Pacific/Auckland');
    expect(outcome.event.action).toBe('co_design_session.scheduled');
  });

  it('rejects an end time before the start time', () => {
    const startAt = new Date('2026-04-01T09:00:00Z');
    const endAt = new Date('2026-04-01T08:00:00Z');
    expect(() =>
      scheduleSession(draftSession(), HUMAN, { startAt, endAt, timezone: null }, NOW),
    ).toThrow(/after its start/i);
  });

  it('moves a scheduled session back to draft', () => {
    const scheduled = scheduleSession(
      draftSession(),
      HUMAN,
      { startAt: new Date('2026-04-01T09:00:00Z'), endAt: null, timezone: null },
      NOW,
    ).session;

    const outcome = unscheduleSession(scheduled, HUMAN, NOW);
    expect(outcome.session.status).toBe('draft');
  });

  it('ATTACK — rejects unscheduling a session that is not scheduled', () => {
    expect(() => unscheduleSession(draftSession(), HUMAN, NOW)).toThrow(/from 'draft'/i);
  });

  it('closes an open session', () => {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const outcome = closeSession(open, HUMAN, NOW);
    expect(outcome.session.status).toBe('closed');
    expect(outcome.session.closedAt).toEqual(NOW);
  });

  it('ATTACK — rejects closing a session that is not open', () => {
    expect(() => closeSession(draftSession(), HUMAN, NOW)).toThrow(
      /INVALID_SESSION_TRANSITION|to 'closed'/i,
    );
  });

  it('archives a closed session, and the archived session is terminal', () => {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const closed = closeSession(open, HUMAN, NOW).session;
    const outcome = archiveSession(closed, HUMAN, NOW);

    expect(outcome.session.status).toBe('archived');
    expect(outcome.session.archivedAt).toEqual(NOW);
    expect(permittedSessionTransitions(outcome.session.status)).toEqual([]);
  });

  it('ATTACK — rejects archiving a session that is not closed', () => {
    expect(() => archiveSession(draftSession(), HUMAN, NOW)).toThrow(/to 'archived'/i);
  });

  it("ATTACK — rejects opening a closed session through openSession — that path must go through reopenSession's human-actor and stated-reason guard", () => {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const closed = closeSession(open, HUMAN, NOW).session;
    expect(() => openSession(closed, HUMAN, NOW)).toThrow(/from 'closed'/i);
  });

  it('ATTACK — rejects reopening a session that was never closed', () => {
    expect(() => reopenSession(draftSession(), HUMAN, 'Reason.', NOW)).toThrow(
      /reopen a session from 'draft'/i,
    );

    const scheduled = scheduleSession(
      draftSession(),
      HUMAN,
      { startAt: new Date('2026-04-01T09:00:00Z'), endAt: null, timezone: null },
      NOW,
    ).session;
    expect(() => reopenSession(scheduled, HUMAN, 'Reason.', NOW)).toThrow(
      /reopen a session from 'scheduled'/i,
    );
  });

  it('reopens a closed session with a stated reason, clearing closedAt', () => {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const closed = closeSession(open, HUMAN, NOW).session;

    const outcome = reopenSession(
      closed,
      HUMAN,
      'Facilitator identified an unresolved agenda item.',
      NOW,
    );

    expect(outcome.session.status).toBe('open');
    expect(outcome.session.closedAt).toBeNull();
    expect(outcome.event.action).toBe('co_design_session.reopened');
    expect(outcome.event.metadata['reason']).toContain('unresolved agenda item');
  });

  it('ATTACK — rejects reopening without a reason', () => {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const closed = closeSession(open, HUMAN, NOW).session;
    expect(() => reopenSession(closed, HUMAN, '   ', NOW)).toThrow(/reason/i);
  });

  it('ATTACK — a model actor cannot reopen a session — reversing "the workshop ended" is an institutional decision', () => {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const closed = closeSession(open, HUMAN, NOW).session;
    expect(() => reopenSession(closed, MODEL, 'Needs more discussion.', NOW)).toThrow(/human/i);
  });

  it('ATTACK — rejects reopening an archived session — archived is terminal, not "closed again"', () => {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const closed = closeSession(open, HUMAN, NOW).session;
    const archived = archiveSession(closed, HUMAN, NOW).session;
    expect(() => reopenSession(archived, HUMAN, 'Reason.', NOW)).toThrow(
      /reopen a session from 'archived'/i,
    );
  });
});

describe('archived sessions are read-only', () => {
  function archivedSession() {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const closed = closeSession(open, HUMAN, NOW).session;
    return archiveSession(closed, HUMAN, NOW).session;
  }

  it('ATTACK — rejects updating an archived session', () => {
    expect(() =>
      updateSessionDetails(archivedSession(), HUMAN, { title: 'New title' }, NOW),
    ).toThrow(/read-only/i);
  });

  it('ATTACK — rejects changing the facilitator of an archived session', () => {
    expect(() =>
      changeSessionFacilitator(archivedSession(), HUMAN, OTHER_FACILITATOR_ID, NOW),
    ).toThrow(/read-only/i);
  });
});

describe('updating session details', () => {
  it('updates only the fields provided, and records which fields changed', () => {
    const outcome = updateSessionDetails(
      draftSession(),
      HUMAN,
      { title: 'Renamed workshop', culturalProtocolNotes: 'Opens with karakia.' },
      NOW,
    );

    expect(outcome.session.title).toBe('Renamed workshop');
    expect(outcome.session.culturalProtocolNotes).toBe('Opens with karakia.');
    expect(outcome.session.purpose).toBe(draftSession().purpose);
    expect(outcome.event.metadata['changedFields']).toBe('title,culturalProtocolNotes');
  });

  it('bumps the version on every update — the optimistic-concurrency counter', () => {
    const session = draftSession();
    const outcome = updateSessionDetails(session, HUMAN, { title: 'Renamed' }, NOW);
    expect(outcome.session.version).toBe(session.version + 1);
  });

  it('rejects a no-op update', () => {
    expect(() => updateSessionDetails(draftSession(), HUMAN, {}, NOW)).toThrow(
      /at least one field/i,
    );
  });

  it('permits updating an open session — facilitators correct details mid-session', () => {
    const open = openSession(draftSession(), HUMAN, NOW).session;
    const outcome = updateSessionDetails(open, HUMAN, { location: 'Community hall' }, NOW);
    expect(outcome.session.location).toBe('Community hall');
  });
});

describe('changing the primary facilitator', () => {
  it('reassigns the facilitator and audits it distinctly from a general update', () => {
    const outcome = changeSessionFacilitator(draftSession(), HUMAN, OTHER_FACILITATOR_ID, NOW);
    expect(outcome.session.primaryFacilitatorId).toBe(OTHER_FACILITATOR_ID);
    expect(outcome.event.action).toBe('co_design_session.facilitator_changed');
    expect(outcome.event.metadata['from']).toBe(FACILITATOR_ID);
    expect(outcome.event.metadata['to']).toBe(OTHER_FACILITATOR_ID);
  });

  it('ATTACK — rejects "changing" the facilitator to the same person', () => {
    expect(() => changeSessionFacilitator(draftSession(), HUMAN, FACILITATOR_ID, NOW)).toThrow(
      /must differ/i,
    );
  });
});

describe('evidence capture eligibility', () => {
  it('is derived from status, not stored: only an open session accepts capture', () => {
    const draft = draftSession();
    expect(canCaptureEvidence(draft)).toBe(false);

    const open = openSession(draft, HUMAN, NOW).session;
    expect(canCaptureEvidence(open)).toBe(true);

    const closed = closeSession(open, HUMAN, NOW).session;
    expect(canCaptureEvidence(closed)).toBe(false);
  });
});
