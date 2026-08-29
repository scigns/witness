import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { issueInvoiceRequestSchema, type InvoiceView } from '@witness/contracts';
import { DomainError } from '@witness/domain';
import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { InvoicesService } from './invoices.service.js';
import { renderInvoiceHtml } from './invoice-render.js';

@Controller('api/v1/organisations/:organisationId/invoices')
@UseGuards(AuthorizationGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}
  @Post()
  @Requires('invoice:create')
  async issue(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<InvoiceView> {
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
  @Get(':invoiceId')
  @Requires('invoice:read')
  get(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
  ): Promise<InvoiceView> {
    return this.invoices.get(organisationId, invoiceId);
  }
  @Get(':invoiceId/render')
  @Requires('invoice:render')
  async render(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Res() response: Response,
  ): Promise<void> {
    const invoice = await this.invoices.render(organisationId, invoiceId);
    response
      .type('html')
      .set('Cache-Control', 'no-store')
      .set('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.html"`)
      .send(renderInvoiceHtml(invoice));
  }
}
