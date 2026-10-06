import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { commercialChangeRequestSchema, issueInvoiceRequestSchema } from '@witness/contracts';
import { DomainError } from '@witness/domain';
import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { CommercialCatalogueService } from '../commercial/commercial-catalogue.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';

/** Financial origination requires the same verified platform authority as settlement.
 * Customer-scoped billing routes keep their existing membership requirements.
 */
@Controller('api/v1/operator/organisations/:organisationId/origination')
@UseGuards(AuthorizationGuard)
export class OperatorOriginationController {
  constructor(
    private readonly commercial: CommercialCatalogueService,
    private readonly invoices: InvoicesService,
  ) {}

  @Post('change-requests')
  @Requires('payment:settle')
  requestChange(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ) {
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

  @Post('invoices')
  @Requires('payment:settle')
  async issueInvoice(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ) {
    const parsed = issueInvoiceRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The invoice request is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    try {
      return await this.invoices.issue(organisationId, parsed.data, request.principal!);
    } catch (error) {
      if (error instanceof DomainError)
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      throw error;
    }
  }
}
