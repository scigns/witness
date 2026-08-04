/**
 * HTTP adapter for participant consent records and the facilitator
 * dashboard (BUILD_ROADMAP.md Milestone 4, Consent Management).
 *
 * Nested at session level (`:workspaceId/sessions/:sessionId`), not under
 * `ParticipantsController`'s own `/participants` base path — this
 * controller owns `/participants/:participantId/consent...` and
 * `/consent-dashboard`, distinct final routes from anything
 * `ParticipantsController` declares, so the two controllers coexist without
 * a routing conflict despite the overlapping prefix.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  captureParticipantConsentRequestSchema,
  withdrawParticipantConsentRequestSchema,
  type ConsentFacilitatorDashboardView,
  type ParticipantConsentRecordDetail,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { ParticipantConsentRecordsService } from './participant-consent-records.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId')
@UseGuards(AuthorizationGuard)
export class ParticipantConsentRecordsController {
  constructor(private readonly records: ParticipantConsentRecordsService) {}

  @Get('consent-dashboard')
  @Requires('participant_consent:read')
  async dashboard(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<ConsentFacilitatorDashboardView> {
    return this.records.dashboard(workspaceId, sessionId);
  }

  @Get('participants/:participantId/consent')
  @Requires('participant_consent:read')
  async getActive(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<ParticipantConsentRecordDetail> {
    return this.records.getActive(workspaceId, sessionId, participantId, request.principal!);
  }

  @Get('participants/:participantId/consent/history')
  @Requires('participant_consent:read')
  async history(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<{ records: ParticipantConsentRecordDetail[] }> {
    return {
      records: await this.records.history(
        workspaceId,
        sessionId,
        participantId,
        request.principal!,
      ),
    };
  }

  @Post('participants/:participantId/consent')
  @Requires('participant_consent:manage')
  async capture(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ParticipantConsentRecordDetail> {
    const parsed = captureParticipantConsentRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.records.capture(workspaceId, sessionId, participantId, parsed.data, request.principal!),
    );
  }

  @Post('participants/:participantId/consent/amend')
  @Requires('participant_consent:manage')
  async amend(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ParticipantConsentRecordDetail> {
    const parsed = captureParticipantConsentRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.records.amend(workspaceId, sessionId, participantId, parsed.data, request.principal!),
    );
  }

  @Post('participants/:participantId/consent/withdraw')
  @HttpCode(200)
  @Requires('participant_consent:manage')
  async withdraw(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ParticipantConsentRecordDetail> {
    const parsed = withdrawParticipantConsentRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.records.withdraw(workspaceId, sessionId, participantId, parsed.data, request.principal!),
    );
  }

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
