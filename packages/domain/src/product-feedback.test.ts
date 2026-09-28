import { describe, expect, it } from 'vitest';

import { createActor } from './actor.js';
import { InvariantViolation } from './errors.js';
import { toActorId, toOrganisationId, toProductFeedbackId, toWorkspaceId } from './ids.js';
import {
  isPositiveFeedback,
  submitProductFeedback,
  type SubmitProductFeedbackInput,
} from './product-feedback.js';

const organisationId = toOrganisationId('11111111-1111-4111-8111-111111111111');
const workspaceId = toWorkspaceId('22222222-2222-4222-8222-222222222222');
const feedbackId = toProductFeedbackId('33333333-3333-4333-8333-333333333333');
const at = new Date('2026-09-25T00:00:00.000Z');

const submittedBy = createActor({
  id: toActorId('44444444-4444-4444-8444-444444444444'),
  kind: 'human',
  displayName: 'A. Reviewer',
});

function submit(overrides: Partial<SubmitProductFeedbackInput> = {}) {
  return submitProductFeedback({
    id: feedbackId,
    organisationId,
    workspaceId,
    productArea: 'review',
    moment: 'reviewer_queue_cleared',
    rating: 4,
    submittedBy,
    at,
    ...overrides,
  });
}

describe('submitProductFeedback', () => {
  it('creates feedback with the given rating and area', () => {
    const { feedback } = submit();
    expect(feedback.rating).toBe(4);
    expect(feedback.productArea).toBe('review');
    expect(feedback.moment).toBe('reviewer_queue_cleared');
    expect(feedback.comment).toBeNull();
  });

  it('emits a product_feedback.submitted audit event', () => {
    const { event } = submit();
    expect(event.action).toBe('product_feedback.submitted');
    expect(event.actor).toBe(submittedBy);
  });

  it('rejects a rating below 1', () => {
    expect(() => submit({ rating: 0 })).toThrow(InvariantViolation);
  });

  it('rejects a rating above 5', () => {
    expect(() => submit({ rating: 6 })).toThrow(InvariantViolation);
  });

  it('rejects a non-integer rating', () => {
    expect(() => submit({ rating: 3.5 })).toThrow(InvariantViolation);
  });

  it('rejects an unrecognised moment', () => {
    expect(() => submit({ moment: 'not_a_moment' })).toThrow(InvariantViolation);
  });

  it('rejects a productArea that does not match the moment', () => {
    expect(() => submit({ moment: 'reviewer_queue_cleared', productArea: 'reporting' })).toThrow(
      InvariantViolation,
    );
  });

  it('rejects a comment with control characters', () => {
    expect(() => submit({ comment: 'helloworld' })).toThrow(InvariantViolation);
  });

  it('allows a comment containing newlines', () => {
    const { feedback } = submit({ comment: 'line one\nline two' });
    expect(feedback.comment).toBe('line one\nline two');
  });

  it('treats a blank comment as no comment', () => {
    const { feedback } = submit({ comment: '   ' });
    expect(feedback.comment).toBeNull();
  });
});

describe('isPositiveFeedback', () => {
  it('is true at the threshold rating of 4', () => {
    expect(isPositiveFeedback(submit({ rating: 4 }).feedback)).toBe(true);
  });

  it('is true for a perfect rating', () => {
    expect(isPositiveFeedback(submit({ rating: 5 }).feedback)).toBe(true);
  });

  it('is false below the threshold', () => {
    expect(isPositiveFeedback(submit({ rating: 3 }).feedback)).toBe(false);
  });
});
