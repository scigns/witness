/**
 * HTTP adapter for consent templates (BUILD_ROADMAP.md Milestone 4, Consent
 * Management).
 *
 * Nested under `:organisationId`, not `:workspaceId` — a template is an
 * organisation-wide governance artifact by default (`workspaceId` is an
 * optional field on the create request, not a route segment), and
 * `AuthorizationGuard.resolveScope` prefers `organisationId` over
 * `workspaceId` when both could apply, so this nesting Casbin-scopes every
 * template action to the organisation without any guard change.
 *
 * `GET :templateId/versions` is declared after `GET :templateId` (both
 * static-vs-param ordering concerns from `ParticipantsController` do not
 * apply here — `versions` is a suffix on an already-bound param, not a
 * sibling route, so there is no swallowing risk).
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
  consentTemplateActionSchema,
  createConsentTemplateRequestSchema,
  createConsentTemplateVersionRequestSchema,
  type ConsentTemplateDetail,
  type ConsentTemplateSummary,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { ConsentTemplatesService } from './consent-templates.service.js';

@Controller('api/v1/organisations/:organisationId/consent-templates')
@UseGuards(AuthorizationGuard)
export class ConsentTemplatesController {
  constructor(private readonly templates: ConsentTemplatesService) {}

  @Get()
  @Requires('consent_template:read')
  async list(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
  ): Promise<{ templates: ConsentTemplateSummary[] }> {
    return { templates: await this.templates.list(organisationId) };
  }

  @Get(':templateId')
  @Requires('consent_template:read')
  async get(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<ConsentTemplateDetail> {
    return this.templates.get(organisationId, templateId);
  }

  @Get(':templateId/versions')
  @Requires('consent_template:read')
  async versions(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<{ versions: ConsentTemplateDetail[] }> {
    return { versions: await this.templates.versions(organisationId, templateId) };
  }

  @Post()
  @Requires('consent_template:manage')
  async create(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ConsentTemplateDetail> {
    const parsed = createConsentTemplateRequestSchema.safeParse(body);

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
      this.templates.create(organisationId, parsed.data, request.principal!),
    );
  }

  @Post(':templateId/versions')
  @Requires('consent_template:manage')
  async createVersion(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ConsentTemplateDetail> {
    const parsed = createConsentTemplateVersionRequestSchema.safeParse(body);

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
      this.templates.createVersion(organisationId, templateId, parsed.data, request.principal!),
    );
  }

  @Post(':templateId/actions')
  @HttpCode(200)
  @Requires('consent_template:manage')
  async applyAction(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ConsentTemplateDetail> {
    const parsed = consentTemplateActionSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The action is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.templates.applyAction(organisationId, templateId, parsed.data, request.principal!),
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
