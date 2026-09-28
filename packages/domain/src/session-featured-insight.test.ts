import { describe, expect, it } from 'vitest';

import { createActor } from './actor.js';
import { InvariantViolation } from './errors.js';
import {
  toActorId,
  toCoDesignSessionId,
  toKnowledgeAssertionId,
  toOrganisationId,
  toSessionFeaturedInsightId,
  toWorkspaceId,
} from './ids.js';
import {
  featureInsightForSession,
  isCurrentlyFeatured,
  unfeatureInsight,
  type FeatureInsightForSessionInput,
} from './session-featured-insight.js';

const organisationId = toOrganisationId('11111111-1111-4111-8111-111111111111');
const workspaceId = toWorkspaceId('22222222-2222-4222-8222-222222222222');
const sessionId = toCoDesignSessionId('33333333-3333-4333-8333-333333333333');
const knowledgeAssertionId = toKnowledgeAssertionId('44444444-4444-4444-8444-444444444444');
const insightId = toSessionFeaturedInsightId('55555555-5555-4555-8555-555555555555');
const at = new Date('2026-09-26T00:00:00.000Z');

const facilitator = createActor({
  id: toActorId('66666666-6666-4666-8666-666666666666'),
  kind: 'human',
  displayName: 'Test Facilitator',
});

const modelActor = createActor({
  id: toActorId('77777777-7777-4777-8777-777777777777'),
  kind: 'model',
  displayName: 'ollama/llama3.3:70b-instruct',
});

function feature(overrides: Partial<FeatureInsightForSessionInput> = {}, alreadyFeatured = false) {
  return featureInsightForSession(
    {
      id: insightId,
      organisationId,
      workspaceId,
      sessionId,
      knowledgeAssertionId,
      displayOrder: 0,
      curatedBy: facilitator,
      at,
      ...overrides,
    },
    alreadyFeatured,
  );
}

describe('featureInsightForSession', () => {
  it('features a confirmed assertion for a session', () => {
    const { insight } = feature();
    expect(insight.knowledgeAssertionId).toBe(knowledgeAssertionId);
    expect(insight.removedAt).toBeNull();
    expect(isCurrentlyFeatured(insight)).toBe(true);
  });

  it('emits a session_featured_insight.added audit event', () => {
    const { event } = feature();
    expect(event.action).toBe('session_featured_insight.added');
    expect(event.actor).toBe(facilitator);
  });

  it('refuses a machine actor — only a human facilitator may curate', () => {
    expect(() => feature({ curatedBy: modelActor })).toThrow(InvariantViolation);
  });

  it('refuses to feature the same assertion twice for one session', () => {
    expect(() => feature({}, true)).toThrow(InvariantViolation);
  });

  it('rejects a negative display order', () => {
    expect(() => feature({ displayOrder: -1 })).toThrow(InvariantViolation);
  });
});

describe('unfeatureInsight', () => {
  it('marks an insight removed without deleting it', () => {
    const { insight } = feature();
    const { insight: removed } = unfeatureInsight(insight, facilitator, at);
    expect(removed.removedAt).toBe(at);
    expect(removed.removedBy).toBe(facilitator);
    expect(isCurrentlyFeatured(removed)).toBe(false);
    // Retained, not deleted — every other field survives.
    expect(removed.knowledgeAssertionId).toBe(insight.knowledgeAssertionId);
  });

  it('emits a session_featured_insight.removed audit event', () => {
    const { insight } = feature();
    const { event } = unfeatureInsight(insight, facilitator, at);
    expect(event.action).toBe('session_featured_insight.removed');
  });

  it('refuses a machine actor', () => {
    const { insight } = feature();
    expect(() => unfeatureInsight(insight, modelActor, at)).toThrow(InvariantViolation);
  });

  it('refuses to remove an already-removed insight', () => {
    const { insight } = feature();
    const { insight: removed } = unfeatureInsight(insight, facilitator, at);
    expect(() => unfeatureInsight(removed, facilitator, at)).toThrow(InvariantViolation);
  });
});
