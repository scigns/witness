/**
 * HTTP adapter for participant self-capture (Phase 5, Workstreams 1.1-1.4).
 *
 * Deliberately NOT behind `AuthorizationGuard` — see
 * `participant-capture.service.ts`'s header for why. The capture token
 * travels as `X-Witness-Capture-Token`, a distinct header from the ordinary
 * `Authorization: Bearer <session token>` a signed-in Witness user sends,
 * because the two are not interchangeable: a capture token authorises
 * exactly one participant's capture actions in exactly one session, never a
 * Witness account's ordinary standing.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { DomainError } from '@witness/domain';

import {
  captureParticipantFeedbackRequestSchema,
  participantCaptureConsentRequestSchema,
  participantCaptureEvidenceRequestSchema,
  submitParticipantKnowledgeResponseRequestSchema,
  submitTestimonialConsentRequestSchema,
  type CustomerStoryView,
  type EvidenceAttachmentView,
  type FeaturedInsightView,
  type ParticipantCaptureContextView,
  type ParticipantCaptureEvidenceResult,
  type ParticipantPromptView,
  type ProductFeedbackView,
} from '@witness/contracts';

import { ParticipantCaptureService } from './participant-capture.service.js';

const CAPTURE_TOKEN_HEADER = 'x-witness-capture-token';
/** Mirrors `evidence.controller.ts`'s own ceiling — Multer's hard cap; the
 * real, configured limit is enforced inside `EvidenceAttachmentService`. */
const MULTER_HARD_CEILING_BYTES = 500 * 1024 * 1024;

function requireCaptureToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value.trim() === '') {
    throw new UnauthorizedException({
      error: {
        code: 'CAPTURE_TOKEN_REQUIRED',
        message: `A ${CAPTURE_TOKEN_HEADER} header is required.`,
      },
    });
  }
  return value;
}

@Controller('api/v1/participant-capture')
export class ParticipantCaptureController {
  constructor(private readonly capture: ParticipantCaptureService) {}

  @Get('me')
  async context(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
  ): Promise<ParticipantCaptureContextView> {
    return this.capture.context(requireCaptureToken(header));
  }

  @Post('evidence')
  async captureEvidence(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
    @Body() body: unknown,
  ): Promise<ParticipantCaptureEvidenceResult> {
    const token = requireCaptureToken(header);
    const parsed = participantCaptureEvidenceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.capture.captureEvidence(token, parsed.data);
  }

  @Post('evidence/:evidenceId/attachment')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async uploadAttachment(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<EvidenceAttachmentView> {
    const token = requireCaptureToken(header);
    return this.capture.uploadAttachment(token, evidenceId, file);
  }

  @Post('consent')
  async captureConsent(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
    @Body() body: unknown,
  ): Promise<{ status: 'captured' }> {
    const token = requireCaptureToken(header);
    const parsed = participantCaptureConsentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    await this.translateDomainErrors(() => this.capture.captureConsent(token, parsed.data));
    return { status: 'captured' };
  }

  @Post('feedback')
  async captureFeedback(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
    @Body() body: unknown,
  ): Promise<ProductFeedbackView> {
    const token = requireCaptureToken(header);
    const parsed = captureParticipantFeedbackRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.capture.captureFeedback(token, parsed.data);
  }

  @Post('feedback/:feedbackId/testimonial-consent')
  async captureTestimonialConsent(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
    @Param('feedbackId', ParseUUIDPipe) feedbackId: string,
    @Body() body: unknown,
  ): Promise<CustomerStoryView | null> {
    const token = requireCaptureToken(header);
    const parsed = submitTestimonialConsentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.capture.captureTestimonialConsent(token, feedbackId, parsed.data);
  }

  @Get('prompt')
  async getPrompt(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
  ): Promise<ParticipantPromptView | null> {
    const token = requireCaptureToken(header);
    return this.capture.getPrompt(token);
  }

  @Get('insights')
  async getInsights(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
  ): Promise<FeaturedInsightView[]> {
    const token = requireCaptureToken(header);
    return this.capture.getInsights(token);
  }

  @Post('insights/:insightId/response')
  async submitInsightResponse(
    @Headers(CAPTURE_TOKEN_HEADER) header: string | undefined,
    @Param('insightId', ParseUUIDPipe) insightId: string,
    @Body() body: unknown,
  ): Promise<{ status: 'captured' }> {
    const token = requireCaptureToken(header);
    const parsed = submitParticipantKnowledgeResponseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    await this.translateDomainErrors(() =>
      this.capture.submitInsightResponse(token, insightId, parsed.data),
    );
    return { status: 'captured' };
  }

  /**
   * `ParticipantConsentRecordsService.capture()` — which `captureConsent`
   * above delegates to — relies on its caller to translate a domain
   * `DomainError` into an HTTP response (`errors.ts`'s own stated design:
   * the domain layer knows nothing about transports). The
   * facilitator-authenticated sibling controller
   * (`participant-consent-records.controller.ts`) already does this; this
   * unauthenticated participant-facing path did not, so a real category/
   * configuration mismatch reached a real phone as an unhandled 500
   * ("Something went wrong on the server") instead of a clear 400 —
   * reproduced as MOBILE-002 during physical-device acceptance testing.
   */
  private async translateDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  }
}
