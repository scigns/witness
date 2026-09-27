import { describe, expect, it } from 'vitest';

import { computeAppState, type AppStateInputs } from './app-state.js';

const BASE: AppStateInputs = {
  hasJoinToken: false,
  hasStoredSession: false,
  joinContextLoaded: false,
  joinContextJoinable: false,
  joining: false,
  captureContextLoaded: false,
  captureContextError: null,
  needsConsent: false,
  isOnline: true,
  submitting: false,
  submitted: false,
};

describe('computeAppState', () => {
  it('is NO_SESSION with no token and no stored session — nothing to do but wait for a link', () => {
    expect(computeAppState(BASE)).toBe('NO_SESSION');
  });

  it('moves to SESSION_CONTEXT once a join token is present, before joining starts', () => {
    expect(computeAppState({ ...BASE, hasJoinToken: true, joinContextLoaded: true })).toBe(
      'SESSION_CONTEXT',
    );
  });

  it('is JOINING while the join call is in flight', () => {
    expect(
      computeAppState({ ...BASE, hasJoinToken: true, joinContextLoaded: true, joining: true }),
    ).toBe('JOINING');
  });

  it('is PARTICIPATING once a session is stored, its context loaded, and nothing else is pending', () => {
    expect(computeAppState({ ...BASE, hasStoredSession: true, captureContextLoaded: true })).toBe(
      'PARTICIPATING',
    );
  });

  it('is CONSENT_REQUIRED when participating but consent has not been granted yet', () => {
    expect(
      computeAppState({
        ...BASE,
        hasStoredSession: true,
        captureContextLoaded: true,
        needsConsent: true,
      }),
    ).toBe('CONSENT_REQUIRED');
  });

  it('SUBMITTING outranks a pending consent prompt — never interrupt an in-flight submission', () => {
    expect(
      computeAppState({
        ...BASE,
        hasStoredSession: true,
        captureContextLoaded: true,
        needsConsent: true,
        submitting: true,
      }),
    ).toBe('SUBMITTING');
  });

  it('OFFLINE outranks a pending consent prompt', () => {
    expect(
      computeAppState({
        ...BASE,
        hasStoredSession: true,
        captureContextLoaded: true,
        needsConsent: true,
        isOnline: false,
      }),
    ).toBe('OFFLINE');
  });

  it('OFFLINE outranks SUBMITTED — connectivity is checked before the confirmation state', () => {
    expect(
      computeAppState({
        ...BASE,
        hasStoredSession: true,
        captureContextLoaded: true,
        isOnline: false,
        submitted: true,
      }),
    ).toBe('OFFLINE');
  });

  it('is SUBMITTED only once the backend has actually confirmed — never optimistic', () => {
    expect(
      computeAppState({
        ...BASE,
        hasStoredSession: true,
        captureContextLoaded: true,
        submitted: true,
      }),
    ).toBe('SUBMITTED');
  });

  it('TOKEN_EXPIRED overrides every other signal, including an in-flight submission', () => {
    expect(
      computeAppState({
        ...BASE,
        hasStoredSession: true,
        captureContextLoaded: true,
        captureContextError: 'expired',
        submitting: true,
      }),
    ).toBe('TOKEN_EXPIRED');

    expect(
      computeAppState({
        ...BASE,
        hasStoredSession: true,
        captureContextError: 'revoked',
      }),
    ).toBe('TOKEN_EXPIRED');
  });

  it('SESSION_UNAVAILABLE is distinct from TOKEN_EXPIRED — a dead session is not an invalid credential', () => {
    expect(
      computeAppState({
        ...BASE,
        hasStoredSession: true,
        captureContextError: 'unavailable',
      }),
    ).toBe('SESSION_UNAVAILABLE');
  });

  it('a stored session with no successfully loaded context yet is not silently treated as PARTICIPATING', () => {
    expect(computeAppState({ ...BASE, hasStoredSession: true })).not.toBe('PARTICIPATING');
  });
});
