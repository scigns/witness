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
  type BillingOverview,
  type CommercialChangeView,
  type PublicPlanCatalogue,
} from '@witness/contracts';
import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { CommercialCatalogueService } from './commercial-catalogue.service.js';

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
