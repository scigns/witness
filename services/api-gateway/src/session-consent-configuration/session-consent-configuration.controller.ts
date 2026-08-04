/**
 * HTTP adapter for session consent configuration (BUILD_ROADMAP.md
 * Milestone 4, Consent Management).
 *
 * Nested under `:workspaceId/sessions/:sessionId`, mirroring
 * `ParticipantsController` — Casbin scoping falls out of the same
 * `AuthorizationGuard.resolveScope` behaviour, no guard change needed.
 *
 * `configure` (`POST`, first attachment) and `reconfigure` (`PATCH`,
 * replacing an existing one) are deliberately separate routes rather than
 * one upsert — the domain layer itself distinguishes `configureSessionConsent`
 * from `reconfigureSessionConsent` (the latter requires an existing
 * configuration and takes `expectedVersion`), and collapsing them into one
 * route would hide that a stale-version conflict is only meaningful for the
 * second one.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  configureSessionConsentRequestSchema,
  reconfigureSessionConsentRequestSchema,
  type SessionConsentConfigurationView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { SessionConsentConfigurationService } from './session-consent-configuration.service.js';

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/consent-configuration')
@UseGuards(AuthorizationGuard)
export class SessionConsentConfigurationController {
  constructor(private readonly configurations: SessionConsentConfigurationService) {}

  @Get()
  @Requires('session_consent:read')
  async get(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionConsentConfigurationView> {
    return this.configurations.get(workspaceId, sessionId);
  }

  @Post()
  @Requires('session_consent:manage')
  async configure(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionConsentConfigurationView> {
    const parsed = configureSessionConsentRequestSchema.safeParse(body);

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
      this.configurations.configure(workspaceId, sessionId, parsed.data, request.principal!),
    );
  }

  @Patch()
  @Requires('session_consent:manage')
  async reconfigure(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SessionConsentConfigurationView> {
    const parsed = reconfigureSessionConsentRequestSchema.safeParse(body);

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
      this.configurations.reconfigure(workspaceId, sessionId, parsed.data, request.principal!),
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
