/**
 * Help & Knowledge search (ADR-0032). `organisationId` is optional and,
 * when present, must be one the caller already belongs to — this route
 * does not grant any new visibility into an organisation's commercial
 * state, it only uses it (via the same `CommercialEntitlementService`
 * every billing route already uses) to decide whether an
 * entitlement-gated help chunk may be shown.
 */

import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { HelpSearchResponse } from '@witness/contracts';
import type { ResolvedEntitlements } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import { CommercialEntitlementService } from '../commercial/commercial-entitlement.service.js';
import { BUILD_INFO } from '../build-info.js';
import { HelpSearchService } from './help-search.service.js';

@Controller('api/v1/help')
@UseGuards(AuthorizationGuard)
export class HelpController {
  constructor(
    private readonly helpSearch: HelpSearchService,
    private readonly roleResolution: RoleResolutionService,
    private readonly commercialEntitlement: CommercialEntitlementService,
  ) {}

  @Get('search')
  @Requires('help_article:read')
  async search(
    @Query('q') q: unknown,
    @Query('organisationId') organisationId: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<HelpSearchResponse> {
    if (typeof q !== 'string' || q.trim() === '') {
      throw new BadRequestException({
        error: { code: 'VALIDATION_FAILED', message: 'Query parameter `q` is required.' },
      });
    }

    const entitlements = await this.resolveEntitlements(organisationId, request.principal!.subject);

    const results = await this.helpSearch.search(
      q,
      request.principal!,
      BUILD_INFO.version,
      entitlements,
    );

    return { query: q, appVersion: BUILD_INFO.version, results: [...results] };
  }

  /**
   * Fails closed, not open: an organisationId the caller cannot be shown to
   * belong to resolves to `null` (no entitlement grants), it never silently
   * reads another organisation's entitlements. `scopedGrantTiers` returning
   * an empty set is exactly "this principal has no standing here".
   */
  private async resolveEntitlements(
    organisationId: unknown,
    userId: string,
  ): Promise<ResolvedEntitlements | null> {
    if (typeof organisationId !== 'string' || organisationId.trim() === '') return null;

    const tiers = await this.roleResolution.scopedGrantTiers(userId, {
      type: 'organisation',
      organisationId,
    });
    if (tiers.length === 0) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: "You don't have permission to do that.",
        },
      });
    }

    return this.commercialEntitlement.forOrganisation(organisationId);
  }
}
