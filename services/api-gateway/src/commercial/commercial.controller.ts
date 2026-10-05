import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  commercialChangeRequestSchema,
  createSubscriptionEntitlementOverrideRequestSchema,
  type BillingOverview,
  type CommercialChangeView,
  type EffectiveCommercialConfigurationView,
  type PublicPlanCatalogue,
  type SubscriptionEntitlementOverrideView,
} from '@witness/contracts';
import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { CommercialCatalogueService } from './commercial-catalogue.service.js';
import { CommercialOverrideService } from './commercial-override.service.js';
import { EffectiveCommercialConfigurationService } from './effective-commercial-configuration.service.js';
import { OrganisationsService } from '../organisations/organisations.service.js';
import { OrganisationUsageService } from '../organisations/organisation-usage.service.js';

@Controller('api/v1/plans')
export class PublicCommercialController {
  constructor(private readonly commercial: CommercialCatalogueService) {}
  @Get()
  catalogue(): Promise<PublicPlanCatalogue> {
    return this.commercial.catalogue();
  }
}

@Controller('api/v1/organisations/:organisationId/billing')
@UseGuards(AuthorizationGuard)
export class BillingController {
  constructor(private readonly commercial: CommercialCatalogueService) {}
  @Get()
  @Requires('organisation:update')
  overview(@Param('organisationId') organisationId: string): Promise<BillingOverview> {
    return this.commercial.overview(organisationId);
  }
  @Post('change-requests')
  @Requires('organisation:update')
  requestChange(
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CommercialChangeView> {
    const parsed = commercialChangeRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The commercial change request is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    return this.commercial.requestChange(organisationId, parsed.data, request.principal!);
  }
}

/**
 * Self-service view of what an organisation's own subscription actually
 * grants it (ADR-0034's sibling commercial-entitlement work). Reuses
 * 'organisation:read' -- already granted broadly to every membership tier
 * -- rather than a new action: this is informational capability summary,
 * not the full billing surface (invoices, payment methods) `BillingController`
 * guards behind the stricter 'organisation:update'. Deliberately excludes
 * each entitlement's override `reason` text; see
 * `EffectiveCommercialConfigurationView`'s own doc comment for why.
 */
@Controller('api/v1/organisations/:organisationId/commercial-configuration')
@UseGuards(AuthorizationGuard)
export class CommercialConfigurationController {
  constructor(private readonly configuration: EffectiveCommercialConfigurationService) {}

  @Get()
  @Requires('organisation:read')
  resolve(
    @Param('organisationId') organisationId: string,
  ): Promise<EffectiveCommercialConfigurationView> {
    return this.configuration.resolveFor(organisationId);
  }
}

/**
 * Platform-administration inspection and override management. Gated through
 * PLATFORM_ONLY_ACTIONS ('operator:read' for inspection, the new
 * 'commercial_override:manage' for writes) -- an organisation-scoped admin,
 * however senior within their own organisation, never reaches this surface.
 */
@Controller('api/v1/operator/organisations/:organisationId/commercial-configuration')
@UseGuards(AuthorizationGuard)
export class OperatorCommercialConfigurationController {
  constructor(
    private readonly configuration: EffectiveCommercialConfigurationService,
    private readonly overrides: CommercialOverrideService,
    private readonly organisations: OrganisationsService,
    private readonly organisationUsage: OrganisationUsageService,
  ) {}

  @Get('storage')
  @Requires('operator:read')
  storage(@Param('organisationId') organisationId: string) {
    return this.organisations.storage(organisationId);
  }

  @Get('usage')
  @Requires('operator:read')
  usage(@Param('organisationId') organisationId: string) {
    return this.organisationUsage.usage(organisationId);
  }

  @Get()
  @Requires('operator:read')
  resolve(
    @Param('organisationId') organisationId: string,
  ): Promise<EffectiveCommercialConfigurationView> {
    return this.configuration.resolveFor(organisationId);
  }

  @Get('overrides')
  @Requires('operator:read')
  listOverrides(
    @Param('organisationId') organisationId: string,
  ): Promise<SubscriptionEntitlementOverrideView[]> {
    return this.overrides.listFor(organisationId);
  }

  @Post('overrides')
  @Requires('commercial_override:manage')
  setOverride(
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<SubscriptionEntitlementOverrideView> {
    const parsed = createSubscriptionEntitlementOverrideRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The commercial override request is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    return this.overrides.upsert(organisationId, parsed.data, request.principal!);
  }
}
