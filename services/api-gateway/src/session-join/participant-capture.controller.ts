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
  Injectable,
  Inject,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AttachmentUploadInterceptor } from '../storage/attachment-upload.interceptor.js';
import type { Request } from 'express';

import {
  participantCaptureConsentRequestSchema,
  participantCaptureEvidenceRequestSchema,
  type EvidenceAttachmentView,
  type ParticipantCaptureContextView,
  type ParticipantCaptureEvidenceResult,
} from '@witness/contracts';

import { ParticipantCaptureService } from './participant-capture.service.js';

const CAPTURE_TOKEN_HEADER = 'x-witness-capture-token';
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

@Injectable()
export class CaptureAttachmentGuard implements CanActivate {
  constructor(
    @Inject(ParticipantCaptureService) private readonly capture: ParticipantCaptureService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = requireCaptureToken(request.headers[CAPTURE_TOKEN_HEADER]);
    const evidenceId = request.params['evidenceId'];
    if (
      typeof evidenceId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidenceId)
    )
      throw new BadRequestException('A valid evidence identifier is required.');
    await this.capture.authorizeAttachment(token, evidenceId);
    return true;
  }
}

@Controller('api/v1/participant-capture')
export class ParticipantCaptureController {
  constructor(
    @Inject(ParticipantCaptureService) private readonly capture: ParticipantCaptureService,
  ) {}

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
  @UseGuards(CaptureAttachmentGuard)
  @UseInterceptors(AttachmentUploadInterceptor)
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
    await this.capture.captureConsent(token, parsed.data);
    return { status: 'captured' };
  }
}
