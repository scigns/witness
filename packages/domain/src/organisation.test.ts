import { describe, expect, it } from 'vitest';

import { InvariantViolation } from './errors.js';
import {
  createOrganisation,
  updateStorageQuota,
  DEFAULT_STORAGE_QUOTA_BYTES,
  type Organisation,
} from './organisation.js';
import { toActorId, toOrganisationId } from './ids.js';
import type { Actor } from './actor.js';

const ACTOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'An Operator',
};
const NOW = new Date('2026-08-14T00:00:00Z');

describe('createOrganisation', () => {
  it('defaults storageQuotaBytes to the Flight 1 included allowance (5 GiB)', () => {
    const outcome = createOrganisation({
      id: toOrganisationId('22222222-2222-4222-8222-222222222222'),
      name: 'Test Institution',
      createdBy: ACTOR,
      createdAt: NOW,
    });

    expect(outcome.organisation.storageQuotaBytes).toBe(DEFAULT_STORAGE_QUOTA_BYTES);
    expect(DEFAULT_STORAGE_QUOTA_BYTES).toBe(5 * 1024 * 1024 * 1024);
  });

  it('accepts an explicit storage quota, overriding the default', () => {
    const outcome = createOrganisation({
      id: toOrganisationId('22222222-2222-4222-8222-222222222222'),
      name: 'Test Institution',
      createdBy: ACTOR,
      createdAt: NOW,
      storageQuotaBytes: 1024,
    });

    expect(outcome.organisation.storageQuotaBytes).toBe(1024);
  });

  it('rejects a non-positive storage quota', () => {
    expect(() =>
      createOrganisation({
        id: toOrganisationId('22222222-2222-4222-8222-222222222222'),
        name: 'Test Institution',
        createdBy: ACTOR,
        createdAt: NOW,
        storageQuotaBytes: 0,
      }),
    ).toThrow(InvariantViolation);
  });

  it('requires a name', () => {
    expect(() =>
      createOrganisation({
        id: toOrganisationId('22222222-2222-4222-8222-222222222222'),
        name: '   ',
        createdBy: ACTOR,
        createdAt: NOW,
      }),
    ).toThrow(/must have a name/i);
  });

  it('defaults the profile to "general"', () => {
    const outcome = createOrganisation({
      id: toOrganisationId('22222222-2222-4222-8222-222222222222'),
      name: 'Test Institution',
      createdBy: ACTOR,
      createdAt: NOW,
    });

    expect(outcome.organisation.profile).toBe('general');
  });

  it('accepts a recognised institutional profile', () => {
    const outcome = createOrganisation({
      id: toOrganisationId('22222222-2222-4222-8222-222222222222'),
      name: 'Test Institution',
      createdBy: ACTOR,
      createdAt: NOW,
      profile: 'church',
    });

    expect(outcome.organisation.profile).toBe('church');
    expect(outcome.event.metadata).toMatchObject({ profile: 'church' });
  });

  it('rejects an unrecognised profile', () => {
    expect(() =>
      createOrganisation({
        id: toOrganisationId('22222222-2222-4222-8222-222222222222'),
        name: 'Test Institution',
        createdBy: ACTOR,
        createdAt: NOW,
        profile: 'not-a-real-profile',
      }),
    ).toThrow(InvariantViolation);
  });
});

describe('updateStorageQuota', () => {
  const existing: Organisation = {
    id: toOrganisationId('22222222-2222-4222-8222-222222222222'),
    name: 'Test Institution',
    storageQuotaBytes: DEFAULT_STORAGE_QUOTA_BYTES,
    profile: 'general',
    createdAt: NOW,
  };

  it('replaces the quota and records an audit event with the from/to values', () => {
    const outcome = updateStorageQuota(existing, 10 * 1024 * 1024 * 1024, ACTOR);

    expect(outcome.organisation.storageQuotaBytes).toBe(10 * 1024 * 1024 * 1024);
    expect(outcome.event.action).toBe('organisation.storage_quota_updated');
    expect(outcome.event.metadata).toEqual({
      from: String(DEFAULT_STORAGE_QUOTA_BYTES),
      to: String(10 * 1024 * 1024 * 1024),
    });
  });

  it('rejects a non-positive quota — the operator override does not bypass basic coherence', () => {
    expect(() => updateStorageQuota(existing, -1, ACTOR)).toThrow(InvariantViolation);
    expect(() => updateStorageQuota(existing, 0, ACTOR)).toThrow(InvariantViolation);
  });

  it('rejects a non-integer quota', () => {
    expect(() => updateStorageQuota(existing, 1.5, ACTOR)).toThrow(InvariantViolation);
  });

  it('does not mutate the input organisation', () => {
    updateStorageQuota(existing, 1024, ACTOR);
    expect(existing.storageQuotaBytes).toBe(DEFAULT_STORAGE_QUOTA_BYTES);
  });
});
