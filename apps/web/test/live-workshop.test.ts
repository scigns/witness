import { describe, expect, it } from 'vitest';

import {
  isReceived,
  shouldReturnToPromptAfterWaiting,
  shouldShowNextActionChoices,
  shouldShowSessionEndState,
  sumResponseTally,
} from '../src/lib/live-workshop';

describe('isReceived', () => {
  it('is true only for the two backend-confirmed outcomes', () => {
    expect(isReceived('received')).toBe(true);
    expect(isReceived('saved_offline')).toBe(true);
  });

  it('is false before the backend has confirmed anything', () => {
    expect(isReceived('idle')).toBe(false);
    expect(isReceived('sending')).toBe(false);
    expect(isReceived('failed')).toBe(false);
  });
});

describe('shouldShowNextActionChoices', () => {
  it('appears once a contribution is received and no choice has been made yet', () => {
    expect(shouldShowNextActionChoices('received', null)).toBe(true);
    expect(shouldShowNextActionChoices('saved_offline', null)).toBe(true);
  });

  it('never appears before the backend has confirmed the contribution', () => {
    expect(shouldShowNextActionChoices('sending', null)).toBe(false);
    expect(shouldShowNextActionChoices('idle', null)).toBe(false);
    expect(shouldShowNextActionChoices('failed', null)).toBe(false);
  });

  it('disappears once the participant has made a choice, even though the phase is still "received"', () => {
    expect(shouldShowNextActionChoices('received', 'waiting')).toBe(false);
    expect(shouldShowNextActionChoices('received', 'done')).toBe(false);
  });
});

describe('shouldShowSessionEndState', () => {
  it('appears when the session itself has closed, regardless of any personal choice', () => {
    expect(shouldShowSessionEndState('closed', null)).toBe(true);
    expect(shouldShowSessionEndState('closed', 'waiting')).toBe(true);
  });

  it('appears when the participant explicitly chose "I\'m done for now", even mid-session', () => {
    expect(shouldShowSessionEndState('open', 'done')).toBe(true);
  });

  it('does not appear merely because the session is open and no choice has been made', () => {
    expect(shouldShowSessionEndState('open', null)).toBe(false);
    expect(shouldShowSessionEndState('open', 'waiting')).toBe(false);
  });
});

describe('shouldReturnToPromptAfterWaiting', () => {
  it('returns to the recorder when a genuinely new prompt becomes current while waiting', () => {
    expect(shouldReturnToPromptAfterWaiting('waiting', 'prompt-1', 'prompt-2')).toBe(true);
    expect(shouldReturnToPromptAfterWaiting('waiting', null, 'prompt-1')).toBe(true);
  });

  it('does not fire when not in the "waiting" state, even if the prompt changed', () => {
    expect(shouldReturnToPromptAfterWaiting(null, 'prompt-1', 'prompt-2')).toBe(false);
    expect(shouldReturnToPromptAfterWaiting('done', 'prompt-1', 'prompt-2')).toBe(false);
  });

  it('does not fire when the prompt is unchanged, including two consecutive nulls', () => {
    expect(shouldReturnToPromptAfterWaiting('waiting', 'prompt-1', 'prompt-1')).toBe(false);
    expect(shouldReturnToPromptAfterWaiting('waiting', null, null)).toBe(false);
  });

  it('does not fire when the room has gone back to no active prompt', () => {
    expect(shouldReturnToPromptAfterWaiting('waiting', 'prompt-1', null)).toBe(false);
  });
});

describe('sumResponseTally', () => {
  it('sums all four response types', () => {
    expect(
      sumResponseTally({ reflects: 3, needs_nuance: 1, missing_context: 0, sees_differently: 2 }),
    ).toBe(6);
  });

  it('is zero when nobody has responded yet', () => {
    expect(
      sumResponseTally({ reflects: 0, needs_nuance: 0, missing_context: 0, sees_differently: 0 }),
    ).toBe(0);
  });
});
