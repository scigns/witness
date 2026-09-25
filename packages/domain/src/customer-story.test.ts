import { describe, expect, it } from 'vitest';

import { createActor } from './actor.js';
import {
  approveCustomerStory,
  editCustomerStoryWording,
  isPubliclyVisible,
  mayOfferTestimonial,
  proposeCustomerStory,
  publishCustomerStory,
  rejectCustomerStory,
  unpublishCustomerStory,
  withdrawCustomerStoryConsent,
  type CustomerStory,
} from './customer-story.js';
import { InvariantViolation } from './errors.js';
import { submitProductFeedback } from './product-feedback.js';
import {
  toActorId,
  toCustomerStoryId,
  toOrganisationId,
  toProductFeedbackId,
  toWorkspaceId,
} from './ids.js';

const organisationId = toOrganisationId('11111111-1111-4111-8111-111111111111');
const workspaceId = toWorkspaceId('22222222-2222-4222-8222-222222222222');
const feedbackId = toProductFeedbackId('33333333-3333-4333-8333-333333333333');
const storyId = toCustomerStoryId('55555555-5555-4555-8555-555555555555');
const at = new Date('2026-09-25T00:00:00.000Z');
const later = new Date('2026-09-26T00:00:00.000Z');

const participant = createActor({
  id: toActorId('44444444-4444-4444-8444-444444444444'),
  kind: 'human',
  displayName: 'A. Participant',
});
const moderator = createActor({
  id: toActorId('66666666-6666-4666-8666-666666666666'),
  kind: 'human',
  displayName: 'A. Moderator',
});
const platformPublisher = createActor({
  id: toActorId('77777777-7777-4777-8777-777777777777'),
  kind: 'human',
  displayName: 'A. Publisher',
});
const model = createActor({
  id: toActorId('88888888-8888-4888-8888-888888888888'),
  kind: 'model',
  displayName: 'gpt:1',
});

function positiveFeedback(comment: string | null = 'This made co-design so much easier.') {
  return submitProductFeedback({
    id: feedbackId,
    organisationId,
    workspaceId,
    productArea: 'facilitation',
    moment: 'facilitator_recap',
    rating: 5,
    comment,
    submittedBy: participant,
    at,
  }).feedback;
}

function negativeFeedback() {
  return submitProductFeedback({
    id: feedbackId,
    organisationId,
    workspaceId,
    productArea: 'facilitation',
    moment: 'facilitator_recap',
    rating: 2,
    submittedBy: participant,
    at,
  }).feedback;
}

function candidateStory(
  overrides: { consentChoice?: string; organisationAttributionConsent?: boolean } = {},
) {
  const outcome = proposeCustomerStory({
    id: storyId,
    feedback: positiveFeedback(),
    consentChoice: overrides.consentChoice ?? 'anonymous',
    organisationAttributionConsent: overrides.organisationAttributionConsent ?? false,
    at,
  });
  if (outcome === null) throw new Error('expected a candidate to be created');
  return outcome.story;
}

function curated(story: CustomerStory): CustomerStory {
  return editCustomerStoryWording(
    story,
    moderator,
    {
      quote: 'Witness made this workshop’s outcomes visible to everyone.',
      context: 'Community co-design session',
    },
    at,
  ).story;
}

describe('mayOfferTestimonial', () => {
  it('is true for positive feedback', () => {
    expect(mayOfferTestimonial(positiveFeedback())).toBe(true);
  });

  it('is false for non-positive feedback', () => {
    expect(mayOfferTestimonial(negativeFeedback())).toBe(false);
  });
});

describe('proposeCustomerStory', () => {
  it('returns null for a declined consent choice', () => {
    const outcome = proposeCustomerStory({
      id: storyId,
      feedback: positiveFeedback(),
      consentChoice: 'declined',
      organisationAttributionConsent: false,
      at,
    });
    expect(outcome).toBeNull();
  });

  it('creates a pending candidate for anonymous consent', () => {
    const story = candidateStory({ consentChoice: 'anonymous' });
    expect(story.moderationStatus).toBe('pending');
    expect(story.consentChoice).toBe('anonymous');
    expect(story.attributedName).toBeNull();
    expect(story.rawQuote).toBe('This made co-design so much easier.');
    expect(story.quote).toBeNull();
  });

  it('creates a pending candidate for named consent with an attributed name', () => {
    const outcome = proposeCustomerStory({
      id: storyId,
      feedback: positiveFeedback(),
      consentChoice: 'named',
      organisationAttributionConsent: false,
      attributedName: 'Alex Rivera',
      at,
    });
    expect(outcome?.story.consentChoice).toBe('named');
    expect(outcome?.story.attributedName).toBe('Alex Rivera');
  });

  it('throws if the underlying feedback was not positive, even called directly', () => {
    expect(() =>
      proposeCustomerStory({
        id: storyId,
        feedback: negativeFeedback(),
        consentChoice: 'anonymous',
        organisationAttributionConsent: false,
        at,
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects an attributed name on an anonymous consent choice', () => {
    expect(() =>
      proposeCustomerStory({
        id: storyId,
        feedback: positiveFeedback(),
        consentChoice: 'anonymous',
        organisationAttributionConsent: false,
        attributedName: 'Alex Rivera',
        at,
      }),
    ).toThrow(InvariantViolation);
  });
});

describe('editCustomerStoryWording', () => {
  it('sets curated quote and context, leaving rawQuote untouched', () => {
    const story = curated(candidateStory());
    expect(story.quote).toContain('Witness made');
    expect(story.rawQuote).toBe('This made co-design so much easier.');
  });

  it('rejects a non-human moderator', () => {
    expect(() =>
      editCustomerStoryWording(candidateStory(), model, { quote: 'Q', context: 'C' }, at),
    ).toThrow(InvariantViolation);
  });

  it('rejects an organisation label without organisation attribution consent', () => {
    const story = candidateStory({ organisationAttributionConsent: false });
    expect(() =>
      editCustomerStoryWording(
        story,
        moderator,
        { quote: 'Q', context: 'C', organisationLabel: 'Acme Co-op' },
        at,
      ),
    ).toThrow(InvariantViolation);
  });

  it('allows an organisation label when attribution was consented to', () => {
    const story = candidateStory({ organisationAttributionConsent: true });
    const edited = editCustomerStoryWording(
      story,
      moderator,
      { quote: 'Q', context: 'C', organisationLabel: 'Acme Co-op' },
      at,
    ).story;
    expect(edited.organisationLabel).toBe('Acme Co-op');
  });

  it('rejects editing a rejected story', () => {
    const rejected = rejectCustomerStory(
      curated(candidateStory()),
      moderator,
      'Not usable',
      at,
    ).story;
    expect(() =>
      editCustomerStoryWording(rejected, moderator, { quote: 'Q', context: 'C' }, at),
    ).toThrow(InvariantViolation);
  });
});

describe('approveCustomerStory / rejectCustomerStory', () => {
  it('approves a curated pending story', () => {
    const approved = approveCustomerStory(curated(candidateStory()), moderator, at).story;
    expect(approved.moderationStatus).toBe('approved');
    expect(approved.moderatedBy).toBe(moderator);
  });

  it('refuses to approve without curated wording', () => {
    expect(() => approveCustomerStory(candidateStory(), moderator, at)).toThrow(InvariantViolation);
  });

  it('refuses a non-human approver', () => {
    expect(() => approveCustomerStory(curated(candidateStory()), model, at)).toThrow(
      InvariantViolation,
    );
  });

  it('rejects with a required reason', () => {
    expect(() => rejectCustomerStory(candidateStory(), moderator, '   ', at)).toThrow(
      InvariantViolation,
    );
  });

  it('refuses to moderate an already-decided story', () => {
    const approved = approveCustomerStory(curated(candidateStory()), moderator, at).story;
    expect(() => approveCustomerStory(approved, moderator, later)).toThrow(InvariantViolation);
  });
});

describe('publishCustomerStory / unpublishCustomerStory', () => {
  function approvedStory(): CustomerStory {
    return approveCustomerStory(curated(candidateStory()), moderator, at).story;
  }

  it('publishes an approved, consent-valid story', () => {
    const published = publishCustomerStory(approvedStory(), platformPublisher, later).story;
    expect(published.publishedAt).toEqual(later);
    expect(isPubliclyVisible(published, later)).toBe(true);
  });

  it('refuses to publish a story that is not approved', () => {
    expect(() => publishCustomerStory(candidateStory(), platformPublisher, later)).toThrow(
      InvariantViolation,
    );
  });

  it('refuses to publish when consent has been withdrawn', () => {
    const withdrawn = withdrawCustomerStoryConsent(approvedStory(), moderator, later).story;
    expect(() => publishCustomerStory(withdrawn, platformPublisher, later)).toThrow(
      InvariantViolation,
    );
  });

  it('unpublish removes visibility but the story (and its history) still exists', () => {
    const published = publishCustomerStory(approvedStory(), platformPublisher, later).story;
    const unpublished = unpublishCustomerStory(published, platformPublisher, later).story;
    expect(unpublished.publishedAt).toBeNull();
    expect(isPubliclyVisible(unpublished, later)).toBe(false);
    expect(unpublished.moderationStatus).toBe('approved');
    expect(unpublished.id).toBe(published.id);
  });

  it('refuses to unpublish a story that is not published', () => {
    expect(() => unpublishCustomerStory(approvedStory(), platformPublisher, later)).toThrow(
      InvariantViolation,
    );
  });

  it('a republished story becomes visible again', () => {
    const published = publishCustomerStory(approvedStory(), platformPublisher, later).story;
    const unpublished = unpublishCustomerStory(published, platformPublisher, later).story;
    const republished = publishCustomerStory(unpublished, platformPublisher, later).story;
    expect(isPubliclyVisible(republished, later)).toBe(true);
  });
});

describe('withdrawCustomerStoryConsent', () => {
  it('is one-way and idempotent-guarded', () => {
    const withdrawn = withdrawCustomerStoryConsent(candidateStory(), moderator, at).story;
    expect(withdrawn.consentWithdrawnAt).toEqual(at);
    expect(() => withdrawCustomerStoryConsent(withdrawn, moderator, later)).toThrow(
      InvariantViolation,
    );
  });

  it('immediately hides an already-published story even without an explicit unpublish', () => {
    const published = publishCustomerStory(
      approveCustomerStory(curated(candidateStory()), moderator, at).story,
      platformPublisher,
      at,
    ).story;
    const withdrawn = withdrawCustomerStoryConsent(published, moderator, later).story;
    expect(isPubliclyVisible(withdrawn, later)).toBe(false);
  });
});

describe('isPubliclyVisible', () => {
  it('is false for a pending story', () => {
    expect(isPubliclyVisible(candidateStory(), at)).toBe(false);
  });

  it('is false for an approved but unpublished story', () => {
    const approved = approveCustomerStory(curated(candidateStory()), moderator, at).story;
    expect(isPubliclyVisible(approved, at)).toBe(false);
  });
});
