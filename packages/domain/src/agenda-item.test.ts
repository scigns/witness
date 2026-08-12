import { describe, expect, it } from 'vitest';

import type { Actor } from './actor.js';
import {
  createAgendaItem,
  reorderAgendaItem,
  transitionAgendaItemStatus,
  updateAgendaItem,
} from './agenda-item.js';
import { InvariantViolation } from './errors.js';
import { toActorId, toAgendaItemId, toWorkspaceId } from './ids.js';

const ACTOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A Facilitator',
};
const WORKSPACE_ID = toWorkspaceId('22222222-2222-4222-8222-222222222222');
const ITEM_ID = toAgendaItemId('33333333-3333-4333-8333-333333333333');
const NOW = new Date('2026-08-12T00:00:00.000Z');

function baseInput() {
  return {
    id: ITEM_ID,
    workspaceId: WORKSPACE_ID,
    title: 'Welcome and introductions',
    sortOrder: 0,
    createdBy: ACTOR,
    createdAt: NOW,
  };
}

describe('createAgendaItem', () => {
  it('creates an item in upcoming status', () => {
    const outcome = createAgendaItem(baseInput());

    expect(outcome.item.status).toBe('upcoming');
    expect(outcome.item.title).toBe('Welcome and introductions');
    expect(outcome.event.action).toBe('agenda_item.created');
  });

  it('rejects a blank title', () => {
    expect(() => createAgendaItem({ ...baseInput(), title: '   ' })).toThrow(InvariantViolation);
  });

  it('rejects a non-positive duration', () => {
    expect(() => createAgendaItem({ ...baseInput(), durationMinutes: 0 })).toThrow(
      InvariantViolation,
    );
  });

  it('defaults optional fields to null', () => {
    const outcome = createAgendaItem(baseInput());

    expect(outcome.item.description).toBeNull();
    expect(outcome.item.sessionId).toBeNull();
    expect(outcome.item.facilitatorId).toBeNull();
  });
});

describe('updateAgendaItem', () => {
  it('changes only the fields provided', () => {
    const created = createAgendaItem(baseInput()).item;
    const outcome = updateAgendaItem(created, { description: 'Kicking things off' }, ACTOR, NOW);

    expect(outcome.item.title).toBe(created.title);
    expect(outcome.item.description).toBe('Kicking things off');
    expect(outcome.event.action).toBe('agenda_item.updated');
  });

  it('clears a field when explicitly set to null', () => {
    const created = createAgendaItem({ ...baseInput(), description: 'Original' }).item;
    const outcome = updateAgendaItem(created, { description: null }, ACTOR, NOW);

    expect(outcome.item.description).toBeNull();
  });
});

describe('transitionAgendaItemStatus', () => {
  it('moves an item to current', () => {
    const created = createAgendaItem(baseInput()).item;
    const outcome = transitionAgendaItemStatus(created, 'current', ACTOR, NOW);

    expect(outcome.item.status).toBe('current');
    expect(outcome.event.action).toBe('agenda_item.status_changed');
    expect(outcome.event.metadata['from']).toBe('upcoming');
    expect(outcome.event.metadata['to']).toBe('current');
  });
});

describe('reorderAgendaItem', () => {
  it('changes the sort order', () => {
    const created = createAgendaItem(baseInput()).item;
    const outcome = reorderAgendaItem(created, 5, ACTOR, NOW);

    expect(outcome.item.sortOrder).toBe(5);
    expect(outcome.event.action).toBe('agenda_item.reordered');
  });
});
