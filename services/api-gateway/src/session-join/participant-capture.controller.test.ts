/**
 * MOBILE-002: a real physical-device acceptance test found that a domain
 * `InvariantViolation` thrown while capturing participant consent (e.g. a
 * session's consent configuration and the categories a client submits have
 * drifted out of sync) was reaching the participant as an unhandled 500,
 * shown on the phone as a generic "Something went wrong on the server" —
 * not the clear 400 the same domain error already produces on the
 * facilitator-authenticated sibling endpoint
 * (`participant-consent-records.controller.ts`'s `translateDomainErrors`).
 * `packages/domain/src/errors.ts` is explicit that translating a `DomainError`
 * into a transport-specific response is the adapter's job — this controller
 * was the one adapter in the participant-capture module that never did it.
 */

import { BadRequestException } from '@nestjs/common';
import { InvariantViolation } from '@witness/domain';
import { describe, expect, it, vi } from 'vitest';

import { ParticipantCaptureController } from './participant-capture.controller.js';
import type { ParticipantCaptureService } from './participant-capture.service.js';

function fakeCapture(overrides: Partial<ParticipantCaptureService> = {}) {
  return {
    context: vi.fn(),
    captureEvidence: vi.fn(),
    uploadAttachment: vi.fn(),
    captureConsent: vi.fn(),
    captureFeedback: vi.fn(),
    captureTestimonialConsent: vi.fn(),
    ...overrides,
  } as unknown as ParticipantCaptureService;
}

describe('ParticipantCaptureController.captureConsent — domain error translation', () => {
  it('translates a DomainError from the service into a 400, not an unhandled 500', async () => {
    const capture = fakeCapture({
      captureConsent: vi
        .fn()
        .mockRejectedValue(
          new InvariantViolation(
            "Category 'anonymous_quotation' is not part of this session's consent configuration.",
            'CATEGORY_NOT_IN_CONFIGURATION',
          ),
        ),
    });
    const controller = new ParticipantCaptureController(capture);

    await expect(
      controller.captureConsent('token', {
        categoryDecisions: [{ category: 'anonymous_quotation', granted: true }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.captureConsent('token', {
        categoryDecisions: [{ category: 'anonymous_quotation', granted: true }],
      }),
    ).rejects.toMatchObject({
      response: { error: { code: 'CATEGORY_NOT_IN_CONFIGURATION' } },
    });
  });

  it('still returns captured status when the service succeeds', async () => {
    const capture = fakeCapture({ captureConsent: vi.fn().mockResolvedValue(undefined) });
    const controller = new ParticipantCaptureController(capture);

    await expect(
      controller.captureConsent('token', {
        categoryDecisions: [{ category: 'participation', granted: true }],
      }),
    ).resolves.toEqual({ status: 'captured' });
  });
});
